import { afterEach, describe, expect, test } from "bun:test";
import { parseCreatedRoom, parseRoomError, parseWatchEvent, extractRoomCodes, parseRoomSnapshot } from "../src/lib/room-check/parse";
import { httpRoomApi } from "../src/lib/room-check/client";
import { loadSavedRooms, saveRooms } from "../src/lib/room-check/store";
import { changedPlayers, freshness, rankShare, readAge, refreshIn, shownRead, songVotes } from "../src/lib/room-check/summary";
import type { RoomEntry, RoomSnapshot } from "../src/lib/room-check/types";

const unit = (cardId: number) => ({
  cardId, level: 60, awake: 3, rank: 2, characterRank: 10,
  skills: { live: 4, leader: 2, gekisou: 3 },
  bandItem: { performance: 250, technique: 0, visual: 100 },
  support: cardId === 3 ? { cardId: 9, level: 40, rank: 1, skills: [2, 3], gekisouSkills: [1, 1] } : null,
});

const player = (joinOrder: number, name: string, musicId: number, totalCharacterRank: number) => ({
  joinOrder, host: joinOrder === 1, name, idHash: `p${joinOrder}`, color: joinOrder - 1, state: 10, ready: true,
  selection: { musicId, difficulty: 3 },
  formation: { units: [1, 2, 3, 4, 5].map(unit), order: [0, 1, 2, 3, 4], totalCharacterRank, vipRank: 2 },
});

const body = {
  code: "1234567", region: "tw", fetchedAt: 1_000_000, ageMs: 2_000, source: "live", nextRefreshAt: 1_020_000,
  room: { musicId: 100004, missions: [3, 3, 3], capacity: 5, humans: 3 },
  players: [player(2, "B", 100001, 50), player(1, "A", 100004, 100), player(3, "C", 100001, 25)],
};

describe("room codes", () => {
  test("a pasted message gives every seven-digit code once, in order", () => {
    expect(extractRoomCodes("room 7911927 open, also 1234567! again 7911927")).toEqual(["7911927", "1234567"]);
  });

  test("longer or shorter digit runs are not codes", () => {
    expect(extractRoomCodes("12345678 123456 phone 13800138000")).toEqual([]);
  });

  test("full-width digits count", () => {
    expect(extractRoomCodes("７９１１９２７")).toEqual(["7911927"]);
  });

  test("at most the limit", () => {
    expect(extractRoomCodes("1000001 1000002 1000003", 2)).toEqual(["1000001", "1000002"]);
  });
});

describe("snapshot parsing", () => {
  test("a valid body parses, players sorted by join order", () => {
    const snapshot = parseRoomSnapshot(body)!;
    expect(snapshot.players.map((entry) => entry.name)).toEqual(["A", "B", "C"]);
    expect(snapshot.players[0]!.formation!.units[2]!.support).toEqual({ cardId: 9, level: 40, rank: 1, skills: [2, 3], gekisouSkills: [1, 1] });
    expect(snapshot.players[0]!.formation!.units[0]!.support).toBeNull();
    expect(snapshot.room.missions).toEqual([3, 3, 3]);
  });

  test("a player without a readable team keeps the row", () => {
    const snapshot = parseRoomSnapshot({ ...body, players: [{ ...player(1, "A", 100004, 1), formation: null }] })!;
    expect(snapshot.players[0]!.formation).toBeNull();
  });

  test("a malformed unit rejects the snapshot", () => {
    const broken = player(1, "A", 100004, 1);
    broken.formation.units[0] = { ...unit(1), level: "high" as unknown as number };
    expect(parseRoomSnapshot({ ...body, players: [broken] })).toBeNull();
  });

  test("an unknown server or code rejects the snapshot", () => {
    expect(parseRoomSnapshot({ ...body, region: "xx" })).toBeNull();
    expect(parseRoomSnapshot({ ...body, code: "12345" })).toBeNull();
  });

  test("error bodies", () => {
    expect(parseRoomError({ error: "busy", retryAfterMs: 5000 })).toEqual({ code: "busy", retryAfterMs: 5000, snapshot: null });
    expect(parseRoomError({ error: "cooldown", snapshot: body }).snapshot?.code).toBe("1234567");
    expect(parseRoomError("oops").code).toBe("invalid");
  });

  test("the failures of opening and leaving a room keep their own codes", () => {
    expect(parseRoomError({ error: "room_exists" }).code).toBe("room_exists");
    expect(parseRoomError({ error: "bot_unavailable" }).code).toBe("bot_unavailable");
    expect(parseRoomError({ error: "not_bot_room" }).code).toBe("not_bot_room");
    expect(parseRoomError({ error: "not_at_four" }).code).toBe("not_at_four");
    expect(parseRoomError({ error: "something_else" }).code).toBe("invalid");
  });
});

