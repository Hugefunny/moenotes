import type { RoomEntry, RoomFormation, RoomPlayer, RoomRead, RoomSnapshot } from "./types";

/** The read a room shows: its newest that worked, or the shared copy a refused read came with. */
export function shownRead(entry: RoomEntry): RoomRead | null {
  if (entry.last) return entry.last;
  if (entry.error?.snapshot && entry.errorAt !== null) return { snapshot: entry.error.snapshot, receivedAt: entry.errorAt };
  return null;
}

/** The formation slot of the team's leader. */
export const LEADER_SLOT = 2;

/** Under 10 s a read counts as fresh, under a minute as aging, then as stale. */
export const FRESH_MS = 10_000;
export const AGING_MS = 60_000;

export type Freshness = "fresh" | "aging" | "stale";

/**
 * The age of a read at `now`. Both times are measured on the page's clock from when the answer arrived, so a skewed
 * device clock does not change them.
 */
export function readAge(snapshot: RoomSnapshot, receivedAt: number, now: number): number {
  return snapshot.ageMs + Math.max(0, now - receivedAt);
}

/** How long until the room can be read again; 0 when it can. */
export function refreshIn(snapshot: RoomSnapshot, receivedAt: number, now: number): number {
  return Math.max(0, snapshot.nextRefreshAt - snapshot.fetchedAt - readAge(snapshot, receivedAt, now));
}

/** The length of the wait between two reads of the room, for drawing the wait as a share of it. */
export function refreshWindow(snapshot: RoomSnapshot): number {
  return Math.max(0, snapshot.nextRefreshAt - snapshot.fetchedAt);
}

export function freshness(age: number): Freshness {
  return age < FRESH_MS ? "fresh" : age < AGING_MS ? "aging" : "stale";
}

/** How many players picked each song, most picked first; the room's song wins a tie. */
export function songVotes(snapshot: RoomSnapshot): { musicId: number; count: number; room: boolean }[] {
  const counts = new Map<number, number>();
  for (const player of snapshot.players) {
    const id = player.selection.musicId;
    if (id !== null && id > 0) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const roomSong = snapshot.room.musicId;
  return [...counts]
    .map(([musicId, count]) => ({ musicId, count, room: musicId === roomSong }))
    .sort((a, b) => b.count - a.count || Number(b.room) - Number(a.room) || a.musicId - b.musicId);
}

/** The players' character rank totals, the comparison the room shows until team power is available. */
export function rankShare(players: readonly RoomPlayer[]): Map<string, number> {
  const top = Math.max(0, ...players.map((player) => player.formation?.totalCharacterRank ?? 0));
  return new Map(players.map((player) => [key(player), top > 0 ? (player.formation?.totalCharacterRank ?? 0) / top : 0]));
}

/** A player's identity within one room snapshot. */
export function key(player: RoomPlayer): string {
  return player.idHash || `join-${player.joinOrder}`;
}

/** The average of the players' character rank totals, or null without any readable team. */
export function averageCharacterRank(snapshot: RoomSnapshot): number | null {
  const ranks = snapshot.players.flatMap((player) => (player.formation ? [player.formation.totalCharacterRank] : []));
  return ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null;
}

/** The average member card level of a team. */
export function averageLevel(formation: RoomFormation): number {
  return formation.units.length ? formation.units.reduce((sum, unit) => sum + unit.level, 0) / formation.units.length : 0;
}

/** Players whose team or song changed between two reads of the same room. */
export function changedPlayers(previous: RoomSnapshot | null, next: RoomSnapshot): Set<string> {
  if (!previous) return new Set();
  const before = new Map(previous.players.map((player) => [key(player), JSON.stringify([player.formation, player.selection, player.ready])]));
  return new Set(next.players.filter((player) => {
    const old = before.get(key(player));
    return old !== undefined && old !== JSON.stringify([player.formation, player.selection, player.ready]);
  }).map(key));
}
