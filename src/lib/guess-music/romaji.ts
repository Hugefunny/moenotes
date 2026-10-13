/**
 * Romaji typed as an answer, read like a kana input method reads it, and the folded kana it is compared in.
 *
 * Hepburn, Kunrei and input-method spellings all convert: shi and si, tsu and tu, chi and ti, fu and hu, ji and zi;
 * a doubled consonant is っ; n, nn and n' are ん, and so is m before b, p or m. Folding on both sides then forgives
 * what romaji leaves out: long vowels (ー, a repeated vowel, ou after an o sound, so bansou, banso and bansō agree),
 * small vowels, を as o, and ぢ, づ as ji, zu.
 */

const VOWELS = "aiueo";
const TABLE = new Map<string, string>();
const put = (romaji: string, kana: string) => TABLE.set(romaji, kana);

const ROWS: ReadonlyArray<readonly [string, string]> = [
  ["", "あいうえお"], ["k", "かきくけこ"], ["g", "がぎぐげご"], ["s", "さしすせそ"], ["z", "ざじずぜぞ"], ["t", "たちつてと"],
  ["d", "だぢづでど"], ["n", "なにぬねの"], ["h", "はひふへほ"], ["b", "ばびぶべぼ"], ["p", "ぱぴぷぺぽ"], ["m", "まみむめも"],
  ["r", "らりるれろ"],
];
for (const [consonant, kana] of ROWS) [...VOWELS].forEach((vowel, index) => put(consonant + vowel, kana[index]!));
// The y and w rows, Hepburn's spellings, c as k or s, and the sounds of loanwords.
for (const [romaji, kana] of Object.entries({
  ya: "や", yu: "ゆ", yo: "よ", ye: "いぇ", wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
  shi: "し", chi: "ち", tsu: "つ", fu: "ふ", ji: "じ", ca: "か", ci: "し", cu: "く", ce: "せ", co: "こ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ", fyu: "ふゅ", va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
  tsa: "つぁ", tsi: "つぃ", tse: "つぇ", tso: "つぉ", thi: "てぃ", dhi: "でぃ", twu: "とぅ", dwu: "どぅ",
})) put(romaji, kana);
// Contracted sounds: きゃ as kya; しゃ as sha or sya; じゃ as ja, zya or jya; ちゃ as cha, tya or cya.
const CONTRACTED: ReadonlyArray<readonly [readonly string[], string]> = [
  [["ky"], "き"], [["gy"], "ぎ"], [["sh", "sy"], "し"], [["j", "zy", "jy"], "じ"], [["ch", "ty", "cy"], "ち"], [["dy"], "ぢ"],
  [["ny"], "に"], [["hy"], "ひ"], [["by"], "び"], [["py"], "ぴ"], [["my"], "み"], [["ry"], "り"],
];
for (const [spellings, kana] of CONTRACTED) {
  for (const spelling of spellings) {
    put(`${spelling}a`, `${kana}ゃ`);
    put(`${spelling}u`, `${kana}ゅ`);
    put(`${spelling}o`, `${kana}ょ`);
    put(`${spelling}e`, `${kana}ぇ`);
  }
}
// Small kana as an input method writes them: xa or la, xtu or ltu.
for (const prefix of ["x", "l"]) {
  [..."ぁぃぅぇぉ"].forEach((kana, index) => put(prefix + VOWELS[index], kana));
  put(`${prefix}ya`, "ゃ");
  put(`${prefix}yu`, "ゅ");
  put(`${prefix}yo`, "ょ");
  put(`${prefix}tu`, "っ");
  put(`${prefix}tsu`, "っ");
  put(`${prefix}wa`, "ゎ");
}
const LONGEST = Math.max(...[...TABLE.keys()].map((key) => key.length));

export interface RomajiKana {
  /** The whole input as kana, or null while it ends in a consonant that has no kana yet. */
  kana: string | null;
  /** The kana a suggestion may continue: the input without a trailing consonant or final n. */
  prefix: string;
}

/**
 * Letters and apostrophes only: macrons and accents dropped. Spaces and punctuation separate syllables like an
 * apostrophe, so "orion o" reads おりおん お, not おりおの.
 */
function romajiLetters(input: string): string | null {
  const letters = (input ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "'");
  return /^[a-z']+$/.test(letters) ? letters : null;
}

/** Read typed romaji as hiragana; null when the input is not romaji. */
export function romajiToKana(input: string): RomajiKana | null {
  const text = romajiLetters(input);
  if (!text) return null;
  let out = "";
  let finalN = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    const next = text[i + 1];
    if (char === "'") {
      i += 1;
      continue;
    }
    if (char === "n" && next !== undefined && !VOWELS.includes(next) && next !== "y") {
      // n' and n before a consonant are ん; so is nn, unless the second n starts the next syllable (onna).
      const after = text[i + 2];
      const syllable = next === "n" && after !== undefined && (VOWELS.includes(after) || after === "y");
      out += "ん";
      i += next === "'" || (next === "n" && !syllable) ? 2 : 1;
      continue;
    }
    if (char === "n" && next === undefined) {
      out += "ん";
      finalN = true;
      i += 1;
      continue;
    }
    if (char === "m" && next !== undefined && "bpm".includes(next)) {
      out += "ん";
      i += 1;
      continue;
    }
    if ((char === next && !VOWELS.includes(char)) || (char === "t" && next === "c" && text[i + 2] === "h")) {
      out += "っ";
      i += 1;
      continue;
    }
    let matched = false;
    for (let length = Math.min(LONGEST, text.length - i); length > 0; length -= 1) {
      const kana = TABLE.get(text.slice(i, i + length));
      if (!kana) continue;
      out += kana;
      i += length;
      matched = true;
      break;
    }
    if (matched) continue;
    // A consonant still waiting for its vowel ends the input; anywhere else the text is not romaji.
    const rest = text.slice(i);
    if (rest.length < LONGEST && [...TABLE.keys()].some((key) => key.startsWith(rest))) return { kana: null, prefix: out };
    return null;
  }
  return { kana: out, prefix: finalN ? out.slice(0, -1) : out };
}

const FOLDED: Readonly<Record<string, string>> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", ゎ: "わ", ゕ: "か", ゖ: "け", を: "お", ぢ: "じ", づ: "ず",
};
const VOWEL_OF = new Map<string, string>();
for (const [vowel, kana] of [
  ["a", "あかさたなはまやらわがざだばぱゃ"], ["i", "いきしちにひみりぎじびぴ"], ["u", "うくすつぬふむゆるぐずぶぷゅゔ"],
  ["e", "えけせてねへめれげぜでべぺ"], ["o", "おこそとのほもよろごぞどぼぽょ"],
] as const) for (const char of kana) VOWEL_OF.set(char, vowel);
const PLAIN_VOWEL: Readonly<Record<string, string>> = { あ: "a", い: "i", う: "u", え: "e", お: "o" };

/**
 * Hiragana in the form romaji is compared in: no long vowel mark, small vowels full size, を as お, ぢ and づ as じ and
 * ず, and a vowel that only lengthens the one before it (かあ, そう) dropped.
 */
export function foldKana(kana: string): string {
  let out = "";
  let vowel = "";
  for (const raw of kana) {
    if (raw === "ー") continue;
    const char = FOLDED[raw] ?? raw;
    const own = PLAIN_VOWEL[char];
    if (own && (own === vowel || (own === "u" && vowel === "o"))) continue;
    out += char;
    vowel = VOWEL_OF.get(char) ?? "";
  }
  return out;
}
