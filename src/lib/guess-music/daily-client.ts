/**
 * Client of the guess-the-song daily challenge in starmoe-api (`/api/guess-music/daily`, its README "Guess the song").
 *
 * Four tiers, each with a ranked set (StarMoe Passport sign-in, one run a day, on the leaderboard) and a practice set
 * per day; the vocal-free one can be unavailable. Pages reach the API same-origin through the deploy server's `/api` proxy, so the session cookie rides
 * along. Failures surface as DailyApiError with the server's error code, or a synthetic one ("network",
 * "bad_response", "bad_clip", "http_<status>") when the server sent none or a sealed clip would not open.
 */
import { guessMusicApi } from "@/config/account";
import { safeGetSessionStorage, safeRemoveSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import type { AnswerMode } from "./scoring";

export const DAILY_TIER_IDS = ["easy", "normal", "hard", "hell"] as const;
export type DailyTierId = (typeof DAILY_TIER_IDS)[number];
export type DailyMode = "ranked" | "practice";

export function isDailyTierId(value: unknown): value is DailyTierId {
  return typeof value === "string" && (DAILY_TIER_IDS as readonly string[]).includes(value);
}

export interface DailyTierInfo {
  id: DailyTierId;
  rounds: number;
  clipSeconds: number;
  timeLimitSeconds: number;
  answerMode: AnswerMode;
  /** Choice mode only: how many options each round offers. */
  optionCount?: number;
  /** The clips play without vocals. */
  vocalRemoval?: boolean;
  /** False when the tier cannot be played today (the vocal-free one before its instrumentals are in). */
  available: boolean;
}

export interface DailyTierStatus {
  status: "in_progress" | "finished";
  /** In progress: the next unanswered round (0-based). */
  resumeRound?: number;
  score?: number;
  rank?: number;
}

export interface DailyInfo {
  date: string;
  timezone: string;
  /** RFC 3339 instant of the next day boundary. */
  nextResetAt: string;
  /** The Our Notes server the songs come from. */
  server: string;
  authEnabled: boolean;
  /** False until the server has loaded the master data. */
  ready: boolean;
  tiers: DailyTierInfo[];
  /** Only with a signed-in session; tiers not played today are absent. */
  me?: { tiers: Partial<Record<DailyTierId, DailyTierStatus>> };
}

export interface DailyAvatar {
  kind: "character";
  id: number;
}

/** A player as they were when their ranked run started. */
export interface DailyPlayer {
  name: string;
  /** The passport picture. */
  picture?: string;
  /** The site avatar the player picked instead. */
  avatar?: DailyAvatar;
}

export interface DailySession {
  sessionId: string;
  date: string;
  tier: DailyTierId;
  mode: DailyMode;
  ranked: boolean;
  player?: DailyPlayer;
  rounds: number;
  /** The next unanswered round (0-based); 0 for a fresh session. */
  resumeRound: number;
  totalScore: number;
  combo: number;
}

export interface DailyRoundStart {
  round: number;
  clipSeconds: number;
  timeLimitSeconds: number;
  /** The clip encrypted: downloading it starts nothing. */
  sealedClipUrl: string;
  /** POST: the sealed clip's key; the first request starts the round timer. */
  keyUrl: string;
  /** The next round's sealed clip, downloadable while this round plays (absent on the last round). */
  nextSealedClipUrl?: string;
  /** Choice mode: the song ids to choose from (shuffled, the answer among them). */
  options?: number[];
}

/** A downloaded sealed clip: silent, and the round timer not started, until unlockRoundClip fetches its key. */
export interface DailySealedClip {
  bytes: ArrayBuffer;
  keyUrl: string;
}

/** A round's clip, ready to play. */
export interface DailyRoundClip {
  clip: Blob;
  /** When (Date.now() clock) the server's round timer started. */
  timerStartedAt: number;
}

interface DailyClipKey {
  /** AES-256-GCM key, base64url. */
  key: string;
  contentType: string;
  /** How long the round timer has run: 0 when this request started it. */
  elapsedMs: number;
}

/** The answer of a round; only sent once the round is final. */
export interface DailyReveal {
  musicId: number;
  startSeconds: number;
  clipSeconds: number;
}

export type DailyOutcome = "correct" | "strikes" | "timeout" | "gave_up";

export interface DailyAnswerResult {
  correct: boolean;
  final: boolean;
  strikesLeft: number;
  points: number;
  totalScore: number;
  combo: number;
  outcome?: DailyOutcome;
  answer?: DailyReveal;
}

export interface DailyRoundSummary {
  round: number;
  correct: boolean;
  outcome: DailyOutcome;
  points: number;
  attempts: number;
  elapsedMs: number;
  answer: DailyReveal;
}

export interface DailyFinishResult {
  date: string;
  tier: DailyTierId;
  mode: DailyMode;
  totalScore: number;
  correctCount: number;
  durationMs: number;
  ranked: boolean;
  rank?: number;
  totalPlayers?: number;
  rounds: DailyRoundSummary[];
}

/** A player's public Our Notes account. */
export interface DailyGameSummary {
  server: string;
  profileId: string;
  name: string;
}

export interface DailyLeaderboardEntry {
  rank: number;
  player: DailyPlayer;
  score: number;
  correctCount: number;
  durationMs: number;
  game?: DailyGameSummary;
  /** The requesting player's own row. */
  me?: boolean;
}

export interface DailyLeaderboard {
  date: string;
  tier: DailyTierId;
  totalPlayers: number;
  entries: DailyLeaderboardEntry[];
  me?: { rank: number; score: number; correctCount: number; durationMs: number };
}

/** What the UI needs to know about a failure. */
export type DailyErrorKind =
  | "alreadyPlayed"
  | "signedOut"
  | "rankedUnavailable"
  | "authUnavailable"
  | "rateLimited"
  | "sessionExpired"
  | "clipNotServed"
  | "clipUnavailable"
  | "conflict"
  | "notReady"
  /** The tier cannot be played today (the vocal-free one without its instrumentals). */
  | "tierUnavailable"
  /** No daily challenge here: a static preview, a dev server without starmoe-api, or the game is off. */
  | "unavailable"
  | "network"
  | "server";

export class DailyApiError extends Error {
  /** Server error code, or "network" / "bad_response" / "bad_clip" / "http_<status>". */
  readonly code: string;
  /** HTTP status; 0 when the request never got a response. */
  readonly status: number;
  /** The finished run, sent with 409 already_played. */
  readonly result: DailyFinishResult | undefined;

  constructor(code: string, status: number, result?: DailyFinishResult) {
    super(code);
    this.name = "DailyApiError";
    this.code = code;
    this.status = status;
    this.result = result;
  }
}

export function classifyDailyError(error: unknown): DailyErrorKind {
  if (!(error instanceof DailyApiError)) return "network";
  const { code, status } = error;
  if (code === "already_played") return "alreadyPlayed";
  if (code === "signed_out" || status === 401) return "signedOut";
  if (code === "ranked_unavailable") return "rankedUnavailable";
  if (code === "auth_unavailable") return "authUnavailable";
  if (code === "clip_not_served") return "clipNotServed";
  if (code === "clip_unavailable") return "clipUnavailable";
  if (code === "not_ready") return "notReady";
  if (code === "tier_unavailable") return "tierUnavailable";
  if (code === "rate_limited" || status === 429) return "rateLimited";
  if (code === "session_not_found") return "sessionExpired";
  // Anything else that is not the game's JSON (the proxy without an API, a plain 404 page) means no game here.
  if (code.startsWith("http_") || code === "bad_response" || code === "not_found") return status >= 500 && status !== 501 && status !== 502 ? "server" : "unavailable";
  if (status === 409) return "conflict";
  if (code === "network" || status === 0) return "network";
  return "server";
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DailyApi {
  getInfo(signal?: AbortSignal): Promise<DailyInfo>;
  /** Ranked: resumes today's unfinished run or rejects with already_played. Practice: always a new run. */
  createSession(tier: DailyTierId, mode: DailyMode): Promise<DailySession>;
  startRound(sessionId: string, round: number): Promise<DailyRoundStart>;
  /** The round's sealed clip: downloading it starts nothing, so neither a slow cut nor a slow connection costs time. */
  downloadRoundClip(start: DailyRoundStart, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<DailySealedClip>;
  /** Downloads the next round's sealed clip in the background, for downloadRoundClip to take when that round starts. */
  prefetchNextClip(start: DailyRoundStart): void;
  /** Fetches a sealed clip's key, which starts the round timer (or says how long it has run), and opens the clip. */
  unlockRoundClip(sealed: DailySealedClip, signal?: AbortSignal): Promise<DailyRoundClip>;
  answer(sessionId: string, round: number, musicId: number | null): Promise<DailyAnswerResult>;
  finish(sessionId: string): Promise<DailyFinishResult>;
  leaderboard(query: { tier: DailyTierId; date?: string; limit?: number }, signal?: AbortSignal): Promise<DailyLeaderboard>;
}

const ROOT = guessMusicApi.daily;
/** AES-GCM nonce length in front of a sealed clip. */
const SEAL_NONCE_BYTES = 12;

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decrypts a sealed clip: a 12-byte nonce, then AES-256-GCM ciphertext and tag. */
async function openSealedClip(sealed: ArrayBuffer, key: DailyClipKey): Promise<Blob> {
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", base64UrlBytes(key.key), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(sealed, 0, SEAL_NONCE_BYTES) }, cryptoKey, new Uint8Array(sealed, SEAL_NONCE_BYTES));
    return new Blob([plain], { type: key.contentType || "audio/aac" });
  } catch {
    throw new DailyApiError("bad_clip", 0);
  }
}

/** Known tiers only, in the canonical order. */
function normalizeInfo(info: DailyInfo): DailyInfo {
  const tiers = Array.isArray(info?.tiers) ? info.tiers.filter((tier) => tier && isDailyTierId(tier.id)).map((tier) => ({ ...tier, available: tier.available !== false })) : [];
  tiers.sort((a, b) => DAILY_TIER_IDS.indexOf(a.id) - DAILY_TIER_IDS.indexOf(b.id));
  return { ...info, tiers };
}

/** The error of a failed response: the game's `{"error": code}`, else `http_<status>`. */
export async function toError(response: Response): Promise<DailyApiError> {
  let data: Record<string, unknown> | null = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      // Not JSON after all.
    }
  }
  const code = typeof data?.error === "string" && data.error ? data.error : `http_${response.status}`;
  const result = data?.result && typeof data.result === "object" ? (data.result as DailyFinishResult) : undefined;
  return new DailyApiError(code, response.status, result);
}

