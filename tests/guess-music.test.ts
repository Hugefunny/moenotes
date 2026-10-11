import { expect, test } from "bun:test";
import { isSameSong, matchesTypedAnswer, normalizeAnswer, resolveTypedAnswer, searchSongs } from "../src/lib/guess-music/answer";
import { createGameState, gameReducer, remainingMs, type Guess } from "../src/lib/guess-music/game";
import { buildSongLibrary, buildSongPool, isMedley } from "../src/lib/guess-music/pool";
import { createRandom } from "../src/lib/guess-music/random";
import { foldKana, romajiToKana } from "../src/lib/guess-music/romaji";
import { buildRounds, formatClock, requiredPoolSize, resolveClipStart } from "../src/lib/guess-music/rounds";
import { comboMultiplier, difficultyMultiplier, nextCombo, scoreRound, timeAfterWrongGuess } from "../src/lib/guess-music/scoring";
import {
  DEFAULT_ROUNDS,
  ROUND_COUNTS,
  applyPreset,
  defaultSettings,
  detectPreset,
  hasSettingsParams,
  parseServerParam,
  parseSettingsParams,
  settingsToParams,
} from "../src/lib/guess-music/settings";
import type { GuessSong } from "../src/lib/guess-music/songs";
import { pinyinReading } from "../src/lib/masterdata/build-guess-music";

const NOW = Date.parse("2026-10-09T00:00:00+08:00");
const RELEASED = "2026/01/01 0:00:00";

function song(id: number, patch: Partial<GuessSong> = {}): GuessSong {
  return {
    id, title: `Song ${id}`, titleJa: `ソング${id}`, answers: [`Song ${id}`, `ソング${id}`, `そんぐ${id}`], pinyin: [],
    composer: "A", lyricist: "B", arranger: "C", bandId: 1, bandName: "Band", jacketUrl: `j${id}.webp`,
    audioUrl: `https://assets.example/${id}.m4a`, startAt: RELEASED, ...patch,
  };
}
const songs = (count: number) => Array.from({ length: count }, (_, index) => song(index + 1));

test("normalization folds width, case, katakana and punctuation", () => {
  expect(normalizeAnswer("Ｍａｙｏｉｕｔａ")).toBe("mayoiuta");
  expect(normalizeAnswer("マヨイ・ウタ!")).toBe(normalizeAnswer("まよいうた"));
  expect(normalizeAnswer("  迷星叫  ")).toBe("迷星叫");
});

test("typed answers accept every language's title and the reading; suggestions rank the page title first", () => {
  const library = buildSongLibrary([
    song(1, { title: "迷星叫", titleJa: "迷星叫", answers: ["迷星叫", "Mayoiuta", "まよいうた"] }),
    song(2, { title: "碧天伴走", titleJa: "碧天伴走", answers: ["碧天伴走", "Hekiten Bansou", "へきてんばんそう"] }),
  ], NOW);
  const entry = library.entryById.get(1)!;
  for (const typed of ["迷星叫", "mayoiuta", "マヨイウタ", "まよいうた"]) expect(matchesTypedAnswer(entry, typed)).toBe(true);
  expect(matchesTypedAnswer(entry, "迷星")).toBe(false);
  expect(searchSongs(library.index, "まよい").map((hit) => hit.id)).toEqual([1]);
  expect(searchSongs(library.index, "迷星叫")[0]).toEqual({ id: 1, kind: "title", text: "迷星叫" });
  expect(searchSongs(library.index, "heki")[0]).toEqual({ id: 2, kind: "other", text: "Hekiten Bansou" });
});

test("pinyin readings come from Han titles only, with ü spelled both v and u", () => {
  expect(pinyinReading("迷星叫")).toEqual({ title: "迷星叫", full: ["mixingjiao"], initials: "mxj" });
  expect(pinyinReading("詩超絆")?.full).toEqual(["shichaoban"]);
  expect(pinyinReading("绿")).toEqual({ title: "绿", full: ["lv", "lu"], initials: "l" });
  expect(normalizeAnswer(pinyinReading("春日影(MyGO!!!!! ver.)")!.full[0]!)).toBe("chunriyingmygover");
  for (const title of ["Ave Mujica", "春の歌", "미싱"]) expect(pinyinReading(title)).toBeNull();
});

