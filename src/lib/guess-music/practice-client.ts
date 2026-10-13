/**
 * Free play's vocal-free clips from starmoe-api (`/api/guess-music/practice`, its README "Instrumentals"). Free play
 * plays the full tracks of the asset service, except with vocal removal: the instrumentals are private, so the server
 * cuts each clip, picks where it starts from the game's seed and round, and hands out a short-lived link to it.
 */
import { guessMusicApi } from "@/config/account";
import { DailyApiError, isAbortError, toError, type FetchLike } from "./daily-client";
import type { ClipSeconds } from "./scoring";

const ROOT = guessMusicApi.practice;

/** The songs free play can play without vocals. */
export interface PracticeInstrumentals {
  available: boolean;
  /** The game server whose songs they are. */
  server: string;
  musicIds: number[];
}

export interface PracticeClipRequest {
  musicId: number;
  clipSeconds: ClipSeconds;
  seed: string;
  /** The round's index in the game: with the seed it decides where the clip starts. */
  round: number;
}

export interface PracticeClip {
  /** Same-origin link to the clip (audio/aac); it expires after 30 minutes. */
  clipUrl: string;
  /** Where the clip starts in the song. */
  startSeconds: number;
}

export interface PracticeApi {
  instrumentals(signal?: AbortSignal): Promise<PracticeInstrumentals>;
  clip(request: PracticeClipRequest, signal?: AbortSignal): Promise<PracticeClip>;
}

/** Failures reject with DailyApiError: the server's code ("inst_unavailable", "unknown_song", ...) or "network". */
export function createPracticeApi(options: { fetch?: FetchLike } = {}): PracticeApi {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function json(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const init: RequestInit = { method, headers: { accept: "application/json" }, credentials: "same-origin" };
    if (signal) init.signal = signal;
    if (body !== undefined) {
      init.headers = { accept: "application/json", "content-type": "application/json" };
      init.body = JSON.stringify(body);
      init.cache = "no-store";
    }
    let response: Response;
    try {
      response = await doFetch(path, init);
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new DailyApiError("network", 0);
    }
    if (!response.ok) throw await toError(response);
    try {
      const data: unknown = await response.json();
      if (data && typeof data === "object") return data as Record<string, unknown>;
    } catch {
      // Falls through to bad_response.
    }
    throw new DailyApiError("bad_response", response.status);
  }

  return {
    async instrumentals(signal) {
      const data = await json("GET", `${ROOT}/instrumentals`, undefined, signal);
      const musicIds = Array.isArray(data.musicIds) ? data.musicIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
      return { available: data.available === true && musicIds.length > 0, server: typeof data.server === "string" ? data.server : "", musicIds };
    },
    async clip(request, signal) {
      const data = await json("POST", `${ROOT}/clips`, request, signal);
      const clipUrl = typeof data.clipUrl === "string" ? data.clipUrl : "";
      // Only ever this API's own clip links: the audio element loads whatever it is given.
      if (!clipUrl.startsWith(`${ROOT}/clips/`)) throw new DailyApiError("bad_response", 200);
      const startSeconds = typeof data.startSeconds === "number" && Number.isFinite(data.startSeconds) ? data.startSeconds : 0;
      return { clipUrl, startSeconds };
    },
  };
}
