import { expect, test } from "bun:test";
import { buildSongIndex, resolveTypedAnswer } from "../src/lib/guess-music/answer";
import {
  DailyApiError,
  classifyDailyError,
  clearStoredRun,
  createDailyApi,
  dailyComboMultiplier,
  dailyPotential,
  formatCountdown,
  formatDuration,
  loadStoredRun,
  pruneStoredRuns,
  recentDates,
  saveStoredRun,
  type DailyRoundStart,
  type FetchLike,
  type StoredDailyRun,
} from "../src/lib/guess-music/daily-client";
import { createPracticeApi } from "../src/lib/guess-music/practice-client";
import { formatMultiplier } from "../src/lib/guess-music/scoring";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that answers from a table of handlers and records every call. */
function fakeFetch(handlers: Record<string, (init: RequestInit | undefined) => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const handler = handlers[`${init?.method ?? "GET"} ${url}`];
    return handler ? handler(init) : new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  };
  return { fetch, calls };
}

test("a typed answer names one title, several, or none; the title it is wins over an alias", () => {
  const index = buildSongIndex([
    { id: 1, title: "迷星叫", groupTitle: "迷星叫", answers: ["Mayoiuta", "まよいうた"] },
    { id: 2, title: "迷星叫", groupTitle: "迷星叫", answers: ["Mayoiuta"] },
    { id: 3, title: "Hello", groupTitle: "Hello", answers: ["Shared"] },
    { id: 4, title: "Shared", groupTitle: "Shared", answers: [] },
    { id: 5, title: "Five", groupTitle: "Five", answers: ["Twin"] },
    { id: 6, title: "Six", groupTitle: "Six", answers: ["Twin"] },
  ]);
  // Re-releases sharing a title are one answer.
  expect(resolveTypedAnswer(index, "ＭＡＹＯＩＵＴＡ")).toEqual({ kind: "song", id: 1 });
  expect(resolveTypedAnswer(index, "マヨイウタ")).toEqual({ kind: "song", id: 1 });
  // "Shared" is song 4's title and song 3's alias: the title wins.
  expect(resolveTypedAnswer(index, "shared")).toEqual({ kind: "song", id: 4 });
  expect(resolveTypedAnswer(index, "twin")).toEqual({ kind: "ambiguous" });
  expect(resolveTypedAnswer(index, "nothing")).toEqual({ kind: "none" });
  expect(resolveTypedAnswer(index, "  ")).toEqual({ kind: "none" });
});

test("errors are classified by the server's code, and pages without the API count as unavailable", () => {
  expect(classifyDailyError(new DailyApiError("already_played", 409))).toBe("alreadyPlayed");
  expect(classifyDailyError(new DailyApiError("signed_out", 401))).toBe("signedOut");
  expect(classifyDailyError(new DailyApiError("session_not_found", 404))).toBe("sessionExpired");
  expect(classifyDailyError(new DailyApiError("round_final", 409))).toBe("conflict");
  expect(classifyDailyError(new DailyApiError("rate_limited", 429))).toBe("rateLimited");
  expect(classifyDailyError(new DailyApiError("not_ready", 503))).toBe("notReady");
  expect(classifyDailyError(new DailyApiError("tier_unavailable", 409))).toBe("tierUnavailable");
  expect(classifyDailyError(new DailyApiError("http_404", 404))).toBe("unavailable");
  expect(classifyDailyError(new DailyApiError("http_502", 502))).toBe("unavailable");
  expect(classifyDailyError(new DailyApiError("http_500", 500))).toBe("server");
  expect(classifyDailyError(new DailyApiError("network", 0))).toBe("network");
  expect(classifyDailyError(new TypeError("x"))).toBe("network");
});

