import { roomCheckConfig } from "@/config/room-check";
import { GAME_SERVERS, type GameServer } from "@/config/servers";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { isRoomCode } from "./parse";

/**
 * One room in this browser's list. `watchId` is the watch of a room the page opened (null once that watch is gone);
 * `created` marks a room this browser opened. An older saved list has neither, and loads as a room the page read.
 */
export interface SavedRoom {
  code: string;
  region: GameServer;
  watchId: string | null;
  created: boolean;
}

const isRegion = (value: unknown): value is GameServer => (GAME_SERVERS as readonly unknown[]).includes(value);

/** The rooms in this browser's list, newest first. Only codes, servers and the watches of rooms it opened are kept. */
export function loadSavedRooms(): SavedRoom[] {
  try {
    const list: unknown = JSON.parse(safeGetLocalStorage(storageKeys.roomCheckRooms) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry): entry is SavedRoom => !!entry && typeof entry === "object"
        && typeof entry.code === "string" && isRoomCode(entry.code) && isRegion(entry.region))
      .map((entry) => {
        const created = (entry as { created?: unknown }).created === true;
        const watchId = (entry as { watchId?: unknown }).watchId;
        return { code: entry.code, region: entry.region, watchId: created && typeof watchId === "string" && watchId !== "" ? watchId : null, created };
      })
      .slice(0, roomCheckConfig.maxRooms);
  } catch {
    return [];
  }
}

export function saveRooms(rooms: readonly SavedRoom[]): void {
  safeSetLocalStorage(storageKeys.roomCheckRooms, JSON.stringify(
    rooms.slice(0, roomCheckConfig.maxRooms).map(({ code, region, watchId, created }) => {
      if (!created) return { code, region };
      return watchId ? { code, region, watchId, created } : { code, region, created };
    }),
  ));
}
