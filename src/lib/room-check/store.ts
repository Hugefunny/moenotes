import { roomCheckConfig } from "@/config/room-check";
import { GAME_SERVERS, type GameServer } from "@/config/servers";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { isRoomCode } from "./parse";

export interface SavedRoom {
  code: string;
  region: GameServer;
}

/** The rooms in this browser's list, newest first. Only codes and servers are kept, never what the rooms held. */
export function loadSavedRooms(): SavedRoom[] {
  try {
    const list: unknown = JSON.parse(safeGetLocalStorage(storageKeys.roomCheckRooms) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry): entry is SavedRoom => !!entry && typeof entry === "object"
        && typeof entry.code === "string" && isRoomCode(entry.code) && (GAME_SERVERS as readonly unknown[]).includes(entry.region))
      .slice(0, roomCheckConfig.maxRooms);
  } catch {
    return [];
  }
}

export function saveRooms(rooms: readonly SavedRoom[]): void {
  safeSetLocalStorage(storageKeys.roomCheckRooms, JSON.stringify(rooms.slice(0, roomCheckConfig.maxRooms).map(({ code, region }) => ({ code, region }))));
}
