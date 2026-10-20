import { GAME_SERVERS, type GameServer } from "@/config/servers";
import type { CreatedRoom, RoomError, RoomErrorCode, RoomFormation, RoomPlayer, RoomSnapshot, RoomSupport, RoomUnit, WatchStop } from "./types";

/** Room codes are seven digits. */
export const ROOM_CODE_LENGTH = 7;
/** How many rooms a pasted text adds at most. */
export const MAX_PASTED_CODES = 8;

const CODE = /(?<!\d)\d{7}(?!\d)/g;

/** Every room code in a text, in order and without repeats; full-width digits count as digits. */
export function extractRoomCodes(text: string, limit = MAX_PASTED_CODES): string[] {
  const ascii = text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  return [...new Set(ascii.match(CODE) ?? [])].slice(0, limit);
}

export function isRoomCode(value: string): boolean {
  return /^\d{7}$/.test(value);
}

type Json = Record<string, unknown>;
const record = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const int = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const nullableInt = (value: unknown): number | null => (int(value) ? value : null);

class Invalid extends Error {}
function need<T>(value: T | null | undefined | false, path: string): T {
  if (value === null || value === undefined || value === false) throw new Invalid(path);
  return value;
}
const intAt = (source: Json, key: string, path: string): number => need(int(source[key]) ? (source[key] as number) : null, `${path}.${key}`);
const pair = (value: unknown, path: string): [number, number] => {
  const list = need(Array.isArray(value) && value.length === 2 && value.every(int) ? (value as number[]) : null, path);
  return [list[0]!, list[1]!];
};

function parseSupport(value: unknown, path: string): RoomSupport | null {
  if (value === null || value === undefined) return null;
  const source = need(record(value) ? value : null, path);
  return {
    cardId: intAt(source, "cardId", path),
    level: intAt(source, "level", path),
    rank: intAt(source, "rank", path),
    skills: pair(source.skills, `${path}.skills`),
    gekisouSkills: pair(source.gekisouSkills, `${path}.gekisouSkills`),
  };
}

function parseUnit(value: unknown, path: string): RoomUnit {
  const source = need(record(value) ? value : null, path);
  const skills = need(record(source.skills) ? source.skills : null, `${path}.skills`);
  const band = need(record(source.bandItem) ? source.bandItem : null, `${path}.bandItem`);
  return {
    cardId: intAt(source, "cardId", path),
    level: intAt(source, "level", path),
    awake: intAt(source, "awake", path),
    rank: intAt(source, "rank", path),
    characterRank: intAt(source, "characterRank", path),
    skills: { live: intAt(skills, "live", path), leader: intAt(skills, "leader", path), gekisou: intAt(skills, "gekisou", path) },
    bandItem: { performance: intAt(band, "performance", path), technique: intAt(band, "technique", path), visual: intAt(band, "visual", path) },
    support: parseSupport(source.support, `${path}.support`),
  };
}

function parseFormation(value: unknown, path: string): RoomFormation | null {
  if (value === null || value === undefined) return null;
  const source = need(record(value) ? value : null, path);
  const units = need(Array.isArray(source.units) ? source.units : null, `${path}.units`);
  const order = need(Array.isArray(source.order) && source.order.every(int) ? (source.order as number[]) : null, `${path}.order`);
  return {
    units: units.map((unit, index) => parseUnit(unit, `${path}.units[${index}]`)),
    order,
    totalCharacterRank: intAt(source, "totalCharacterRank", path),
    vipRank: intAt(source, "vipRank", path),
  };
}

function parsePlayer(value: unknown, path: string): RoomPlayer {
  const source = need(record(value) ? value : null, path);
  const selection = record(source.selection) ? source.selection : {};
  return {
    joinOrder: intAt(source, "joinOrder", path),
    host: source.host === true,
    name: typeof source.name === "string" ? source.name : "",
    idHash: typeof source.idHash === "string" ? source.idHash : "",
    color: nullableInt(source.color),
    state: int(source.state) ? source.state : 0,
    ready: source.ready === true,
    selection: { musicId: nullableInt(selection.musicId), difficulty: nullableInt(selection.difficulty) },
    formation: parseFormation(source.formation, `${path}.formation`),
  };
}