test("full pinyin is an answer; initials only lead the suggestions, after the titles", () => {
  const library = buildSongLibrary([
    song(1, { title: "Mayoiuta", titleJa: "迷星叫", answers: ["迷星叫", "Mayoiuta", "まよいうた"], pinyin: [pinyinReading("迷星叫")!] }),
    song(2, { title: "Green", titleJa: "緑", answers: ["绿", "Green"], pinyin: [pinyinReading("绿")!] }),
    song(3, { title: "mxj", titleJa: "mxj", answers: ["mxj"] }),
  ], NOW);
  const entry = library.entryById.get(1)!;
  for (const typed of ["mixingjiao", "mi xing jiao", "MiXingJiao"]) expect(matchesTypedAnswer(entry, typed)).toBe(true);
  expect(matchesTypedAnswer(entry, "mxj")).toBe(false);
  for (const typed of ["lv", "lu"]) expect(matchesTypedAnswer(library.entryById.get(2)!, typed)).toBe(true);
  expect(resolveTypedAnswer(library.index, "mixingjiao")).toEqual({ kind: "song", id: 1 });
  // Initials never name a song: "mxj" is the third song's title, not the first one's answer.
  expect(resolveTypedAnswer(library.index, "mxj")).toEqual({ kind: "song", id: 3 });
  // A pinyin suggestion shows the title it reads.
  expect(searchSongs(library.index, "mixing")[0]).toEqual({ id: 1, kind: "pinyin", text: "迷星叫" });
  expect(searchSongs(library.index, "mxj").map((hit) => hit.id)).toEqual([3, 1]);
});

test("romaji reads like an input method: every spelling system, っ, ん and syllable breaks", () => {
  for (const [typed, kana] of [
    ["mayoiuta", "まよいうた"], ["si shi", "しし"], ["tu tsu", "つつ"], ["ti chi", "ちち"], ["hu fu", "ふふ"], ["zi ji", "じじ"],
    ["kitte", "きって"], ["matcha", "まっちゃ"], ["konna", "こんな"], ["shin'ya", "しんや"], ["shimbun", "しんぶん"],
    ["orion o", "おりおんお"], ["Hekiten Bansō", "へきてんばんそ"], ["ave mujica", "あゔぇむじか"],
  ] as const) expect(romajiToKana(typed)?.kana).toBe(kana);
  // A trailing consonant has no kana yet, and a final n may still become な.
  expect(romajiToKana("hekitenb")).toEqual({ kana: null, prefix: "へきてん" });
  expect(romajiToKana("kan")).toEqual({ kana: "かん", prefix: "か" });
  for (const typed of ["mixingjiao", "迷星叫", "seishun complex"]) expect(romajiToKana(typed)).toBeNull();
  expect(foldKana("かーねーしょん")).toBe("かねしょん");
  expect(foldKana("へきてんばんそう")).toBe(foldKana("へきてんばんそ"));
  expect(foldKana("おりおんをなぞる")).toBe(foldKana("おりおんおなぞる"));
  expect(foldKana("ねぇ")).toBe("ね");
});

test("romaji names a song by its reading, forgiving long vowels and を", () => {
  const library = buildSongLibrary([
    song(1, { title: "迷星叫", titleJa: "迷星叫", answers: ["迷星叫", "まよいうた"] }),
    song(2, { title: "碧天伴走", titleJa: "碧天伴走", answers: ["碧天伴走", "へきてんばんそう"] }),
    song(3, { title: "オリオンをなぞる", titleJa: "オリオンをなぞる", answers: ["オリオンをなぞる", "おりおんをなぞる"] }),
    song(4, { title: "カーネーションの咲く日に", titleJa: "カーネーションの咲く日に", answers: ["カーネーションの咲く日に", "かーねーしょんのさくひに"] }),
  ], NOW);
  const entry = (id: number) => library.entryById.get(id)!;
  // No English title here: the reading alone answers.
  expect(matchesTypedAnswer(entry(1), "mayoiuta")).toBe(true);
  expect(matchesTypedAnswer(entry(1), "mayoiu")).toBe(false);
  for (const typed of ["hekiten bansou", "Hekiten Banso", "hekitenbansō"]) expect(matchesTypedAnswer(entry(2), typed)).toBe(true);
  for (const typed of ["orion wo nazoru", "orion o nazoru"]) expect(matchesTypedAnswer(entry(3), typed)).toBe(true);
  for (const typed of ["kaneshon no saku hi ni", "ka-ne-shon no sakuhini", "kaaneeshon no sakuhini"]) expect(matchesTypedAnswer(entry(4), typed)).toBe(true);
  expect(resolveTypedAnswer(library.index, "hekiten banso")).toEqual({ kind: "song", id: 2 });
  expect(searchSongs(library.index, "hekitenb")[0]).toEqual({ id: 2, kind: "other", text: "へきてんばんそう" });
  expect(searchSongs(library.index, "mayo")[0]).toEqual({ id: 1, kind: "other", text: "まよいうた" });
});