describe("a room this page opened", () => {
  test("its answer carries the code, the server and the watch", () => {
    expect(parseCreatedRoom({ code: "7654321", region: "kr", watchId: "w-1" })).toEqual({ code: "7654321", region: "kr", watchId: "w-1" });
  });

  test("an answer without a usable code or watch is not one", () => {
    expect(parseCreatedRoom({ code: "76543", region: "kr", watchId: "w-1" })).toBeNull();
    expect(parseCreatedRoom({ code: "7654321", region: "xx", watchId: "w-1" })).toBeNull();
    expect(parseCreatedRoom({ code: "7654321", region: "kr" })).toBeNull();
    expect(parseCreatedRoom({ code: "7654321", region: "kr", watchId: "" })).toBeNull();
    expect(parseCreatedRoom(null)).toBeNull();
  });
});

describe("events of a room stream", () => {
  test("a snapshot event is a full read", () => {
    const event = parseWatchEvent("snapshot", JSON.stringify(body));
    expect(event?.type).toBe("snapshot");
    expect(event?.type === "snapshot" && event.snapshot.room.humans).toBe(3);
  });

  test("at_four carries the read of the four-player room", () => {
    const four = { ...body, room: { ...body.room, humans: 4 }, players: [1, 2, 3, 4].map((n) => player(n, `P${n}`, 100004, 10 * n)) };
    const event = parseWatchEvent("at_four", JSON.stringify(four));
    expect(event?.type).toBe("at_four");
    expect(event?.type === "at_four" && event.snapshot?.room.humans).toBe(4);
  });

  test("at_four still marks the four players when its read does not parse", () => {
    const event = parseWatchEvent("at_four", JSON.stringify({ players: [] }));
    expect(event).toEqual({ type: "at_four", snapshot: null });
  });

  test("stopped events keep their reason, and an unknown one reads as an error", () => {
    expect(parseWatchEvent("stopped", JSON.stringify({ reason: "kicked" }))).toEqual({ type: "stopped", reason: "kicked" });
    expect(parseWatchEvent("stopped", JSON.stringify({ reason: "full" }))).toEqual({ type: "stopped", reason: "full" });
    expect(parseWatchEvent("stopped", JSON.stringify({ reason: "lease" }))).toEqual({ type: "stopped", reason: "lease" });
    expect(parseWatchEvent("stopped", JSON.stringify({ reason: "closed" }))).toEqual({ type: "stopped", reason: "closed" });
    expect(parseWatchEvent("stopped", JSON.stringify({ reason: "surprise" }))).toEqual({ type: "stopped", reason: "error" });
    expect(parseWatchEvent("stopped", "not json")).toBeNull();
  });

  test("an unknown event name is dropped", () => {
    expect(parseWatchEvent("tick", JSON.stringify(body))).toBeNull();
  });
});

/** Replaces `fetch` for one test and gives back every request it took. */
const realFetch = globalThis.fetch;
function stubFetch(reply: (url: string, init: RequestInit | undefined) => { status?: number; body: unknown; headers?: Record<string, string> }) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body: payload, headers = {} } = reply(url, init);
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers });
  }) as typeof fetch;
  return calls;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the create endpoint", () => {
  test("a code goes in the body as JSON, and the answer gives the room and its watch", async () => {
    const calls = stubFetch(() => ({ body: { code: "7654321", region: "kr", watchId: "watch-9" } }));
    const reply = await httpRoomApi.create("kr", "7654321");
    expect(reply).toEqual({ ok: true, room: { code: "7654321", region: "kr", watchId: "watch-9" } });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toContain("/v1/rooms/create");
    expect(call!.init?.method).toBe("POST");
    expect(call!.init?.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(String(call!.init?.body))).toEqual({ region: "kr", code: "7654321" });
  });

  test("a blank code leaves the field out, so the service picks one", async () => {
    const calls = stubFetch(() => ({ body: { code: "1000001", region: "tw", watchId: "watch-1" } }));
    const reply = await httpRoomApi.create("tw", null);
    expect(reply.ok).toBe(true);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ region: "tw" });
  });

  test("a refused create keeps the service's reason, and its wait from either the body or the header", async () => {
    stubFetch(() => ({ status: 409, body: { error: "room_exists" } }));
    expect(await httpRoomApi.create("tw", "7654321")).toEqual({ ok: false, error: { code: "room_exists", retryAfterMs: null, snapshot: null } });

    stubFetch(() => ({ status: 503, body: { error: "busy", retryAfterMs: 5_000 } }));
    expect(await httpRoomApi.create("tw", null)).toEqual({ ok: false, error: { code: "busy", retryAfterMs: 5_000, snapshot: null } });

    stubFetch(() => ({ status: 503, body: { error: "bot_unavailable" }, headers: { "retry-after": "8" } }));
    expect(await httpRoomApi.create("tw", null)).toEqual({ ok: false, error: { code: "bot_unavailable", retryAfterMs: 8_000, snapshot: null } });

    stubFetch(() => ({ status: 400, body: { error: "bad_code" } }));
    expect(await httpRoomApi.create("tw", "12345")).toEqual({ ok: false, error: { code: "bad_code", retryAfterMs: null, snapshot: null } });
  });

  test("an answer that is not a room reads as unreadable", async () => {
    stubFetch(() => ({ body: { code: "7654321", region: "tw" } }));
    expect(await httpRoomApi.create("tw", null)).toEqual({ ok: false, error: { code: "invalid", retryAfterMs: null, snapshot: null } });
  });

  test("a request that never reaches the service reads as a network failure", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    expect(await httpRoomApi.create("tw", null)).toEqual({ ok: false, error: { code: "network", retryAfterMs: null, snapshot: null } });
  });
});

