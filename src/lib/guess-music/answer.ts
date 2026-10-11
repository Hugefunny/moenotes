/**
 * Answer normalization, suggestion search and typed-answer matching.
 *
 * Every comparison runs on normalized keys: NFKC (full-width letters and digits, half-width kana), lower case,
 * katakana folded to hiragana, and whitespace, punctuation and symbols removed. Full-width "Mayoiuta", "mayoiuta" and
 * "MAYOIUTA" all become "mayoiuta", and a reading typed in katakana matches the same reading in hiragana.
 *
 * Chinese titles (and Japanese titles written in kanji only) also match their pinyin without tones: the full spelling
 * ("mixingjiao", "mi xing jiao") is an answer, and the initials ("mxj") lead the suggestions but never count as one.
 */

/** title: the title in the page language; other: another language's title or the kana reading; pinyin: a Han title's. */
export type MatchKind = "title" | "other" | "pinyin";

/** A Han title read in pinyin, made at build time (build-guess-music.ts). */
export interface PinyinReading {
  /** The title it reads. */
  title: string;
  /** The full pinyin without tones, once per spelling of ü (v and u): each is an answer. */
  full: readonly string[];
  /** The first letter of each syllable: suggestions only. */
  initials: string;
}

export interface SongSearchEntry {
  id: number;
  /** The title the page shows. */
  title: string;
  /** A second line under the title (the Japanese title when it differs). */
  subtitle?: string | undefined;
  /** The title re-releases share: songs with the same normalized group title are the same answer. */
  groupTitle: string;
  /** Every accepted answer: each language's title and the kana reading. */
  answers: readonly string[];
  /** Pinyin of the Han titles. */
  pinyin?: readonly PinyinReading[] | undefined;
}

export interface IndexedKey {
  key: string;
  kind: MatchKind;
  /** The original text the key came from, for display: the title itself for its pinyin. */
  text: string;
  /** Whether a typed answer may be this key; pinyin initials only lead the suggestions. */
  answer: boolean;
}

export interface IndexedSong {
  entry: SongSearchEntry;
  /** Normalized group title: two songs with the same title key count as the same answer. */
  titleKey: string;
  keys: IndexedKey[];
}

export interface SongIndex {
  songs: IndexedSong[];
  byId: Map<number, IndexedSong>;
}

export interface SongSuggestion {
  id: number;
  kind: MatchKind;
  /** Text that matched the query. */
  text: string;
}

const KIND_ORDER: Record<MatchKind, number> = { title: 0, other: 1, pinyin: 2 };
const STRIPPED = /[\p{P}\p{S}\p{Z}\p{Cc}\p{Cf}\s]/gu;

export function normalizeAnswer(input: string): string {
  const folded = (input ?? "").normalize("NFKC").toLowerCase();
  let out = "";
  for (const char of folded) {
    const code = char.codePointAt(0) ?? 0;
    // Katakana U+30A1..U+30F6 and the iteration marks U+30FD, U+30FE sit 0x60 above their hiragana.
    if ((code >= 0x30a1 && code <= 0x30f6) || code === 0x30fd || code === 0x30fe) {
      out += String.fromCodePoint(code - 0x60);
    } else {
      out += char;
    }
  }
  return out.replace(STRIPPED, "");
}

export function buildSongIndex(entries: readonly SongSearchEntry[]): SongIndex {
  const songs: IndexedSong[] = [];
  const byId = new Map<number, IndexedSong>();
  for (const entry of entries) {
    const keys: IndexedKey[] = [];
    const seen = new Set<string>();
    const add = (source: string | undefined, kind: MatchKind, answer = true, text = source) => {
      if (!source || !text) return;
      const key = normalizeAnswer(source);
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push({ key, kind, text, answer });
    };
    add(entry.title, "title");
    add(entry.groupTitle, "other");
    for (const answer of entry.answers) add(answer, "other");
    for (const reading of entry.pinyin ?? []) {
      for (const full of reading.full) add(full, "pinyin", true, reading.title);
      add(reading.initials, "pinyin", false, reading.title);
    }
    const song: IndexedSong = { entry, titleKey: normalizeAnswer(entry.groupTitle) || `#${entry.id}`, keys };
    songs.push(song);
    byId.set(entry.id, song);
  }
  return { songs, byId };
}