/** The body's bytes, reporting how much has arrived when the length is known. */
async function readBytes(response: Response, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
  const length = Number(response.headers.get("Content-Length"));
  if (!onProgress || !response.body || !(length > 0)) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(Math.min(1, received / length));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export function createDailyApi(options: { fetch?: FetchLike; onSignedOut?: () => void } = {}): DailyApi {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function send(method: string, path: string, body?: unknown, signal?: AbortSignal, accept = "application/json"): Promise<Response> {
    const headers: Record<string, string> = { accept };
    const init: RequestInit = { method, headers, cache: "no-store", credentials: "same-origin" };
    if (signal) init.signal = signal;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await doFetch(path, init);
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new DailyApiError("network", 0);
    }
    if (!response.ok) {
      // Only calls that need the player answer 401, so it always means the session is gone.
      if (response.status === 401) options.onSignedOut?.();
      throw await toError(response);
    }
    return response;
  }

  async function json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await send(method, path, body, signal);
    if (!response.headers.get("content-type")?.includes("application/json")) throw new DailyApiError("bad_response", response.status);
    try {
      return (await response.json()) as T;
    } catch {
      throw new DailyApiError("bad_response", response.status);
    }
  }

  const session = (sessionId: string) => `${ROOT}/sessions/${encodeURIComponent(sessionId)}`;
  const fetchSealed = async (url: string, signal: AbortSignal | undefined, onProgress?: (fraction: number) => void) =>
    readBytes(await send("GET", url, undefined, signal, "application/octet-stream"), onProgress);

  // The next round's sealed clip, downloading while the current round plays.
  let ahead: { url: string; bytes: Promise<ArrayBuffer>; controller: AbortController; fraction: number; report?: ((fraction: number) => void) | undefined } | null = null;

  /** The clip prefetched for url, or null (none, or its download failed: fetch it again). */
  async function takeAhead(url: string, signal: AbortSignal | undefined, onProgress?: (fraction: number) => void): Promise<ArrayBuffer | null> {
    const pending = ahead;
    if (!pending || pending.url !== url) return null;
    ahead = null;
    pending.report = onProgress;
    onProgress?.(pending.fraction);
    const abort = () => pending.controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await pending.bytes;
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  return {
    getInfo: async (signal) => normalizeInfo(await json<DailyInfo>("GET", ROOT, undefined, signal)),
    createSession: (tier, mode) => json<DailySession>("POST", `${ROOT}/sessions`, { tier, mode }),
    startRound: (sessionId, round) => json<DailyRoundStart>("POST", `${session(sessionId)}/rounds/${round}/start`, {}),
    async downloadRoundClip(start, signal, onProgress) {
      const bytes = (await takeAhead(start.sealedClipUrl, signal, onProgress)) ?? (await fetchSealed(start.sealedClipUrl, signal, onProgress));
      return { bytes, keyUrl: start.keyUrl };
    },
    prefetchNextClip(start) {
      const url = start.nextSealedClipUrl;
      if (!url || ahead?.url === url) return;
      ahead?.controller.abort();
      const controller = new AbortController();
      const entry: NonNullable<typeof ahead> = { url, controller, fraction: 0, bytes: Promise.resolve(new ArrayBuffer(0)) };
      entry.bytes = fetchSealed(url, controller.signal, (fraction) => {
        entry.fraction = fraction;
        entry.report?.(fraction);
      });
      // Nobody may take it; a failure is handled by the round that does.
      entry.bytes.catch(() => {});
      ahead = entry;
    },
    async unlockRoundClip(sealed, signal) {
      const key = await json<DailyClipKey>("POST", sealed.keyUrl, {}, signal);
      const timerStartedAt = Date.now() - Math.max(0, Number(key.elapsedMs) || 0);
      return { clip: await openSealedClip(sealed.bytes, key), timerStartedAt };
    },
    answer: (sessionId, round, musicId) => json<DailyAnswerResult>("POST", `${session(sessionId)}/rounds/${round}/answer`, { musicId }),
    finish: (sessionId) => json<DailyFinishResult>("POST", `${session(sessionId)}/finish`, {}),
    leaderboard(query, signal) {
      const params = new URLSearchParams({ tier: query.tier });
      if (query.date) params.set("date", query.date);
      if (query.limit) params.set("limit", String(query.limit));
      return json<DailyLeaderboard>("GET", `${ROOT}/leaderboard?${params.toString()}`, undefined, signal);
    },
  };
}

