import { roomCheckConfig, roomCheckRootUrl, roomCheckUrl, ROOM_CHECK_MOCK } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { createMockRoomApi, type MockPool } from "./mock";
import { parseCreatedRoom, parseRoomError, parseRoomSnapshot, parseWatchEvent } from "./parse";
import type { CreatedRoom, RoomError, RoomSnapshot, WatchStop } from "./types";

export type RoomReply = { ok: true; snapshot: RoomSnapshot } | { ok: false; error: RoomError };

export type CreateReply = { ok: true; room: CreatedRoom } | { ok: false; error: RoomError };

/** Leaving a room the page opened: `ok` once the observer is gone. */
export type KickReply = { ok: true } | { ok: false; error: RoomError };

/** Why a live view ended: the room filled up, its time ran out, the room closed, the observer left, or the service stopped it. */
export type { WatchStop } from "./types";

export interface WatchHandlers {
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onStop: (reason: WatchStop) => void;
}

export interface CreatedWatchHandlers extends WatchHandlers {
  /** Four real players are in the room, and the observer can be asked to leave; the read may be missing. */
  onAtFour: (snapshot: RoomSnapshot | null) => void;
}

export interface RoomApi {
  read(code: string, region: GameServer, signal?: AbortSignal): Promise<RoomReply>;
  /** Follows the room until it stops or the returned function is called. */
  watch(code: string, region: GameServer, handlers: WatchHandlers): () => void;
  /** Opens a room, with `code` as its number (seven digits) or without one to let the service pick. */
  create(region: GameServer, code: string | null, signal?: AbortSignal): Promise<CreateReply>;
  /** Follows a room this page opened, through the watch the service returned for it. */
  watchCreated(room: CreatedRoom, handlers: CreatedWatchHandlers): () => void;
  /** Asks the observer of a room this page opened to leave at any time. */
  kick(room: CreatedRoom): Promise<KickReply>;
  /** Abandons a room this page opened: the observer leaves at once and the room closes. */
  stopCreated(room: CreatedRoom): void;
}

const failure = (code: RoomError["code"], retryAfterMs: number | null = null): RoomReply => ({ ok: false, error: { code, retryAfterMs, snapshot: null } });

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(35_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** A refused answer: the service's error body, with the wait from its `retry-after` header when the body has none. */
function refusal(response: Response, body: unknown): RoomError {
  const error = parseRoomError(body);
  const retryAfter = Number(response.headers.get("retry-after"));
  return { ...error, retryAfterMs: error.retryAfterMs ?? (retryAfter > 0 ? retryAfter * 1000 : null) };
}

/**
 * Follows one room's event stream: each read replaces the view, `at_four` asks whether the observer should leave, and
 * the pings keep the watch alive while the page is open. `dropWatch` ends the watch with the stream, for a watch the
 * page itself asked for; a room the page opened keeps its watch until the observer leaves.
 */
function followEvents(code: string, region: GameServer, watchId: string, handlers: CreatedWatchHandlers, dropWatch: boolean): () => void {
  let closed = false;
  let ping: number | undefined;
  let initial: number | undefined;
  let received = false;
  const source = new EventSource(roomCheckUrl(code, region, ["events"], { watch: watchId }));
  const stop = (reason: WatchStop | null) => {
    if (closed) return;
    closed = true;
    source.close();
    window.clearInterval(ping);
    window.clearTimeout(initial);
    if (dropWatch) void fetch(roomCheckUrl(code, region, ["watch", watchId]), { method: "DELETE", keepalive: true }).catch(() => undefined);
    if (reason) handlers.onStop(reason);
  };
  const listen = (name: "snapshot" | "at_four" | "stopped") => {
    source.addEventListener(name, (event) => {
      const parsed = parseWatchEvent(name, (event as MessageEvent<string>).data);
      if (!parsed || closed) return;
      if (parsed.type === "snapshot") {
        window.clearTimeout(initial);
        initial = undefined;
        received = true;
        handlers.onSnapshot(parsed.snapshot);
      }
      else if (parsed.type === "at_four") handlers.onAtFour(parsed.snapshot);
      else stop(parsed.reason);
    });
  };
  listen("snapshot");
  listen("at_four");
  listen("stopped");
  initial = window.setTimeout(() => stop("error"), 35_000);
  source.onopen = () => {
    if (received) {
      window.clearTimeout(initial);
      initial = undefined;
    }
  };
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) stop("error");
    else if (!closed && initial === undefined) initial = window.setTimeout(() => stop("error"), 35_000);
  };
  ping = window.setInterval(() => {
    // Keep the watch alive even while the tab is in the background.
    // Browsers throttle hidden timers, but a minute still beats the
    // service's stale window; dropping the ping there stopped a live
    // view as soon as the player switched back to the game.
    void fetch(roomCheckUrl(code, region, ["watch", watchId, "ping"]), { method: "POST" })
      .then((reply) => { if (reply.status === 404) stop("lease"); else if (reply.status === 401 || reply.status === 403) stop("error"); }, () => undefined);
  }, roomCheckConfig.watchPingMs);
  return () => stop(null);
}

