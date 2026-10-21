import { ROOM_CODE_LENGTH } from "./parse";
import type { GameServer } from "@/config/servers";
import type { CreateReply, KickReply, RoomApi, RoomReply } from "./client";
import type { CreatedRoom, RoomPlayer, RoomSnapshot, RoomUnit } from "./types";

/** Card and song ids the made-up rooms draw from, so their art resolves. */
export interface MockPool {
  memberIds: readonly number[];
  supportIds: readonly number[];
  musicIds: readonly number[];
}

const COOLDOWN_MS = 20_000;
const NAMES = ["Sirius", "Mizore", "Kanade", "Hoshino", "Lumi", "Tsubame", "Aoi", "Rin"];

/** How often a made-up live view updates, and how long a made-up create takes. */
const LIVE_STEP_MS = 6_000;
const CREATE_MS = 900;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pick = <T,>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
const between = (next: () => number, low: number, high: number) => low + Math.floor(next() * (high - low + 1));

function unit(next: () => number, pool: MockPool): RoomUnit {
  const level = between(next, 20, 80);
  const hasSupport = pool.supportIds.length > 0 && next() > 0.15;
  return {
    cardId: pick(next, pool.memberIds),
    level,
    awake: between(next, 1, 5),
    rank: between(next, 1, 5),
    characterRank: between(next, 1, 30),
    skills: { live: between(next, 1, 5), leader: between(next, 1, 5), gekisou: between(next, 1, 5) },
    bandItem: { performance: between(next, 0, 10) * 50, technique: between(next, 0, 10) * 50, visual: between(next, 0, 10) * 50 },
    support: hasSupport ? { cardId: pick(next, pool.supportIds), level: between(next, 1, 60), rank: between(next, 1, 5),
      skills: [between(next, 1, 5), between(next, 1, 5)], gekisouSkills: [between(next, 1, 5), between(next, 1, 5)] } : null,
  };
}

function player(next: () => number, pool: MockPool, joinOrder: number, musicId: number): RoomPlayer {
  const units = Array.from({ length: 5 }, () => unit(next, pool));
  return {
    joinOrder,
    host: joinOrder === 1,
    name: `${pick(next, NAMES)}${between(next, 1, 99)}`,
    idHash: Math.floor(next() * 0xffffff).toString(16).padStart(6, "0"),
    color: joinOrder - 1,
    state: next() > 0.5 ? 10 : 0,
    ready: next() > 0.5,
    selection: { musicId: next() > 0.35 ? musicId : pick(next, pool.musicIds), difficulty: between(next, 2, 4) },
    formation: next() > 0.08 ? { units, order: [0, 1, 2, 3, 4], totalCharacterRank: units.reduce((sum, item) => sum + item.characterRank, 0) * 3, vipRank: between(next, 0, 8) } : null,
  };
}

/** A made-up room with an exact number of players (`humans` overrides the count the code would give). */
function room(code: string, region: GameServer, pool: MockPool, now: number, extra = 0, humans?: number): RoomSnapshot {
  const next = random(Number(code) * 7 + extra);
  const musicId = pick(next, pool.musicIds);
  const present = humans ?? Math.min(4, 1 + (Number(code) % 4) + extra);
  return {
    code, region, fetchedAt: now, ageMs: 0, source: "live", nextRefreshAt: now + COOLDOWN_MS,
    room: { musicId, missions: Array.from({ length: 3 }, () => between(next, 1, 3)), capacity: 5, humans: present },
    players: Array.from({ length: present }, (_, index) => player(random(Number(code) * 31 + index), pool, index + 1, musicId)),
  };
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(signal.reason);
  }, { once: true });
});

/** A made-up room the page opened, and the state its watch reads. */
interface MockCreatedRoom {
  room: CreatedRoom;
  humans: number;
  extra: number;
  kicked: boolean;
  /** Ends each watch following this room, so a leave reaches them without waiting for the next update. */
  watchers: Set<(reason: "kicked") => void>;
}

/** Watch ids a made-up create hands out, so a room reconnects after a reload of the page. */
const watchPrefix = (code: string) => `mock-watch-${code}-`;

/**
 * Made-up rooms for development. The code picks the case: `…0000` does not exist, `…1111` is full, `…2222` is
 * busy, `…3333` fails to load; other codes hold one to four players. A room read twice within its wait comes from
 * the shared copy, and a live view adds a player now and then until the room has four.
 *
 * Creating follows the same idea: a blank code lets the mock pick one, `…0000` is already taken, `…2222` is busy and
 * `…3333` has no observer to open a room; a created room's watch fills the room with real players, reports when four
 * are in, and ends with `kicked` once the observer is asked to leave.
 */
