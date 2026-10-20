import type { GameServer } from "@/config/servers";

/** A member card in a player's team, with its Snap. Skill levels start at 1; band gear bonuses are hundredths of a percent. */
export interface RoomUnit {
  cardId: number;
  level: number;
  /** Training count, 1–5. */
  awake: number;
  /** Card rank, 1–5. */
  rank: number;
  characterRank: number;
  skills: { live: number; leader: number; gekisou: number };
  bandItem: { performance: number; technique: number; visual: number };
  support: RoomSupport | null;
}

export interface RoomSupport {
  cardId: number;
  level: number;
  rank: number;
  /** Live-mode skill levels of the Snap's two skills. */
  skills: [number, number];
  /** Gekisou-mode skill levels of the Snap's two skills. */
  gekisouSkills: [number, number];
}

/** A player's team in deck slot order: `units[2]` is the leader. */
export interface RoomFormation {
  units: RoomUnit[];
  /** The team's performance order, as deck slot indexes. */
  order: number[];
  totalCharacterRank: number;
  vipRank: number;
}

export interface RoomPlayer {
  /** 1 for the first player in the room, counting up. */
  joinOrder: number;
  host: boolean;
  name: string;
  /** A stable short tag for the player within the service; not the game's player id. */
  idHash: string;
  color: number | null;
  /** The game's player state: 0 joined, 10 ready, 20 and up in the live. */
  state: number;
  ready: boolean;
  selection: { musicId: number | null; difficulty: number | null };
  /** Null when the team could not be read. */
  formation: RoomFormation | null;
}

export interface RoomSnapshot {
  code: string;
  region: GameServer;
  /** When the room was read (epoch ms). */
  fetchedAt: number;
  /** How old the read was when the service answered; the page adds the time since. */
  ageMs: number;
  /** `live`: read for this request; `cache`: a recent read shared by everyone who asked. */
  source: "live" | "cache";
  /** The earliest time the room can be read again (epoch ms). */
  nextRefreshAt: number;
  room: { musicId: number | null; missions: number[]; capacity: number; humans: number };
  players: RoomPlayer[];
}

export type RoomErrorCode =
  | "room_not_found"
  | "room_full"
  | "cooldown"
  | "busy"
  | "bad_code"
  | "internal"
  | "network"
  | "invalid"
  /** A room with the requested code already exists (`create`). */
  | "room_exists"
  /** Rooms cannot be opened right now (`create`). */
  | "bot_unavailable"
  /** The room no longer holds the observer (`leave`). */
  | "not_bot_room"
  /** The observer can only leave a room that already has four real players (`leave`). */
  | "not_at_four";

export interface RoomError {
  code: RoomErrorCode;
  /** When to retry, for `busy` and `cooldown`. */
  retryAfterMs: number | null;
  /** The last read, when the service still has one (`cooldown`). */
  snapshot: RoomSnapshot | null;
}

/** A read and when its answer arrived (the page's clock). */
export interface RoomRead {
  snapshot: RoomSnapshot;
  receivedAt: number;
}

/**
 * One room in the page's list. `idle`: kept from an earlier visit, not read yet; `queued`: waiting for its turn;
 * `loading`: being read; `ready`: `last` is the newest read; `error`: the latest attempt failed, and `last` still
 * holds the newest read that worked.
 */
export interface RoomEntry {
  code: string;
  region: GameServer;
  status: "idle" | "queued" | "loading" | "ready" | "error";
  last: RoomRead | null;
  error: RoomError | null;
  /** When the failed attempt answered (the page's clock). */
  errorAt: number | null;
  /** The watch this browser was given when it opened the room; null for a room that was only read. */
  watchId: string | null;
  /** Whether this browser opened the room. */
  created: boolean;
}

/** A room the service opened for this browser, with the watch that follows it. */
export interface CreatedRoom {
  code: string;
  region: GameServer;
  watchId: string;
}

/** Why a live view ended: the room filled up, its time ran out, the room closed, the observer left, or the service stopped it. */
export type WatchStop = "full" | "lease" | "closed" | "kicked" | "error";