/** The room query service over HTTP and server-sent events. */
export const httpRoomApi: RoomApi = {
  async read(code, region, signal) {
    let response: Response;
    try {
      response = await fetch(roomCheckUrl(code, region), { signal: requestSignal(signal), headers: { accept: "application/json" } });
    } catch (error) {
      if (signal?.aborted) throw error;
      return failure("network");
    }
    const body = await readJson(response);
    if (response.ok) {
      const snapshot = parseRoomSnapshot(body);
      return snapshot ? { ok: true, snapshot } : failure("invalid");
    }
    return { ok: false, error: refusal(response, body) };
  },

  watch(code, region, handlers) {
    let closed = false;
    let stopFollow: (() => void) | null = null;
    void (async () => {
      try {
        const response = await fetch(roomCheckUrl(code, region, ["watch"]), { method: "POST", signal: requestSignal() });
        const body = await readJson(response) as { watchId?: unknown } | null;
        if (!response.ok || typeof body?.watchId !== "string") {
          if (!closed) handlers.onStop("error");
          return;
        }
        if (closed) {
          void fetch(roomCheckUrl(code, region, ["watch", body.watchId]), { method: "DELETE", keepalive: true }).catch(() => undefined);
          return;
        }
        stopFollow = followEvents(code, region, body.watchId, { onSnapshot: handlers.onSnapshot, onAtFour: () => undefined, onStop: handlers.onStop }, true);
      } catch {
        if (!closed) handlers.onStop("error");
      }
    })();
    return () => {
      closed = true;
      stopFollow?.();
    };
  },

  async create(region, code, signal) {
    let response: Response;
    try {
      response = await fetch(roomCheckRootUrl(["create"]), {
        method: "POST",
        signal: requestSignal(signal),
        headers: { accept: "application/json", "content-type": "application/json" },
        // No code asks the service to pick one.
        body: JSON.stringify(code ? { region, code } : { region }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ok: false, error: { code: "network", retryAfterMs: null, snapshot: null } };
    }
    const body = await readJson(response);
    if (!response.ok) return { ok: false, error: refusal(response, body) };
    const room = parseCreatedRoom(body);
    return room ? { ok: true, room } : { ok: false, error: { code: "invalid", retryAfterMs: null, snapshot: null } };
  },

  watchCreated(room, handlers) {
    return followEvents(room.code, room.region, room.watchId, handlers, false);
  },

  async kick(room) {
    let response: Response;
    try {
      response = await fetch(roomCheckUrl(room.code, room.region, ["probe", "leave"]), { method: "POST", signal: requestSignal(), headers: { accept: "application/json" } });
    } catch {
      return { ok: false, error: { code: "network", retryAfterMs: null, snapshot: null } };
    }
    if (response.ok) return { ok: true };
    return { ok: false, error: refusal(response, await readJson(response)) };
  },

  stopCreated(room) {
    // Ending the watch sends the observer out, which closes the room it opened. The request may outlive the page.
    void fetch(roomCheckUrl(room.code, room.region, ["watch", room.watchId]), { method: "DELETE", keepalive: true }).catch(() => undefined);
  },
};

/** The page's room API: the service, or made-up rooms drawn from `pool` when the service is set to `mock`. */
export function createRoomApi(pool: MockPool): RoomApi {
  return ROOM_CHECK_MOCK ? createMockRoomApi(pool) : httpRoomApi;
}
