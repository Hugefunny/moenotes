import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { LEADER_SLOT, averageLevel } from "@/lib/room-check/summary";
import type { RoomPlayer } from "@/lib/room-check/types";
import { MemberFace, type AssetUrl } from "./CardFace";
import type { RoomSong } from "./songs";
import { difficultyLabel } from "./songs";

interface Props {
  locale: AppLocale;
  player: RoomPlayer;
  cards: DeckCardLookup;
  songs: ReadonlyMap<number, RoomSong>;
  assetUrl: AssetUrl;
  /** The player's character rank total as a share of the room's highest. */
  share: number;
  selected: boolean;
  onSelect: () => void;
  /** Id of the team sheet this seat shows. */
  controls: string;
  /** The player's team or song changed in the last update. */
  changed: boolean;
}

/** One player's seat: their leader card, name, state, picked song and team figures. Choosing it shows their team. */
export default function PlayerSeat({ locale, player, cards, songs, assetUrl, share, selected, onSelect, controls, changed }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.player.${key}`, values);
  const formation = player.formation;
  const leader = formation?.units[LEADER_SLOT];
  const song = player.selection.musicId !== null ? songs.get(player.selection.musicId) : undefined;
  const status = player.state >= 20 ? "playing" : player.ready || player.state >= 10 ? "ready" : "waiting";
  return (
    <li className="rc-seat" data-color={player.color === null ? undefined : player.color % 5} data-changed={changed || undefined} data-selected={selected || undefined}>
      <button type="button" className="rc-seat-button md3-state" aria-pressed={selected} aria-controls={formation ? controls : undefined} onClick={onSelect} disabled={!formation}>
        <span className="rc-seat-art">
          {leader
            ? <MemberFace locale={locale} id={leader.cardId} cards={cards} assetUrl={assetUrl} level={leader.level} rank={leader.rank} />
            : <span className="rc-face rc-face-empty" data-kind="member">{tr("unknownTeam")}</span>}
        </span>
        <span className="rc-seat-info">
          <span className="rc-seat-top">
            <span className="rc-player-order" aria-label={tr("joinOrder", { n: player.joinOrder })}>
              {player.host ? <CrownIcon label={tr("host")} /> : player.joinOrder}
            </span>
            <span className="rc-player-name">{player.name || tr("unnamed")}</span>
          </span>
          <span className="rc-player-meta">
            <span className="rc-chip" data-status={status}>{tr(`status.${status}`)}</span>
            {player.selection.difficulty !== null && <span className="rc-difficulty" data-difficulty={player.selection.difficulty}>{difficultyLabel(locale, player.selection.difficulty)}</span>}
          </span>
          {song && <span className="rc-pick" title={tr("picked", { title: song.title })}>
            <img src={song.jacketUrl} alt="" aria-hidden="true" loading="lazy" />
            <span className="rc-pick-title">{song.title}</span>
          </span>}
          {formation && <span className="rc-player-numbers">
            <span className="rc-number"><small>{tr("characterRank")}</small><strong>{formation.totalCharacterRank}</strong></span>
            <span className="rc-number"><small>{tr("averageLevel")}</small><strong>{averageLevel(formation).toFixed(0)}</strong></span>
            <span className="rc-share" role="img" aria-label={tr("shareLabel", { n: Math.round(share * 100) })}><span style={{ inlineSize: `${Math.round(share * 100)}%` }} /></span>
          </span>}
        </span>
      </button>
    </li>
  );
}

function CrownIcon({ label }: { label: string }) {
  return <svg className="rc-crown" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" role="img" aria-label={label}>
    <path d="M4 8.5 8.5 12 12 5.5l3.5 6.5L20 8.5l-1.6 9H5.6z" /><path d="M6 20.5h12" strokeLinecap="round" />
  </svg>;
}

/** A seat nobody has taken. */
export function EmptySeat({ locale }: { locale: AppLocale }) {
  return <li className="rc-seat rc-seat-empty"><span>{t(locale, "roomCheck.player.emptySeat")}</span></li>;
}
