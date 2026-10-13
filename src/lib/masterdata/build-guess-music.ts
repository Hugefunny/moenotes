import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, table, texts } from "@/lib/masterdata/build-core";
import { musicOn } from "@/lib/masterdata/build-data";
import { MASTER_TEXT_FIELDS, isUsableMasterText, type MasterTextField } from "@/lib/masterdata/localize-text";
import type { PinyinReading } from "@/lib/guess-music/answer";
import type { GuessSong } from "@/lib/guess-music/songs";
import type { RawMusic } from "@/lib/music/data";
import type { ServerFaceted } from "@/lib/servers/facets";
import { pinyin } from "pinyin-pro";

/*
 * The songs of the guess-the-song game: the few fields a round needs, plus every language's title, the kana reading
 * and the titles' pinyin so a typed answer may be in any of them. Computed per server and merged like the rest of the
 * catalog. pinyin-pro and its dictionary stay in the build: the page receives only the readings.
 */

const HAN = /\p{Script=Han}/u;
const KANA_OR_HANGUL = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * A title's pinyin without tones, or null unless the title is written in Han characters (Latin letters, digits and
 * symbols may sit between them): a Japanese title with kana has no pinyin. ü is spelled both v, as pinyin input
 * methods take it, and u.
 */
export function pinyinReading(title: string): PinyinReading | null {
  if (!HAN.test(title) || KANA_OR_HANGUL.test(title)) return null;
  const spelled = pinyin(title, { toneType: "none" }).replace(/\s+/g, "");
  return {
    title,
    full: [...new Set([spelled.replaceAll("ü", "v"), spelled.replaceAll("ü", "u")])],
    initials: pinyin(title, { pattern: "first", toneType: "none" }).replace(/\s+/g, ""),
  };
}

/** The titles read in pinyin, the page's own script first so a suggestion shows the title the reader writes. */
function pinyinFields(locale: AppLocale): readonly MasterTextField[] {
  return locale === "zh-TW" ? ["traditionalChinese", "simplifiedChinese", "japanese"] : ["simplifiedChinese", "traditionalChinese", "japanese"];
}

export function guessSongsOn(server: GameServer, locale: AppLocale): Promise<GuessSong[]> {
  return memo(`guess-songs:${server}:${locale}`, async () => {
    const [songs, rawMusic, textTable] = await Promise.all([musicOn(server, locale), table<RawMusic>("MasterLiveMusic.json", server), texts(server)]);
    const textById = new Map(textTable._allData.map((row) => [row.id, row]));
    const rawById = new Map(rawMusic._allData.map((row) => [row.id, row]));
    return songs.map((song): GuessSong => {
      const raw = rawById.get(song.id);
      const answers = new Set<string>();
      for (const id of [raw?.titleTextID, raw?.phoneticTextID]) {
        const text = id ? textById.get(id) : undefined;
        if (!text) continue;
        for (const field of MASTER_TEXT_FIELDS) {
          const value = text[field];
          if (isUsableMasterText(value, id)) answers.add(value.trim());
        }
      }
      const titleText = raw?.titleTextID ? textById.get(raw.titleTextID) : undefined;
      // Keyed by spelling: titles that differ only in script read the same, and the page's own script comes first.
      const readings = new Map<string, PinyinReading>();
      for (const field of pinyinFields(locale)) {
        const value = titleText?.[field];
        if (!isUsableMasterText(value, raw?.titleTextID)) continue;
        const reading = pinyinReading(value.trim());
        if (reading && !readings.has(reading.full[0]!)) readings.set(reading.full[0]!, reading);
      }
      return {
        id: song.id,
        title: song.title,
        titleJa: song.titleJa ?? song.title,
        answers: [...answers],
        pinyin: [...readings.values()],
        composer: song.composer,
        lyricist: song.lyricist,
        arranger: song.arranger,
        bandId: song.bandId,
        bandName: song.bandName,
        jacketUrl: song.jacketUrl,
        audioUrl: song.audioUrl,
        startAt: song.startAt,
      };
    });
  });
}

export function getBuildGuessSongs(locale: AppLocale): Promise<ServerFaceted<GuessSong>[]> {
  return mergedList(`guess-songs:${locale}`, (server) => guessSongsOn(server, locale), (song) => song.id);
}
