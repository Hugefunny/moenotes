import { parseMasterDate } from "@/lib/schedule";
import { buildSongIndex, type SongIndex, type SongSearchEntry } from "./answer";
import type { GuessSong } from "./songs";

/**
 * A medley of other songs credits no composer, lyricist or arranger: a clip of one is a clip of some other song, so
 * medleys are never questions or answers. Our Notes has none yet; the rule keeps a future one out.
 */
export function isMedley(song: Pick<GuessSong, "composer" | "lyricist" | "arranger">): boolean {
  return [song.composer, song.lyricist, song.arranger].every((credit) => {
    const trimmed = (credit ?? "").trim();
    return trimmed === "-" || trimmed === "－";
  });
}

/** The song pool: every released song with a full track, medleys excepted, in id order (seeded games stay reproducible). */
export function buildSongPool(songs: readonly GuessSong[], now: number = Date.now()): GuessSong[] {
  return songs
    .filter((song) => {
      if (song.id <= 0 || !song.title || !song.audioUrl || isMedley(song)) return false;
      const released = parseMasterDate(song.startAt);
      return released !== null && released <= now;
    })
    .sort((a, b) => a.id - b.id);
}

/** Everything one game needs: the pool, lookups for display and the answer index. */
export interface SongLibrary {
  pool: GuessSong[];
  songById: Map<number, GuessSong>;
  entryById: Map<number, SongSearchEntry>;
  index: SongIndex;
}

export function buildSongLibrary(songs: readonly GuessSong[], now: number = Date.now()): SongLibrary {
  const pool = buildSongPool(songs, now);
  const entries: SongSearchEntry[] = pool.map((song) => ({
    id: song.id,
    title: song.title,
    subtitle: song.titleJa && song.titleJa !== song.title ? song.titleJa : undefined,
    groupTitle: song.titleJa || song.title,
    answers: song.answers,
  }));
  return {
    pool,
    songById: new Map(pool.map((song) => [song.id, song])),
    entryById: new Map(entries.map((entry) => [entry.id, entry])),
    index: buildSongIndex(entries),
  };
}
