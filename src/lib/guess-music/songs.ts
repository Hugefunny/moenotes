/** A song of the guess-the-song game, as the build hands it to the page (build-guess-music.ts). */
export interface GuessSong {
  id: number;
  /** The title in the page language. */
  title: string;
  /** The Japanese title: re-releases share it, so it decides whether two songs are the same answer. */
  titleJa: string;
  /** Every language's title and the kana reading: what a typed answer may be. */
  answers: string[];
  composer: string;
  lyricist: string;
  arranger: string;
  bandId: number;
  bandName: string;
  jacketUrl: string;
  /** The full track; songs whose export lacks it never become questions. */
  audioUrl?: string | undefined;
  startAt: string;
}