function parseRegion(value: unknown): GameServer {
  return need((GAME_SERVERS as readonly unknown[]).includes(value) ? (value as GameServer) : null, "region");
}

/** A room snapshot from the room query service, or null when the body does not have its shape. */
export function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  try {
    const source = need(record(value) ? value : null, "snapshot");
    const room = need(record(source.room) ? source.room : null, "room");
    const players = need(Array.isArray(source.players) ? source.players : null, "players");
    const code = need(typeof source.code === "string" && isRoomCode(source.code) ? source.code : null, "code");
    const missions = Array.isArray(room.missions) && room.missions.every(int) ? (room.missions as number[]) : [];
    return {
      code,
      region: parseRegion(source.region),
      fetchedAt: intAt(source, "fetchedAt", "snapshot"),
      ageMs: Math.max(0, intAt(source, "ageMs", "snapshot")),
      source: source.source === "cache" ? "cache" : "live",
      nextRefreshAt: intAt(source, "nextRefreshAt", "snapshot"),
      room: { musicId: nullableInt(room.musicId), missions, capacity: intAt(room, "capacity", "room"), humans: intAt(room, "humans", "room") },
      players: players.map((player, index) => parsePlayer(player, `players[${index}]`)).sort((a, b) => a.joinOrder - b.joinOrder),
    };
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

const ERROR_CODES: readonly RoomErrorCode[] = [
  "room_not_found", "room_full", "cooldown", "busy", "bad_code", "internal",
  "room_exists", "bot_unavailable", "not_bot_room", "not_at_four",
  "login_required", "not_owner", "rate_limited",
];

/** The service's error body; anything else reads as `invalid`. */
export function parseRoomError(value: unknown): RoomError {
  const source = record(value) ? value : {};
  const code = (ERROR_CODES as readonly unknown[]).includes(source.error) ? (source.error as RoomErrorCode) : "invalid";
  return { code, retryAfterMs: nullableInt(source.retryAfterMs), snapshot: source.snapshot === undefined ? null : parseRoomSnapshot(source.snapshot) };
}

/** A room the service opened for this browser: its code, server and the watch that follows it. */
export function parseCreatedRoom(value: unknown): CreatedRoom | null {
  try {
    const source = need(record(value) ? value : null, "created");
    return {
      code: need(typeof source.code === "string" && isRoomCode(source.code) ? source.code : null, "created.code"),
      region: parseRegion(source.region),
      watchId: need(typeof source.watchId === "string" && source.watchId !== "" ? source.watchId : null, "created.watchId"),
    };
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

const STOP_REASONS: readonly WatchStop[] = ["full", "lease", "closed", "kicked", "error"];

/** Why a live view stopped, from a `stopped` event; an unknown reason reads as `error`. */
export function parseWatchStopReason(value: unknown): WatchStop {
  const reason = record(value) ? value.reason : undefined;
  return (STOP_REASONS as readonly unknown[]).includes(reason) ? (reason as WatchStop) : "error";
}

/** One event of a room's event stream, by its event name and data. */
export type RoomWatchEvent =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "at_four"; snapshot: RoomSnapshot | null }
  | { type: "stopped"; reason: WatchStop };

/**
 * An event of a room's stream. `snapshot` and `at_four` carry a full room read (`at_four` still marks the four
 * players when its read does not parse); `stopped` carries why the stream ended.
 */
export function parseWatchEvent(name: string, data: string): RoomWatchEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }
  if (name === "stopped") return { type: "stopped", reason: parseWatchStopReason(body) };
  if (name === "at_four") {
    // The prompt carries its read under `snapshot`; a flat read is accepted too.
    const source = record(body) ? body : {};
    return { type: "at_four", snapshot: parseRoomSnapshot(source.snapshot ?? body) };
  }
  if (name === "snapshot") {
    const snapshot = parseRoomSnapshot(body);
    return snapshot ? { type: "snapshot", snapshot } : null;
  }
  return null;
}