test("re-releases sharing a Japanese title are the same answer and appear once in suggestions", () => {
  const library = buildSongLibrary([song(1, { titleJa: "同じ曲" }), song(2, { title: "Same song (re-release)", titleJa: "同じ曲" }), song(3)], NOW);
  expect(isSameSong(library.index, 2, 1)).toBe(true);
  expect(isSameSong(library.index, 3, 1)).toBe(false);
  expect(searchSongs(library.index, "同じ曲").length).toBe(1);
});

test("scoring stacks clip, answer mode, time and combo", () => {
  const base = { timeLeft: 45, timeLimit: 45, clipSeconds: 30 as const, answerMode: "choice" as const, combo: 1 };
  expect(scoreRound(base)).toBe(1000);
  expect(scoreRound({ ...base, clipSeconds: 15, answerMode: "suggest" })).toBe(1690);
  expect(scoreRound({ ...base, clipSeconds: 5, answerMode: "type" })).toBe(3060);
  expect(scoreRound({ ...base, timeLeft: 22.5 })).toBe(500);
  expect(scoreRound({ ...base, timeLeft: 0 })).toBe(100);
  expect(scoreRound({ ...base, combo: 3 })).toBe(2000);
  expect(comboMultiplier(0)).toBe(1);
  expect(comboMultiplier(2)).toBe(1.5);
  expect(nextCombo(2, 0, true)).toBe(3);
  expect(nextCombo(2, 1, true)).toBe(0);
  expect(nextCombo(2, 0, false)).toBe(0);
  expect(timeAfterWrongGuess(30)).toBe(15);
});

test("the round timer starts with the clip; wrong guesses halve the time and three end the round", () => {
  const specs = buildRounds(buildSongPool(songs(12), NOW), { seed: "abc", rounds: 2, optionsCount: 0 });
  const config = { clipSeconds: 15 as const, answerMode: "suggest" as const, vocalRemoval: false, timeLimit: 45, seed: "abc" };
  let state = gameReducer(createGameState(), { type: "start", rounds: specs, config });
  const answerId = specs[0]!.musicId;
  const wrong = (key: string): Guess => ({ key, label: key, musicId: null });

  // Before the clip plays nothing counts and the clock stands still.
  expect(gameReducer(state, { type: "guess", now: 0, correct: true, guess: wrong("x") })).toBe(state);
  expect(gameReducer(state, { type: "tick", now: 1e9 })).toBe(state);

  state = gameReducer(state, { type: "clipStarted", now: 1000, clipStart: 42 });
  expect(state.round?.status).toBe("guessing");
  expect(remainingMs(state.round!, 1000)).toBe(45000);

  state = gameReducer(state, { type: "guess", now: 11000, correct: false, guess: wrong("a") });
  expect(state.round?.strikes).toBe(1);
  expect(remainingMs(state.round!, 11000)).toBe(17500);
  // The same wrong answer again costs nothing.
  expect(gameReducer(state, { type: "guess", now: 12000, correct: false, guess: wrong("a") })).toBe(state);

  const won = gameReducer(state, { type: "guess", now: 18500, correct: true, guess: { key: `id:${answerId}`, label: "right", musicId: answerId } });
  const result = won.results[0]!;
  expect(result.outcome).toBe("correct");
  expect(result.clipStart).toBe(42);
  expect(result.combo).toBe(0);
  expect(result.score).toBe(scoreRound({ timeLeft: 10, timeLimit: 45, clipSeconds: 15, answerMode: "suggest", combo: 0 }));

  let lost = gameReducer(state, { type: "guess", now: 12000, correct: false, guess: wrong("b") });
  lost = gameReducer(lost, { type: "guess", now: 13000, correct: false, guess: wrong("c") });
  expect(lost.results[0]?.outcome).toBe("wrong");
  expect(lost.results[0]?.score).toBe(0);
  expect(gameReducer(state, { type: "tick", now: 1e9 }).results[0]?.outcome).toBe("timeout");

  const next = gameReducer(won, { type: "next" });
  expect(next.round?.index).toBe(1);
  expect(next.round?.status).toBe("waiting");
  expect(gameReducer(gameReducer(next, { type: "giveUp", now: 0 }), { type: "next" }).phase).toBe("finished");
});

