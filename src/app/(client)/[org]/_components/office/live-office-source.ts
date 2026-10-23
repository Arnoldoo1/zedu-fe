"use client";

import { GetRequest, PostRequest, PutRequest } from "~/utils/new-request";
import {
  getSharedCentrifuge,
  getSubscriptionToken,
  prepareChannelSubscription,
  releaseChannelSubscription,
} from "~/lib/centrifugo/shared-centrifuge";
import type {
  OfficeApiItem,
  OfficeApiRoom,
  OfficeAvatarConfig,
  OfficeBootstrap,
  OfficeChatMessage,
  OfficeFurnitureItem,
  OfficeOccupant,
  OfficeRoom,
  OfficeSource,
  OfficeZoeContext,
} from "~/types/office";
import { ROOMS } from "~/app/office/_components/office-data";

/** The API speaks two dimensions, the scene works in three. */
function toSceneItem(item: OfficeApiItem): OfficeFurnitureItem {
  return {
    id: item.id,
    catalogId: item.catalogId,
    x: item.x,
    z: item.y,
    rotation: (item.rotation as OfficeFurnitureItem["rotation"]) ?? 0,
    variant: item.variant,
  };
}

function toApiItem(item: OfficeFurnitureItem) {
  return {
    id: item.id,
    catalogId: item.catalogId,
    x: item.x,
    y: item.z,
    rotation: item.rotation,
    variant: item.variant,
  };
}

function encodeRoomId(roomId: string) {
  return encodeURIComponent(roomId);
}

function presenceChannel(orgId: string, floorIndex: number, roomId: string) {
  // The organisation and the floor are part of the channel name, so two
  // organisations can never share a room's presence.
  return `office:org:${orgId}:floor:${floorIndex}:room:${encodeURIComponent(
    roomId
  )}:presence`;
}

/**
 * The request helpers resolve with the error instead of throwing, so failures
 * are turned into an exception the office can show.
 */
function unwrap<T>(response: any, fallback: string): T {
  const status = response?.status;
  if (typeof status !== "number" || status >= 400) {
    throw new Error(response?.data?.message ?? fallback);
  }
  return response?.data?.data as T;
}

/**
 * Reads a server sent events answer into one string. The helper may stream
 * deltas or one final chunk, so every payload shape contributes its text.
 */
async function readEventStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  const take = (payload: string) => {
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload) as {
        delta?: string;
        text?: string;
        content?: string;
        answer?: string;
      };
      answer +=
        parsed.delta ?? parsed.text ?? parsed.content ?? parsed.answer ?? "";
    } catch {
      answer += payload;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        take(trimmed.slice("data:".length).trim());
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    take(tail.slice("data:".length).trim());
  }

  return answer.trim();
}

/**
 * The building's floor plan is fixed; the rooms inside it are real. Each real
 * room takes the next free slot of its kind, so the organisation's own
 * channels and people end up in the rooms a visitor would expect.
 *
 * Room bounds come from the API (OfficeApiRoom.bounds), which is the source
 * of truth. The static ROOMS slots are only used for description and fallback
 * capacity when the API doesn't provide one.
 */
function buildRooms(apiRooms: OfficeApiRoom[]): OfficeRoom[] {
  const slots: Record<string, OfficeRoom[]> = {
    channel: ROOMS.filter((room) => room.kind === "channel"),
    personal: ROOMS.filter((room) => room.kind === "personal"),
    meeting: ROOMS.filter((room) => room.kind === "meeting"),
    focus: ROOMS.filter((room) => room.kind === "focus"),
    lobby: ROOMS.filter((room) => room.kind === "lobby"),
    reception: ROOMS.filter((room) => room.kind === "reception"),
    lounge: ROOMS.filter((room) => room.kind === "lounge"),
  };

  const used: Record<string, number> = {};
  const rooms: OfficeRoom[] = [];

  for (const room of apiRooms) {
    const kind = room.kind as keyof typeof slots;
    const available = slots[kind] ?? [];
    const index = used[kind] ?? 0;
    used[kind] = index + 1;

    const slot = available[index] ?? available[available.length - 1];
    if (!slot) continue;

    rooms.push({
      ...slot,
      id: room.id,
      name: room.name,
      shortName: room.name,
      kind: room.kind,
      refId: room.refId,
      capacity: room.capacity || slot.capacity,
      locked: Boolean(room.isLocked),
      description: slot.description,
      ownerId: room.refId,
      // Use bounds from the API (source of truth) instead of static slot bounds.
      // Convert API bounds (x, y, w, h) to FE OfficeBounds (x, z, w, d).
      bounds: room.bounds
        ? {
            x: room.bounds.x,
            z: room.bounds.y,
            w: room.bounds.w,
            d: room.bounds.h,
          }
        : slot.bounds,
    });
  }

  return rooms;
}