describe("leaving a room this page opened", () => {
  const room = { code: "7654321", region: "kr" as const, watchId: "watch-9" };

  test("the leave endpoint is asked to end the observer's watch", async () => {
    const calls = stubFetch(() => ({ body: {} }));
    expect(await httpRoomApi.kick(room)).toEqual({ ok: true });
    expect(calls[0]!.url).toContain("/v1/rooms/7654321/probe/leave");
    expect(calls[0]!.url).toContain("region=kr");
    expect(calls[0]!.init?.method).toBe("POST");
  });

  test("a refusal keeps its reason", async () => {
    stubFetch(() => ({ status: 409, body: { error: "not_at_four" } }));
    expect(await httpRoomApi.kick(room)).toEqual({ ok: false, error: { code: "not_at_four", retryAfterMs: null, snapshot: null } });
  });
});

describe("the saved rooms", () => {
  const store = new Map<string, string>();
  const fakeWindow = { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } } };

  const withStorage = (run: () => void) => {
    const before = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = fakeWindow;
    store.clear();
    try {
      run();
    } finally {
      (globalThis as { window?: unknown }).window = before;
      store.clear();
    }
  };

  test("a room this browser opened keeps its watch across a reload", () => {
    withStorage(() => {
      saveRooms([
        { code: "7654321", region: "kr", watchId: "watch-9", created: true },
        { code: "1234567", region: "tw", watchId: null, created: false },
      ]);
      expect(loadSavedRooms()).toEqual([
        { code: "7654321", region: "kr", watchId: "watch-9", created: true },
        { code: "1234567", region: "tw", watchId: null, created: false },
      ]);
    });
  });

  test("an older saved list still loads, as rooms that were only read", () => {
    withStorage(() => {
      store.set("moenotes:room-check:v1", JSON.stringify([{ code: "1234567", region: "tw" }, { code: "7654321", region: "kr" }]));
      expect(loadSavedRooms()).toEqual([
        { code: "1234567", region: "tw", watchId: null, created: false },
        { code: "7654321", region: "kr", watchId: null, created: false },
      ]);
    });
  });

  test("bad entries are dropped and a created room without a watch stays a plain room", () => {
    withStorage(() => {
      store.set("moenotes:room-check:v1", JSON.stringify([
        { code: "7654321", region: "kr", created: true },
        { code: "12345", region: "tw" },
        { code: "1234567", region: "xx" },
        "nonsense",
      ]));
      expect(loadSavedRooms()).toEqual([{ code: "7654321", region: "kr", watchId: null, created: true }]);
    });
  });

  test("a list saved without storage reads as empty", () => {
    store.clear();
    expect(loadSavedRooms()).toEqual([]);
  });
});

describe("summary", () => {
  const snapshot = parseRoomSnapshot(body) as RoomSnapshot;

  test("age and refresh wait run on the page clock", () => {
    expect(readAge(snapshot, 50_000, 53_000)).toBe(5_000);
    expect(refreshIn(snapshot, 50_000, 53_000)).toBe(15_000);
    expect(refreshIn(snapshot, 50_000, 80_000)).toBe(0);
  });

  test("freshness levels", () => {
    expect(freshness(9_999)).toBe("fresh");
    expect(freshness(10_000)).toBe("aging");
    expect(freshness(60_000)).toBe("stale");
  });

  test("song picks count each player once, most picked first", () => {
    expect(songVotes(snapshot)).toEqual([
      { musicId: 100001, count: 2, room: false },
      { musicId: 100004, count: 1, room: true },
    ]);
  });

  test("character rank shares are relative to the room's highest", () => {
    const share = rankShare(snapshot.players);
    expect(share.get("p1")).toBe(1);
    expect(share.get("p2")).toBe(0.5);
    expect(share.get("p3")).toBe(0.25);
  });

  test("changed players between two reads", () => {
    const next = parseRoomSnapshot({ ...body, players: [player(1, "A", 100004, 100), player(2, "B", 100004, 50), player(3, "C", 100001, 25)] })!;
    expect([...changedPlayers(snapshot, next)]).toEqual(["p2"]);
    expect(changedPlayers(null, next).size).toBe(0);
  });

  test("a refused read that carries the shared copy still shows it", () => {
    const entry: RoomEntry = { code: "1234567", region: "tw", status: "error", last: null, error: { code: "cooldown", retryAfterMs: null, snapshot }, errorAt: 7, watchId: null, created: false };
    expect(shownRead(entry)).toEqual({ snapshot, receivedAt: 7 });
    expect(shownRead({ ...entry, error: { code: "busy", retryAfterMs: 1, snapshot: null } })).toBeNull();
  });
});