test("a song whose audio fails before it plays is skipped without touching the streak", () => {
  const specs = buildRounds(buildSongPool(songs(12), NOW), { seed: "fallback", rounds: 1, optionsCount: 0 });
  let state = gameReducer(createGameState(), { type: "start", rounds: specs, config: { clipSeconds: 5, answerMode: "type", vocalRemoval: false, timeLimit: 30, seed: "fallback" } });
  state = gameReducer(state, { type: "audioFailed", now: 0 });
  expect(state.results[0]?.outcome).toBe("unavailable");
  expect(state.combo).toBe(0);
});

test("seeded rounds are deterministic, independent of the answer mode and of the data order", () => {
  const pool = buildSongPool([...songs(40)].reverse(), NOW);
  const first = buildRounds(pool, { seed: "share-me", rounds: 10, optionsCount: 6 });
  expect(buildRounds(buildSongPool(songs(40), NOW), { seed: "share-me", rounds: 10, optionsCount: 6 })).toEqual(first);
  const typed = buildRounds(pool, { seed: "share-me", rounds: 10, optionsCount: 0 });
  expect(typed.map((round) => [round.musicId, round.startFraction])).toEqual(first.map((round) => [round.musicId, round.startFraction]));
  expect(buildRounds(pool, { seed: "another", rounds: 10, optionsCount: 6 }).map((round) => round.musicId)).not.toEqual(first.map((round) => round.musicId));
  expect(new Set(first.map((round) => round.musicId)).size).toBe(10);
  for (const round of first) {
    expect(new Set(round.optionIds).size).toBe(6);
    expect(round.optionIds).toContain(round.musicId);
    expect(round.startFraction >= 0 && round.startFraction < 1).toBe(true);
  }
  const a = createRandom("x");
  const b = createRandom("x");
  expect([a.next(), a.int(10), a.next()]).toEqual([b.next(), b.int(10), b.next()]);
  expect(buildRounds(pool.slice(0, 5), { seed: "x", rounds: 10, optionsCount: 0 }).length).toBe(0);
});

test("a longer game with the same seed starts with the shorter game's questions", () => {
  const pool = buildSongPool(songs(40), NOW);
  const ten = buildRounds(pool, { seed: "prefix", rounds: 10, optionsCount: 4 });
  const twenty = buildRounds(pool, { seed: "prefix", rounds: 20, optionsCount: 4 });
  expect(twenty.slice(0, 10)).toEqual(ten);
  expect(requiredPoolSize(30, 10)).toBe(30);
});

test("distractors never repeat the answer's title", () => {
  const pool = buildSongPool([...songs(8), song(99, { titleJa: "ソング1" })], NOW);
  for (let seed = 0; seed < 30; seed++) {
    for (const round of buildRounds(pool, { seed: String(seed), rounds: 9, optionsCount: 8 })) {
      if (round.musicId !== 1 && round.musicId !== 99) continue;
      expect(round.optionIds).not.toContain(round.musicId === 1 ? 99 : 1);
    }
  }
});

