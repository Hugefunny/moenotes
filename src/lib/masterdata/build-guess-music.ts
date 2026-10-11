import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, table, texts } from "@/lib/masterdata/build-core";
import { musicOn } from "@/lib/masterdata/build-data";
import { MASTER_TEXT_FIELDS, isUsableMasterText } from "@/lib/masterdata/localize-text";
import type { GuessSong } from "@/lib/guess-music/songs";
import type { RawMusic } from "@/lib/music/data";
import type { ServerFaceted } from "@/lib/servers/facets";

/*
 * The songs of the guess-the-song game: the few fields a round needs, plus every language's title and the kana
 * reading so a typed answer may be in any of them. Computed per server and merged like the rest of the catalog.
 */

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
      return {
        id: song.id,
        title: song.title,
        titleJa: song.titleJa ?? song.title,
        answers: [...answers],
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