/**
 * Songs matching a query: exact matches, then prefix matches, then substring matches; within a rank the page
 * language's title beats the other titles and the reading, and the closer (shorter) key wins. Songs sharing a title
 * appear once.
 */
export function searchSongs(index: SongIndex, query: string, limit = 8): SongSuggestion[] {
  const q = normalizeAnswer(query);
  if (!q) return [];
  const hits: Array<{ song: IndexedSong; key: IndexedKey; rank: number }> = [];
  for (const song of index.songs) {
    let best: { key: IndexedKey; rank: number } | null = null;
    for (const key of song.keys) {
      const rank = key.key === q ? 0 : key.key.startsWith(q) ? 1 : key.key.includes(q) ? 2 : -1;
      if (rank < 0) continue;
      if (!best || compareHit(rank, key, best.rank, best.key) < 0) best = { key, rank };
    }
    if (best) hits.push({ song, ...best });
  }
  hits.sort((a, b) => compareHit(a.rank, a.key, b.rank, b.key) || a.song.entry.id - b.song.entry.id);
  const out: SongSuggestion[] = [];
  const titles = new Set<string>();
  for (const hit of hits) {
    if (titles.has(hit.song.titleKey)) continue;
    titles.add(hit.song.titleKey);
    out.push({ id: hit.song.entry.id, kind: hit.key.kind, text: hit.key.text });
    if (out.length >= limit) break;
  }
  return out;
}

function compareHit(rankA: number, keyA: IndexedKey, rankB: number, keyB: IndexedKey): number {
  return rankA - rankB || KIND_ORDER[keyA.kind] - KIND_ORDER[keyB.kind] || keyA.key.length - keyB.key.length;
}

/** Normalized answers the pure-typing mode accepts for a song: its titles, the reading and the full pinyin. */
export function acceptedAnswerKeys(entry: SongSearchEntry): Set<string> {
  const keys = new Set<string>();
  const pinyin = (entry.pinyin ?? []).flatMap((reading) => reading.full);
  for (const text of [entry.title, entry.groupTitle, ...entry.answers, ...pinyin]) {
    const key = text ? normalizeAnswer(text) : "";
    if (key) keys.add(key);
  }
  return keys;
}

export function matchesTypedAnswer(entry: SongSearchEntry, input: string): boolean {
  const key = normalizeAnswer(input);
  return key.length > 0 && acceptedAnswerKeys(entry).has(key);
}

/** A picked song is right when it is the answer or shares its title (re-releases). */
export function isSameSong(index: SongIndex, guessId: number, answerId: number): boolean {
  if (guessId === answerId) return true;
  const guess = index.byId.get(guessId);
  const answer = index.byId.get(answerId);
  return Boolean(guess && answer && guess.titleKey === answer.titleKey);
}

export type TypedSong = { kind: "song"; id: number } | { kind: "none" } | { kind: "ambiguous" };

/**
 * The song a typed answer names, for answers the server judges by song: songs sharing a title count as one. When
 * the text is an answer of several titles, the one it is the title of (in the page language or Japanese) wins;
 * failing that it is ambiguous.
 */
export function resolveTypedAnswer(index: SongIndex, input: string): TypedSong {
  const key = normalizeAnswer(input);
  if (!key) return { kind: "none" };
  const groups = new Map<string, { id: number; primary: boolean }>();
  for (const song of index.songs) {
    if (!song.keys.some((indexed) => indexed.answer && indexed.key === key)) continue;
    const primary = song.titleKey === key || normalizeAnswer(song.entry.title) === key;
    const group = groups.get(song.titleKey);
    if (!group) groups.set(song.titleKey, { id: song.entry.id, primary });
    else if (primary) group.primary = true;
  }
  const matches = [...groups.values()];
  const primaries = matches.filter((group) => group.primary);
  const only = matches.length === 1 ? matches[0] : primaries.length === 1 ? primaries[0] : undefined;
  if (only) return { kind: "song", id: only.id };
  return matches.length ? { kind: "ambiguous" } : { kind: "none" };
}