export function createMockRoomApi(pool: MockPool): RoomApi {
  const reads = new Map<string, RoomSnapshot>();
  // Rooms the page opened stay known for the life of this module, so its watch survives an island remount.
  const created = new Map<string, MockCreatedRoom>();
  const key = (room: CreatedRoom) => `${room.region}:${room.code}`;
  return {
    async read(code, region, signal): Promise<RoomReply> {
      await delay(500 + Math.random() * 700, signal);
      const now = Date.now();
      if (code.endsWith("0000")) return { ok: false, error: { code: "room_not_found", retryAfterMs: null, snapshot: null } };
      if (code.endsWith("1111")) return { ok: false, error: { code: "room_full", retryAfterMs: null, snapshot: null } };
      if (code.endsWith("2222")) return { ok: false, error: { code: "busy", retryAfterMs: 8_000, snapshot: null } };
      if (code.endsWith("3333")) return { ok: false, error: { code: "network", retryAfterMs: null, snapshot: null } };
      const cached = reads.get(`${region}:${code}`);
      if (cached && now < cached.nextRefreshAt) return { ok: true, snapshot: { ...cached, source: "cache", ageMs: now - cached.fetchedAt } };
      const snapshot = room(code, region, pool, now);
      reads.set(`${region}:${code}`, snapshot);
      return { ok: true, snapshot };
    },
    watch(code, region, handlers) {
      let extra = 0;
      const timer = window.setInterval(() => {
        extra += 1;
        const snapshot = room(code, region, pool, Date.now(), extra);
        handlers.onSnapshot(snapshot);
        if (snapshot.room.humans >= 4) {
          window.clearInterval(timer);
          handlers.onStop("full");
        }
      }, LIVE_STEP_MS);
      return () => window.clearInterval(timer);
    },
    async create(region, code, signal): Promise<CreateReply> {
      await delay(CREATE_MS, signal);
      if (code !== null && !new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(code)) {
        return { ok: false, error: { code: "bad_code", retryAfterMs: null, snapshot: null } };
      }
      if (code?.endsWith("2222")) return { ok: false, error: { code: "busy", retryAfterMs: 8_000, snapshot: null } };
      if (code?.endsWith("3333")) return { ok: false, error: { code: "bot_unavailable", retryAfterMs: null, snapshot: null } };
      // A code the mock keeps for a case above, or one already open, cannot be opened again.
      if (code !== null && (code.endsWith("0000") || created.has(`${region}:${code}`))) {
        return { ok: false, error: { code: "room_exists", retryAfterMs: null, snapshot: null } };
      }
      // A blank code gets a free one, the way the service picks for itself.
      let roomCode = code;
      for (let attempt = 0; roomCode === null && attempt < 20; attempt += 1) {
        const picked = String(1_000_000 + Math.floor(Math.random() * 9_000_000));
        if (!created.has(`${region}:${picked}`)) roomCode = picked;
      }
      if (roomCode === null) return { ok: false, error: { code: "busy", retryAfterMs: 2_000, snapshot: null } };
      const wanted: CreatedRoom = { code: roomCode, region, watchId: `${watchPrefix(roomCode)}${created.size + 1}` };
      created.set(key(wanted), { room: wanted, humans: 1, extra: 0, kicked: false, watchers: new Set() });
      return { ok: true, room: wanted };
    },
    watchCreated(createdRoom: CreatedRoom, handlers) {
      let state = created.get(key(createdRoom));
      // A watch the mock still recognises after a reload: the room keeps its state, one player short of where it was.
      if (!state && createdRoom.watchId.startsWith(watchPrefix(createdRoom.code))) {
        state = { room: createdRoom, humans: 2, extra: 0, kicked: false, watchers: new Set() };
        created.set(key(createdRoom), state);
      }
      const current = state;
      let closed = false;
      let first: number | undefined;
      let timer: number | undefined;
      if (!current) {
        // A watch the mock does not know has nothing to follow, which reads like a watch that ended.
        first = window.setTimeout(() => { if (!closed) handlers.onStop("error"); }, 0);
        return () => {
          closed = true;
          window.clearTimeout(first);
        };
      }
      const end = () => {
        closed = true;
        window.clearInterval(timer);
        window.clearTimeout(first);
        current.watchers.delete(kickOff);
      };
      const kickOff = () => {
        if (closed) return;
        end();
        handlers.onStop("kicked");
      };
      current.watchers.add(kickOff);
      if (current.kicked) {
        first = window.setTimeout(kickOff, 0);
        return end;
      }
      let announced = false;
      const emit = () => {
        if (closed) return;
        if (current.kicked) return kickOff();
        current.extra += 1;
        const snapshot = room(current.room.code, current.room.region, pool, Date.now(), current.extra, current.humans);
        reads.set(`${current.room.region}:${current.room.code}`, snapshot);
        handlers.onSnapshot(snapshot);
        if (current.humans >= 4 && !announced) {
          announced = true;
          handlers.onAtFour(snapshot);
        }
        current.humans = Math.min(4, current.humans + 1);
      };
      timer = window.setInterval(emit, LIVE_STEP_MS);
      first = window.setTimeout(emit, 600);
      return end;
    },
    async kick(createdRoom): Promise<KickReply> {
      await delay(400);
      const state = created.get(key(createdRoom));
      if (!state || state.room.watchId !== createdRoom.watchId) return { ok: false, error: { code: "not_bot_room", retryAfterMs: null, snapshot: null } };
      state.kicked = true;
      // Without the observer the room holds one player fewer, which is what a plain read shows from now on.
      reads.set(`${state.room.region}:${state.room.code}`, room(state.room.code, state.room.region, pool, Date.now(), state.extra, state.humans - 1));
      for (const watch of [...state.watchers]) watch("kicked");
      return { ok: true };
    },
    stopCreated(createdRoom) {
      const state = created.get(key(createdRoom));
      if (!state || state.room.watchId !== createdRoom.watchId) return;
      created.delete(key(createdRoom));
      // The observer is gone, so the room holds one player fewer from now on.
      reads.set(`${state.room.region}:${state.room.code}`, room(state.room.code, state.room.region, pool, Date.now(), state.extra, Math.max(0, state.humans - 1)));
      for (const watch of [...state.watchers]) watch("kicked");
    },
  };
}