test("the pool keeps released songs with a full track, medleys excepted", () => {
  const pool = buildSongPool([
    song(1),
    song(2, { startAt: "2026/10/17 15:00:00" }),
    song(3, { audioUrl: undefined }),
    song(4, { composer: "-", lyricist: "-", arranger: "－" }),
    song(5, { startAt: "2026/10/08 23:00:00+09:00" }),
  ], NOW);
  expect(pool.map((entry) => entry.id)).toEqual([1, 5]);
  expect(isMedley({ composer: "A", lyricist: "-", arranger: "-" })).toBe(false);
});

test("clip starts stay past the lead-in and clear of the ending", () => {
  expect(resolveClipStart(0, 1, 120, 15)).toBe(1);
  expect(resolveClipStart(1, 1, 120, 15)).toBe(102);
  expect(resolveClipStart(0.5, 1, 120, 15)).toBe(51.5);
  // Too short for the padding: the latest start that still fits the clip.
  expect(resolveClipStart(0.7, 9, 20, 15)).toBe(5);
  expect(formatClock(83.4)).toBe("01:23");
});

test("share links restore the settings and the server; presets are detected", () => {
  const base = defaultSettings("seed1");
  expect(detectPreset(base)).toBe("normal");
  expect(base.rounds).toBe(DEFAULT_ROUNDS);
  expect(ROUND_COUNTS).toEqual([10, 20, 30]);
  const hard = applyPreset(base, "hard");
  expect(detectPreset(hard)).toBe("hard");
  expect(detectPreset({ ...hard, rounds: 10 })).toBe("hard");
  const custom = { ...hard, clipSeconds: 2 as const, timeLimit: 60, answerMode: "choice" as const, optionsCount: 8, rounds: 30 };
  const params = settingsToParams(custom, "jp");
  expect(parseSettingsParams(params, defaultSettings("other"))).toEqual(custom);
  expect(detectPreset(custom)).toBe("custom");
  expect(parseServerParam(params, ["tw", "jp"])).toBe("jp");
  expect(parseServerParam(params, ["tw"])).toBeNull();
  expect(hasSettingsParams(new URLSearchParams("rounds=10"))).toBe(true);
  expect(hasSettingsParams(new URLSearchParams("tab=free"))).toBe(false);
  const clamped = parseSettingsParams(new URLSearchParams("time=999&clip=7&mode=nope&rounds=15"), base);
  expect(clamped.rounds).toBe(base.rounds);
  expect(clamped.timeLimit).toBe(120);
  expect(clamped.clipSeconds).toBe(base.clipSeconds);
  expect(clamped.answerMode).toBe(base.answerMode);
});

test("vocal removal is a dimension: the hell preset, its share parameter and its multiplier", () => {
  const base = defaultSettings("seed1");
  expect(base.vocalRemoval).toBe(false);
  const hell = applyPreset(base, "hell");
  expect(hell).toMatchObject({ clipSeconds: 5, answerMode: "type", vocalRemoval: true });
  expect(detectPreset(hell)).toBe("hell");
  expect(detectPreset({ ...hell, vocalRemoval: false })).toBe("hard");
  expect(detectPreset(applyPreset(hell, "hard"))).toBe("hard");
  expect(detectPreset({ ...base, vocalRemoval: true })).toBe("custom");

  const params = settingsToParams(hell, "tw");
  expect(params.get("vr")).toBe("1");
  expect(parseSettingsParams(params, base)).toEqual(hell);
  // Off is the default, so it stays out of the link; vr=0 still turns it off.
  expect(settingsToParams(base, "tw").has("vr")).toBe(false);
  expect(parseSettingsParams(new URLSearchParams("vr=0"), hell).vocalRemoval).toBe(false);
  expect(parseSettingsParams(new URLSearchParams("vr=yes"), hell).vocalRemoval).toBe(true);
  expect(hasSettingsParams(new URLSearchParams("vr=1"))).toBe(true);

  expect(difficultyMultiplier({ clipSeconds: 5, answerMode: "type", vocalRemoval: true })).toBeCloseTo(1.7 * 1.8 * 1.5, 10);
  const timeLeft = 45;
  const plain = scoreRound({ clipSeconds: 30, answerMode: "choice", timeLeft, timeLimit: 45, combo: 1 });
  expect(scoreRound({ clipSeconds: 30, answerMode: "choice", vocalRemoval: true, timeLeft, timeLimit: 45, combo: 1 })).toBe(plain * 1.5);
});
