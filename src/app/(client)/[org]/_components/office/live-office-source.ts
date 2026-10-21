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

function presenceChannel(roomId: string) {
  return `office:room:${encodeURIComponent(roomId)}:presence`;
}

/**
 * The building's floor plan is fixed; the rooms inside it are real. Each real
 * room takes the next free slot of its kind, so the organisation's own
 * channels and people end up in the rooms a visitor would expect.
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
    });
  }

  return rooms;
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

  async init(orgId: string, userId: string) {
    this.orgId = orgId;
    this.userId = userId;

    const response = await GetRequest("/office/bootstrap");
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
      await PutRequest(`/office/rooms/${encodeRoomId(roomId)}/layout`, payload);
      return;
    }

    await PostRequest(
      `/office/rooms/${encodeRoomId(roomId)}/layout/draft`,
      payload
    );
  }

  async publishLayout(roomId: string, items: OfficeFurnitureItem[]) {
    await this.saveLayout(roomId, items);
    await PostRequest(`/office/rooms/${encodeRoomId(roomId)}/layout/publish`, {
      version: 0,
    });
  }

  async resetLayout(roomId: string) {
    const response = await PostRequest(
      `/office/rooms/${encodeRoomId(roomId)}/layout/reset`,
      {}
    );
    const layout = response?.data?.data as
      | {
          items?: Array<{
            id: string;
            catalogId: string;
            x: number;
            y: number;
            rotation: number;
          }>;
        }
      | undefined;
    return (layout?.items ?? []).map(toSceneItem);
  }

  async saveAvatar(avatar: OfficeAvatarConfig) {
    await PutRequest("/users/me/avatar", avatar);
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
      await PostRequest(`/channels/${channelId}/messages`, payload);
    } else if (roomId.startsWith("personal:")) {
      await PostRequest(`/dms/messages/${channelId}`, payload);
    }

    return [];
  }

  async askZoe(question: string, context: OfficeZoeContext) {
    const response = await PostRequest("/office/zoe", {
      messages: [{ role: "user", content: question }],
      context: {
        location: "office",
        buildingId: this.orgId,
        room: context.room,
        nearbyUsers: context.nearbyUsers,
      },
    });

    const answer = response?.data?.data?.answer;
    if (typeof answer === "string" && answer.length > 0) {
      return answer;
    }

    throw new Error(
      response?.data?.message ?? "Zoe could not answer that right now."
    );
  }

  async enterRoom(roomId: string) {
    await PostRequest(`/office/rooms/${encodeRoomId(roomId)}/enter`, {});
  }

  async leaveRoom(roomId: string) {
    await PostRequest(`/office/rooms/${encodeRoomId(roomId)}/leave`, {});
  }

  subscribePresence(
    onPresence: (occupants: OfficeOccupant[]) => void
  ): () => void {
    const client = getSharedCentrifuge();
    const channel = presenceChannel("bootstrap");
    const subscription = prepareChannelSubscription(client, channel, {
      getToken: () => getSubscriptionToken(channel),
    });

    const onPublication = (ctx: any) => {
      const presence = ctx?.data?.presence as OfficeOccupant | undefined;
      if (!presence) return;
      onPresence([presence]);
    };

    subscription.on("publication", onPublication);
    subscription.subscribe();

    return () => {
      subscription.off("publication", onPublication);
      releaseChannelSubscription(client, channel, subscription);
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
