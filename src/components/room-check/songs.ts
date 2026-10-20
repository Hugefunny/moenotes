import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { GEKISOU_MISSION_KEYS, isGekisouMission } from "@/lib/music/metrics";

/** What the page shows of a song: its title, jacket and band. */
export interface RoomSong {
  id: number;
  title: string;
  jacketUrl: string;
  bandName: string;
}

/** The game's live difficulty: 0 Easy, 1 Normal, 2 Hard, 3 Expert, 4 Master. */
export function difficultyLabel(locale: AppLocale, difficulty: number): string {
  return difficulty >= 0 && difficulty <= 4 ? t(locale, `roomCheck.difficulty.${difficulty}`) : String(difficulty);
}

/** A Gekisou mission's name, or its number when the site does not know it. */
export function missionLabel(locale: AppLocale, mission: number): string {
  return isGekisouMission(mission) ? t(locale, `music.gekisou.missions.${GEKISOU_MISSION_KEYS[mission]}`) : String(mission);
}