/** The combo multiplier of the daily scoring: +0.25 per first-try answer in a row from the second, up to 2. */
export function dailyComboMultiplier(combo: number): number {
  return combo >= 2 ? Math.min(2, 1 + 0.25 * (combo - 1)) : 1;
}

/**
 * What a right answer would score now, as the server counts it: 1000 × the time left (at least a tenth) × the combo
 * multiplier the answer would reach × one half per wrong guess. A wrong guess first breaks the combo.
 */
export function dailyPotential(elapsedMs: number, timeLimitSeconds: number, combo: number, wrong: number): number {
  const timeFactor = Math.min(1, Math.max(0.1, 1 - elapsedMs / (timeLimitSeconds * 1000)));
  const multiplier = wrong === 0 ? dailyComboMultiplier(combo + 1) : 1;
  return Math.floor(1000 * timeFactor * multiplier * 0.5 ** wrong + 1e-6);
}

/* ---------- Reload persistence (session storage, one run per date, tier and mode) ---------- */

/** A round answered in this browser, kept so a reload can show it again. */
export interface StoredRound {
  round: number;
  correct: boolean;
  points: number;
}

export interface StoredDailyRun {
  date: string;
  tier: DailyTierId;
  mode: DailyMode;
  sessionId: string;
  ranked: boolean;
  /** Rounds in the set. */
  rounds: number;
  /** The round being played or next to play. */
  round: number;
  totalScore: number;
  combo: number;
  answered: StoredRound[];
  /** Wrong song ids guessed in the current round. */
  wrongGuesses: number[];
  /** When (Date.now() clock) the current round's timer started on the server. */
  timerStartedAt?: number | undefined;
}