test("the client sends JSON same-origin, keeps known tiers in order and reports codes", async () => {
  let signedOut = 0;
  const finished = { date: "2026-10-11", tier: "hard", mode: "ranked", totalScore: 900, correctCount: 1, durationMs: 1000, ranked: true, rounds: [] };
  const { fetch, calls } = fakeFetch({
    "GET /api/guess-music/daily": () =>
      json({ date: "2026-10-11", timezone: "+08:00", nextResetAt: "", server: "tw", authEnabled: true, ready: true, tiers: [{ id: "hard" }, { id: "nightmare" }, { id: "hell", vocalRemoval: true, available: false }, { id: "easy", available: false }] }),
    "POST /api/guess-music/daily/sessions": (init) => {
      const body = JSON.parse(String(init?.body)) as { tier: string };
      return body.tier === "hard" ? json({ error: "already_played", result: finished }, 409) : json({ error: "signed_out" }, 401);
    },
  });
  const api = createDailyApi({ fetch, onSignedOut: () => signedOut++ });

  const info = await api.getInfo();
  expect(info.tiers.map((tier) => [tier.id, tier.available])).toEqual([["easy", false], ["hard", true], ["hell", false]]);
  expect(calls[0]?.init?.credentials).toBe("same-origin");
  expect(calls[0]?.init?.cache).toBe("no-store");

  const played = await api.createSession("hard", "ranked").catch((error: unknown) => error);
  expect(played).toBeInstanceOf(DailyApiError);
  expect((played as DailyApiError).code).toBe("already_played");
  expect((played as DailyApiError).result?.totalScore).toBe(900);
  expect((calls[1]?.init?.headers as Record<string, string>)["content-type"]).toBe("application/json");

  const out = await api.createSession("easy", "ranked").catch((error: unknown) => error);
  expect((out as DailyApiError).code).toBe("signed_out");
  expect(signedOut).toBe(1);

  // No API behind the proxy: an HTML 404.
  const missing = await api.leaderboard({ tier: "easy" }).catch((error: unknown) => error);
  expect(classifyDailyError(missing)).toBe("unavailable");
});

async function seal(plain: Uint8Array<ArrayBuffer>): Promise<{ sealed: Uint8Array<ArrayBuffer>; key: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const sealed = new Uint8Array(nonce.length + cipher.length);
  sealed.set(nonce);
  sealed.set(cipher, nonce.length);
  const b64 = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { sealed, key: b64 };
}

test("a sealed clip opens with its key, the server's elapsed time sets the timer, and the next clip is prefetched", async () => {
  const clip0 = new Uint8Array([0xff, 0xf1, 1, 2, 3]);
  const clip1 = new Uint8Array([0xff, 0xf1, 4, 5, 6]);
  const s0 = await seal(clip0);
  const s1 = await seal(clip1);
  const base = "/api/guess-music/daily/sessions/abc/rounds";
  const { fetch, calls } = fakeFetch({
    [`GET ${base}/0/sealed`]: () => new Response(s0.sealed, { headers: { "content-type": "application/octet-stream" } }),
    [`GET ${base}/1/sealed`]: () => new Response(s1.sealed, { headers: { "content-type": "application/octet-stream" } }),
    [`POST ${base}/0/key`]: () => json({ key: s0.key, contentType: "audio/aac", elapsedMs: 5000 }),
    [`POST ${base}/1/key`]: () => json({ key: s0.key, contentType: "audio/aac", elapsedMs: 0 }),
  });
  const api = createDailyApi({ fetch });
  const start0: DailyRoundStart = { round: 0, clipSeconds: 15, timeLimitSeconds: 45, sealedClipUrl: `${base}/0/sealed`, keyUrl: `${base}/0/key`, nextSealedClipUrl: `${base}/1/sealed` };
  const start1: DailyRoundStart = { round: 1, clipSeconds: 15, timeLimitSeconds: 45, sealedClipUrl: `${base}/1/sealed`, keyUrl: `${base}/1/key` };

  const sealed0 = await api.downloadRoundClip(start0);
  const before = Date.now();
  const opened = await api.unlockRoundClip(sealed0);
  expect(new Uint8Array(await opened.clip.arrayBuffer())).toEqual(clip0);
  expect(opened.clip.type).toBe("audio/aac");
  expect(before - opened.timerStartedAt).toBeGreaterThanOrEqual(4900);

  api.prefetchNextClip(start0);
  const sealed1 = await api.downloadRoundClip(start1);
  expect(calls.filter((call) => call.url === `${base}/1/sealed`)).toHaveLength(1);
  // Round 1's key is not round 0's: the clip will not open.
  const wrongKey = await api.unlockRoundClip(sealed1).catch((error: unknown) => error);
  expect((wrongKey as DailyApiError).code).toBe("bad_clip");
});

/** Runs `body` with a window whose session storage is `memory`; other tests keep seeing no window (SSR). */
function withSessionStorage(body: (memory: Map<string, string>) => void): void {
  const memory = new Map<string, string>();
  const host = globalThis as { window?: unknown };
  const previous = host.window;
  host.window = {
    sessionStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  };
  try {
    body(memory);
  } finally {
    if (previous === undefined) delete host.window;
    else host.window = previous;
  }
}

