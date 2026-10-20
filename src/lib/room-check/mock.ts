import type { GameServer } from "@/config/servers";
import type { RoomApi, RoomReply } from "./client";
import type { RoomPlayer, RoomSnapshot, RoomUnit } from "./types";

/** Card and song ids the made-up rooms draw from, so their art resolves. */
export interface MockPool {
  memberIds: readonly number[];
  supportIds: readonly number[];
  musicIds: readonly number[];
}

const COOLDOWN_MS = 20_000;
const NAMES = ["Sirius", "Mizore", "Kanade", "Hoshino", "Lumi", "Tsubame", "Aoi", "Rin"];

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

function room(code: string, region: GameServer, pool: MockPool, now: number, extra = 0): RoomSnapshot {
  const next = random(Number(code) * 7 + extra);
  const musicId = pick(next, pool.musicIds);
  const humans = Math.min(4, 1 + (Number(code) % 4) + extra);
  return {
    code, region, fetchedAt: now, ageMs: 0, source: "live", nextRefreshAt: now + COOLDOWN_MS,
    room: { musicId, missions: Array.from({ length: 3 }, () => between(next, 1, 3)), capacity: 5, humans },
    players: Array.from({ length: humans }, (_, index) => player(random(Number(code) * 31 + index), pool, index + 1, musicId)),
  };
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(signal.reason);
  }, { once: true });
});

/**
 * Made-up rooms for development. The code picks the case: `…0000` does not exist, `…1111` is full, `…2222` is
 * busy, `…3333` fails to load; other codes hold one to four players. A room read twice within its wait comes from
 * the shared copy, and a live view adds a player now and then until the room has four.
 */
export function createMockRoomApi(pool: MockPool): RoomApi {
  const reads = new Map<string, RoomSnapshot>();
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
      }, 6_000);
      return () => window.clearInterval(timer);
    },
  };
}
