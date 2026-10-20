import type { GameServer } from "./servers";

/**
 * The room query service behind Room Check, set at build time with `PUBLIC_ROOM_CHECK_API`. Pages call it from the
 * browser; `mock` serves made-up rooms in the page itself, and is what development builds use when the variable is unset.
 */
export const roomCheckConfig = {
  api: (import.meta.env.PUBLIC_ROOM_CHECK_API || (import.meta.env.DEV ? "mock" : "")).replace(/\/+$/, ""),
  /** Servers whose rooms can be looked up, in the order the switcher shows them. */
  servers: ["tw", "kr", "en"] as readonly GameServer[],
  /** Rooms the page keeps in its list. */
  maxRooms: 8,
  /** How often a live view renews itself while the page is open. */
  watchPingMs: 30_000,
} as const;

export const ROOM_CHECK_MOCK = roomCheckConfig.api === "mock";

/** A room's endpoint: `parts` are path segments after the room, e.g. `["watch", id, "ping"]`. */
export function roomCheckUrl(code: string, region: GameServer, parts: readonly string[] = [], query: Record<string, string> = {}): string {
  const path = ["v1", "rooms", code, ...parts].map(encodeURIComponent).join("/");
  return `${roomCheckConfig.api}/${path}?${new URLSearchParams({ region, ...query })}`;
}

/** The address behind Room Check's endpoints that name no room yet, e.g. `["create"]`. */
export function roomCheckRootUrl(parts: readonly string[] = []): string {
  const path = ["v1", "rooms", ...parts].map(encodeURIComponent).join("/");
  return `${roomCheckConfig.api}/${path}`;
}