/**
 * Raised when the organisation has switched the office off while the user
 * was in it. The route sends them back to the organisation landing.
 */
export class OfficeDisabledError extends Error {
  constructor() {
    super("The office is switched off for this organisation.");
    this.name = "OfficeDisabledError";
  }
}

/**
 * The live office. Rooms come from the organisation's real channels, direct
 * messages and people; layouts come from the office API; presence arrives over
 * Centrifugo. Nothing here falls back to seeded data.
 */
export class LiveOfficeSource implements OfficeSource {
  readonly mode = "live" as const;

  rooms: OfficeRoom[] = [];
  initialLayouts: Record<string, OfficeFurnitureItem[]> = {};
  initialMessages: Record<string, OfficeChatMessage[]> = {};
  initialAvatar: OfficeAvatarConfig = {
    tint: "#8b5cf6",
    body: "b",
    outfit: "smart",
    accessory: "glasses",
  };

  private orgId = "";
  private userId = "";
  private channelRoomMap: Record<string, string> = {};
  private dmOfficeMap: Record<string, string> = {};
  private dmRoomMap: Record<string, string> = {};
  private floorByRoom: Record<string, number> = {};

  async init(orgId: string, userId: string) {
    this.orgId = orgId;
    this.userId = userId;

    const response = await GetRequest("/office/bootstrap");
    const status = response?.status ?? response?.response?.status;

    if (status === 403) {
      throw new OfficeDisabledError();
    }

    const data = response?.data?.data as OfficeBootstrap | undefined;
    if (!data) {
      throw new Error(
        response?.data?.message ?? "The office could not be loaded right now."
      );
    }
    this.channelRoomMap = data.channelRoomMap ?? {};
    this.dmOfficeMap = data.dmOfficeMap ?? {};
    this.dmRoomMap = Object.fromEntries(
      Object.entries(this.dmOfficeMap).map(([dmChannelId, roomId]) => [
        roomId,
        dmChannelId,
      ])
    );

    this.rooms = buildRooms(data.rooms ?? []);
    this.floorByRoom = Object.fromEntries(
      (data.rooms ?? []).map((room) => [room.id, room.floorIndex ?? 0])
    );

    for (const [roomId, layout] of Object.entries(data.layouts ?? {})) {
      this.initialLayouts[roomId] = (layout.items ?? []).map(toSceneItem);
    }

    const avatarResponse = await GetRequest("/users/me/avatar");
    const avatar = avatarResponse?.data?.data as OfficeAvatarConfig | undefined;
    if (avatar?.tint) {
      this.initialAvatar = avatar;
    }
  }

  async loadLayouts() {
    return this.initialLayouts;
  }

  async saveLayout(roomId: string, items: OfficeFurnitureItem[]) {
    const payload = {
      grid: { width: 56, height: 36, tile: 1 },
      items: items.map(toApiItem),
    };

    const isPersonal = roomId.startsWith("personal:");
    if (isPersonal) {
      unwrap(
        await PutRequest(
          `/office/rooms/${encodeRoomId(roomId)}/layout`,
          payload
        ),
        "Your office could not be saved."
      );
      return;
    }

    unwrap(
      await PostRequest(
        `/office/rooms/${encodeRoomId(roomId)}/layout/draft`,
        payload
      ),
      "The draft could not be saved."
    );
  }

  async publishLayout(roomId: string, items: OfficeFurnitureItem[]) {
    // Load the current layout version first, so we can send it for optimistic
    // concurrency. The BE only conflicts when version > 0.
    const layoutResponse = await GetRequest(
      `/office/rooms/${encodeRoomId(roomId)}/layout`
    );
    let version = 0;
    if (layoutResponse?.data?.data?.version) {
      version = layoutResponse.data.data.version;
    }

    await this.saveLayout(roomId, items);
    unwrap(
      await PostRequest(
        `/office/rooms/${encodeRoomId(roomId)}/layout/publish`,
        { version }
      ),
      "The layout could not be published."
    );
  }

  async resetLayout(roomId: string) {
    const layout = unwrap<{ items?: OfficeApiItem[] } | undefined>(
      await PostRequest(
        `/office/rooms/${encodeRoomId(roomId)}/layout/reset`,
        {}
      ),
      "The room could not be reset."
    );
    return (layout?.items ?? []).map(toSceneItem);
  }

