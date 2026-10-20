import { describe, expect, test } from "bun:test";
import { extractRoomCodes, parseRoomError, parseRoomSnapshot } from "../src/lib/room-check/parse";
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
    const entry: RoomEntry = { code: "1234567", region: "tw", status: "error", last: null, error: { code: "cooldown", retryAfterMs: null, snapshot }, errorAt: 7 };
    expect(shownRead(entry)).toEqual({ snapshot, receivedAt: 7 });
    expect(shownRead({ ...entry, error: { code: "busy", retryAfterMs: 1, snapshot: null } })).toBeNull();
  });
});
