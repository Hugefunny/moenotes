import { roomCheckConfig, roomCheckUrl, ROOM_CHECK_MOCK } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { createMockRoomApi, type MockPool } from "./mock";
import { parseRoomError, parseRoomSnapshot } from "./parse";
import type { RoomError, RoomSnapshot } from "./types";

export type RoomReply = { ok: true; snapshot: RoomSnapshot } | { ok: false; error: RoomError };

/** Why a live view ended: the room filled up, its time ran out, the room closed, or the service stopped it. */
export type WatchStop = "full" | "lease" | "closed" | "error";

export interface WatchHandlers {
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onStop: (reason: WatchStop) => void;
}

export interface RoomApi {
  read(code: string, region: GameServer, signal?: AbortSignal): Promise<RoomReply>;
  /** Follows the room until it stops or the returned function is called. */
  watch(code: string, region: GameServer, handlers: WatchHandlers): () => void;
}

const failure = (code: RoomError["code"], retryAfterMs: number | null = null): RoomReply => ({ ok: false, error: { code, retryAfterMs, snapshot: null } });

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The room query service over HTTP and server-sent events. */
export const httpRoomApi: RoomApi = {
  async read(code, region, signal) {
    let response: Response;
    try {
      response = await fetch(roomCheckUrl(code, region), { signal: signal ?? null, headers: { accept: "application/json" } });
    } catch (error) {
      if (signal?.aborted) throw error;
      return failure("network");
    }
    const body = await readJson(response);
    if (response.ok) {
      const snapshot = parseRoomSnapshot(body);
      return snapshot ? { ok: true, snapshot } : failure("invalid");
    }
    const error = parseRoomError(body);
    const retryAfter = Number(response.headers.get("retry-after"));
    return { ok: false, error: { ...error, retryAfterMs: error.retryAfterMs ?? (retryAfter > 0 ? retryAfter * 1000 : null) } };
  },

  watch(code, region, handlers) {
    let closed = false;
    let source: EventSource | null = null;
    let ping: number | undefined;
    let watchId: string | null = null;
    const stop = (reason: WatchStop | null) => {
      if (closed) return;
      closed = true;
      source?.close();
      window.clearInterval(ping);
      if (watchId) void fetch(roomCheckUrl(code, region, ["watch", watchId]), { method: "DELETE", keepalive: true }).catch(() => undefined);
      if (reason) handlers.onStop(reason);
    };
    void (async () => {
      try {
        const response = await fetch(roomCheckUrl(code, region, ["watch"]), { method: "POST" });
        const body = await readJson(response) as { watchId?: unknown } | null;
        if (!response.ok || typeof body?.watchId !== "string") return stop("error");
        watchId = body.watchId;
        if (closed) return stop(null);
        source = new EventSource(roomCheckUrl(code, region, ["events"], { watch: watchId }));
        source.addEventListener("snapshot", (event) => {
          const snapshot = parseRoomSnapshot(JSON.parse((event as MessageEvent<string>).data));
          if (snapshot) handlers.onSnapshot(snapshot);
        });
        source.addEventListener("stopped", (event) => {
          const reason = (JSON.parse((event as MessageEvent<string>).data) as { reason?: unknown }).reason;
          stop(reason === "full" || reason === "lease" || reason === "closed" ? reason : "error");
        });
        source.onerror = () => {
          if (source?.readyState === EventSource.CLOSED) stop("error");
        };
        ping = window.setInterval(() => {
          // Keep the lease alive even while the tab is in the background.
          // Browsers throttle hidden timers, but a minute still beats the
          // service's stale window; dropping the ping there stopped a live
          // view as soon as the player switched back to the game.
          void fetch(roomCheckUrl(code, region, ["watch", watchId!, "ping"]), { method: "POST" })
            .then((reply) => { if (!reply.ok) stop("lease"); }, () => undefined);
        }, roomCheckConfig.watchPingMs);
      } catch {
        stop("error");
      }
    })();
    return () => stop(null);
  },
};

/** The page's room API: the service, or made-up rooms drawn from `pool` when the service is set to `mock`. */
export function createRoomApi(pool: MockPool): RoomApi {
  return ROOM_CHECK_MOCK ? createMockRoomApi(pool) : httpRoomApi;
}