  async saveAvatar(avatar: OfficeAvatarConfig) {
    unwrap(
      await PutRequest("/users/me/avatar", avatar),
      "Your look could not be saved."
    );
  }

  async sendMessage(
    roomId: string,
    text: string
  ): Promise<OfficeChatMessage[]> {
    const channelId = this.channelIdForRoom(roomId);
    if (!channelId) return [];

    const payload = {
      content: text,
      channels_id: channelId,
      user_id: this.userId,
    };

    if (roomId.startsWith("channel:")) {
      unwrap(
        await PostRequest(`/channels/${channelId}/messages`, payload),
        "The message was not sent."
      );
    } else if (roomId.startsWith("personal:")) {
      unwrap(
        await PostRequest(`/dms/messages/${channelId}`, payload),
        "The message was not sent."
      );
    }

    return [];
  }

  async askZoe(question: string, context: OfficeZoeContext) {
    // Zoe is answered by the Next proxy route, which keeps the service token
    // on the server. The Go API has no /office/zoe endpoint.
    const token = localStorage.getItem("token") ?? "";
    const response = await fetch("/api/office/zoe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
        context: {
          location: "office",
          buildingId: this.orgId,
          room: context.room,
          nearbyUsers: context.nearbyUsers,
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Zoe could not answer that right now.");
    }

    if (
      (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ) {
      const streamed = await readEventStream(response);
      if (streamed.length > 0) {
        return streamed;
      }
      throw new Error("Zoe could not answer that right now.");
    }

    const payload = (await response.json().catch(() => null)) as {
      answer?: string;
      message?: string;
      data?: { answer?: string };
    } | null;
    const answer = payload?.data?.answer ?? payload?.answer ?? payload?.message;

    if (typeof answer === "string" && answer.length > 0) {
      return answer;
    }

    throw new Error("Zoe could not answer that right now.");
  }

  async enterRoom(roomId: string) {
    unwrap(
      await PostRequest(`/office/rooms/${encodeRoomId(roomId)}/enter`, {}),
      "The room could not be entered."
    );
  }

  async leaveRoom(roomId: string) {
    unwrap(
      await PostRequest(`/office/rooms/${encodeRoomId(roomId)}/leave`, {}),
      "The room could not be left."
    );
  }

  async fetchOccupants(roomId: string): Promise<OfficeOccupant[]> {
    // Centrifugo only carries what happens after a subscription, so the room
    // is read once to fill in the people who were already standing there.
    const response = await GetRequest(
      `/office/rooms/${encodeRoomId(roomId)}/occupants`
    );

    return (
      unwrap<OfficeOccupant[] | undefined>(
        response,
        "The room could not be read."
      ) ?? []
    );
  }

  private roster = new Map<string, OfficeOccupant>();

  subscribePresence(
    roomId: string,
    onPresence: (occupants: OfficeOccupant[]) => void
  ): () => void {
    const client = getSharedCentrifuge();
    // Presence is published per room, so the subscription has to be for the
    // room the user is standing in. The backend only signs a token for a
    // room it knows, so a made-up room id would be refused.
    const channel = presenceChannel(
      this.orgId,
      this.floorByRoom[roomId] ?? 0,
      roomId
    );
    const subscription = prepareChannelSubscription(client, channel, {
      getToken: () => getSubscriptionToken(channel),
    });

    const onPublication = (ctx: any) => {
      const presence = ctx?.data?.presence as OfficeOccupant | undefined;
      const eventType = ctx?.data?.type as string | undefined;
      if (!presence) return;

      if (eventType === "leave") {
        this.roster.delete(presence.userId);
      } else {
        this.roster.set(presence.userId, presence);
      }

      // Emit the complete roster so the UI never has stale entries.
      onPresence([...this.roster.values()]);
    };

    subscription.on("publication", onPublication);
    subscription.subscribe();

    return () => {
      subscription.off("publication", onPublication);
      releaseChannelSubscription(client, channel, subscription);
      // Clear the roster for this room so a subsequent subscription starts clean.
      this.roster.clear();
    };
  }

  /** The conversation behind a room, if it has one. */
  private channelIdForRoom(roomId: string): string | null {
    if (roomId.startsWith("channel:")) {
      return roomId.slice("channel:".length);
    }
    if (roomId.startsWith("personal:")) {
      return this.dmRoomMap[roomId] ?? null;
    }
    return null;
  }
}
