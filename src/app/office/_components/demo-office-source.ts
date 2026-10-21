"use client";

import {
  CHAT_SEEDS,
  DEFAULT_AVATAR,
  DEMO_LAYOUTS,
  ROOMS,
  zoeAnswer,
  type FurnitureItem,
} from "./office-data";
import type {
  OfficeAvatarConfig,
  OfficeChatMessage,
  OfficeFurnitureItem,
  OfficeRoom,
  OfficeSource,
  OfficeZoeContext,
} from "~/types/office";

const KEY_LAYOUTS = "office-demo-layouts-v1";
const KEY_AVATAR = "office-demo-avatar-v1";

/** The demo lives entirely in the browser: seeded data plus localStorage. */
export const demoSource: OfficeSource = {
  mode: "demo",
  rooms: ROOMS as unknown as OfficeRoom[],
  initialLayouts: {},
  initialMessages: {},
  initialAvatar: DEFAULT_AVATAR,

  async loadLayouts() {
    const layouts: Record<string, OfficeFurnitureItem[]> = {};
    for (const room of ROOMS) {
      layouts[room.id] = (DEMO_LAYOUTS[room.id] ?? []).map(
        (item: FurnitureItem) => ({ ...item })
      );
    }

    try {
      const saved = localStorage.getItem(KEY_LAYOUTS);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<
          string,
          OfficeFurnitureItem[]
        >;
        for (const [roomId, items] of Object.entries(parsed)) {
          if (Array.isArray(items)) layouts[roomId] = items;
        }
      }
    } catch {
      // local storage is best effort in the demo
    }

    return layouts;
  },

  async saveLayout(roomId, items) {
    const layouts = readStoredLayouts();
    layouts[roomId] = items;
    writeStoredLayouts(layouts);
  },

  async publishLayout(roomId, items) {
    await this.saveLayout(roomId, items);
  },

  async resetLayout(roomId) {
    const defaults = (DEMO_LAYOUTS[roomId] ?? []).map(
      (item: FurnitureItem) => ({ ...item })
    );
    await this.saveLayout(roomId, defaults);
    return defaults;
  },

  async saveAvatar(avatar: OfficeAvatarConfig) {
    try {
      localStorage.setItem(KEY_AVATAR, JSON.stringify(avatar));
    } catch {
      // ignore
    }
  },

  async sendMessage(roomId, text) {
    const reply: OfficeChatMessage = {
      id: `demo-reply-${Date.now()}`,
      roomId,
      userId: "demo",
      name: "Teammate",
      text: "Sounds good.",
      at: Date.now(),
    };
    return [reply];
  },

  async askZoe(question: string, context: OfficeZoeContext) {
    const nearby = context.nearbyUsers.length
      ? context.nearbyUsers.map((user) => user.displayName).join(", ")
      : "nobody else in this room";
    const base = zoeAnswer(question, context.room.name);
    return `${base}\n\nNearby right now: ${nearby}.`;
  },

  async enterRoom() {
    // The demo has no server to tell.
  },

  async leaveRoom() {
    // The demo has no server to tell.
  },

  subscribePresence() {
    return () => {};
  },
};

function readStoredLayouts(): Record<string, OfficeFurnitureItem[]> {
  try {
    const saved = localStorage.getItem(KEY_LAYOUTS);
    return saved
      ? (JSON.parse(saved) as Record<string, OfficeFurnitureItem[]>)
      : {};
  } catch {
    return {};
  }
}

function writeStoredLayouts(layouts: Record<string, OfficeFurnitureItem[]>) {
  try {
    localStorage.setItem(KEY_LAYOUTS, JSON.stringify(layouts));
  } catch {
    // ignore
  }
}

/** Chat seeds for the demo, keyed by room id. */
export function demoChatSeeds(): Record<string, OfficeChatMessage[]> {
  return { ...CHAT_SEEDS } as unknown as Record<string, OfficeChatMessage[]>;
}

/** The avatar the demo starts with, restored from localStorage when present. */
export function demoAvatar(): OfficeAvatarConfig {
  try {
    const saved = localStorage.getItem(KEY_AVATAR);
    if (saved) {
      return { ...DEFAULT_AVATAR, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_AVATAR;
}