function run(patch: Partial<StoredDailyRun>): StoredDailyRun {
  return { date: "2026-10-11", tier: "easy", mode: "practice", sessionId: "s1", ranked: false, rounds: 20, round: 3, totalScore: 1200, combo: 2, answered: [], wrongGuesses: [7], ...patch };
}

test("runs survive a reload per date, tier and mode, and other days are pruned", () => withSessionStorage((memory) => {
  saveStoredRun(run({}));
  saveStoredRun(run({ mode: "ranked", sessionId: "s2" }));
  saveStoredRun(run({ date: "2026-10-10", sessionId: "old" }));
  expect(loadStoredRun("2026-10-11", "easy", "practice")?.wrongGuesses).toEqual([7]);
  expect(loadStoredRun("2026-10-11", "easy", "ranked")?.ranked).toBe(true);
  expect(loadStoredRun("2026-10-11", "hard", "practice")).toBeNull();
  pruneStoredRuns("2026-10-11");
  expect(loadStoredRun("2026-10-10", "easy", "practice")).toBeNull();
  clearStoredRun("2026-10-11", "easy", "practice");
  expect(loadStoredRun("2026-10-11", "easy", "practice")).toBeNull();
  clearStoredRun("2026-10-11", "easy", "ranked");
  expect(memory.size).toBe(0);
  memory.set("moenotes:guess-music:daily-runs", "{broken");
  expect(loadStoredRun("2026-10-11", "easy", "ranked")).toBeNull();
}));

test("the shown potential follows the server's scoring", () => {
  // Same figures as the starmoe-api tests: a first try on a 2-streak scores 1250.
  expect(dailyPotential(0, 45, 0, 0)).toBe(1000);
  expect(dailyPotential(0, 45, 1, 0)).toBe(1250);
  // A wrong guess breaks the combo and halves the round.
  expect(dailyPotential(0, 45, 5, 1)).toBe(500);
  expect(dailyPotential(45_000, 45, 0, 0)).toBe(100);
  expect(dailyPotential(9_000, 45, 0, 2)).toBe(200);
  expect(dailyComboMultiplier(9)).toBe(2);
  expect([1.25, 1.5, 2, 2.5].map(formatMultiplier)).toEqual(["1.25", "1.5", "2.0", "2.5"]);
});

test("durations, countdowns and the leaderboard's dates format for display", () => {
  expect(formatDuration(83_456)).toBe("1:23.5");
  expect(formatDuration(9_950)).toBe("0:10.0");
  expect(formatCountdown(3_723_000)).toBe("01:02:03");
  const dates = recentDates("2026-03-01", 2);
  expect(dates).toEqual(["2026-03-01", "2026-02-28", "2026-02-27"]);
  expect(recentDates("2026-10-11")).toHaveLength(31);
});

test("free play's vocal-free clips: the song list is cleaned up and only the API's own clip links are accepted", async () => {
  let clipUrl = "/api/guess-music/practice/clips/abc";
  const { fetch, calls } = fakeFetch({
    "GET /api/guess-music/practice/instrumentals": () => json({ available: true, server: "tw", musicIds: [3, 0, "4", 5.5, 7] }),
    "POST /api/guess-music/practice/clips": (init) => {
      const body = JSON.parse(String(init?.body)) as { musicId: number };
      return body.musicId === 9 ? json({ error: "inst_unavailable" }, 409) : json({ clipUrl, startSeconds: 41.3, clipSeconds: 5 });
    },
  });
  const api = createPracticeApi({ fetch });
  expect(await api.instrumentals()).toEqual({ available: true, server: "tw", musicIds: [3, 7] });

  const request = { musicId: 3, clipSeconds: 5 as const, seed: "seed", round: 4 };
  expect(await api.clip(request)).toEqual({ clipUrl, startSeconds: 41.3 });
  const post = calls[1]!;
  expect(JSON.parse(String(post.init?.body))).toEqual(request);
  expect(post.init?.credentials).toBe("same-origin");
  expect((post.init?.headers as Record<string, string>)["content-type"]).toBe("application/json");

  const off = await api.clip({ ...request, musicId: 9 }).catch((error: unknown) => error);
  expect((off as DailyApiError).code).toBe("inst_unavailable");
  clipUrl = "https://elsewhere.example/clip.aac";
  const foreign = await api.clip(request).catch((error: unknown) => error);
  expect((foreign as DailyApiError).code).toBe("bad_response");

  const none = createPracticeApi({ fetch: async () => json({ available: true, server: "tw", musicIds: [] }) });
  expect((await none.instrumentals()).available).toBe(false);
});