/** Every run of this tab under one key: `date:tier:mode` → run. */
const STORAGE_KEY = "moenotes:guess-music:daily-runs";

function runKey(date: string, tier: DailyTierId, mode: DailyMode): string {
  return `${date}:${tier}:${mode}`;
}

function readRuns(): Record<string, StoredDailyRun> {
  try {
    const parsed: unknown = JSON.parse(safeGetSessionStorage(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, StoredDailyRun>) : {};
  } catch {
    return {};
  }
}

function writeRuns(runs: Record<string, StoredDailyRun>): void {
  // Private mode or storage disabled: the runs just will not survive a reload.
  if (Object.keys(runs).length) safeSetSessionStorage(STORAGE_KEY, JSON.stringify(runs));
  else safeRemoveSessionStorage(STORAGE_KEY);
}

export function loadStoredRun(date: string, tier: DailyTierId, mode: DailyMode): StoredDailyRun | null {
  const run = readRuns()[runKey(date, tier, mode)];
  if (!run || run.date !== date || run.tier !== tier || run.mode !== mode || typeof run.sessionId !== "string" || !run.sessionId) return null;
  return {
    ...run,
    ranked: mode === "ranked",
    rounds: Number(run.rounds) > 0 ? Number(run.rounds) : 20,
    round: Number.isInteger(run.round) && run.round >= 0 ? run.round : 0,
    totalScore: Number(run.totalScore) || 0,
    combo: Number(run.combo) || 0,
    answered: Array.isArray(run.answered) ? run.answered : [],
    wrongGuesses: Array.isArray(run.wrongGuesses) ? run.wrongGuesses.filter((id) => Number.isInteger(id)) : [],
  };
}

export function saveStoredRun(run: StoredDailyRun): void {
  writeRuns({ ...readRuns(), [runKey(run.date, run.tier, run.mode)]: run });
}

export function clearStoredRun(date: string, tier: DailyTierId, mode: DailyMode): void {
  const runs = readRuns();
  const key = runKey(date, tier, mode);
  if (!(key in runs)) return;
  delete runs[key];
  writeRuns(runs);
}

/** Drops runs of other days. */
export function pruneStoredRuns(today: string): void {
  const runs = readRuns();
  const kept = Object.fromEntries(Object.entries(runs).filter(([key]) => key.startsWith(`${today}:`)));
  if (Object.keys(kept).length !== Object.keys(runs).length) writeRuns(kept);
}

/* ---------- Small helpers shared by the daily UI ---------- */

/** Milliseconds until an RFC 3339 instant (never negative). */
export function msUntil(isoInstant: string, now: number = Date.now()): number {
  const at = Date.parse(isoInstant);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** "HH:MM:SS" for a countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "M:SS.s" for a run duration or a round's elapsed time. */
export function formatDuration(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** The given day and the previous `days` days, newest first, as YYYY-MM-DD. */
export function recentDates(today: string, days = 30): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return [today];
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const out: string[] = [];
  for (let i = 0; i <= days; i++) out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}
