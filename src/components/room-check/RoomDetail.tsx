import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { key, rankShare, shownRead, songVotes } from "@/lib/room-check/summary";
import type { RoomEntry, RoomFormation, RoomPlayer, RoomSnapshot } from "@/lib/room-check/types";
import type { AssetUrl } from "./CardFace";
import FreshnessBar, { type LiveState } from "./FreshnessBar";
import PlayerSeat, { EmptySeat } from "./PlayerSeat";
import { Seats } from "./RoomList";
import RoomStateCard from "./RoomStateCard";
import { missionLabel, type RoomSong } from "./songs";
import TeamSheet from "./TeamSheet";

interface Props {
  locale: AppLocale;
  entry: RoomEntry;
  songs: ReadonlyMap<number, RoomSong>;
  cards: DeckCardLookup;
  assetUrl: AssetUrl;
  now: number;
  live: LiveState;
  /** Players whose team or song changed in the last update. */
  changed: ReadonlySet<string>;
  /** A notice above the room: the four-player offer of a room this page opened. */
  banner?: ReactNode;
  onRefresh: () => void;
  onLive: (on: boolean) => void;
}

/** The selected room: its song, how fresh the read is, what everyone picked, and each player's team. */
export default function RoomDetail({ locale, entry, songs, cards, assetUrl, now, live, changed, banner, onRefresh, onLive }: Props) {
  const read = shownRead(entry);
  const error = entry.status === "error" ? entry.error : null;
  const retryAt = error?.retryAfterMs != null && entry.errorAt !== null ? entry.errorAt + error.retryAfterMs : null;
  const busy = entry.status === "loading" || entry.status === "queued";

  if (!read) {
    if (error) return <RoomStateCard locale={locale} kind={error.code} code={entry.code} retryAt={retryAt} now={now} onRetry={onRefresh} />;
    return <RoomStateCard locale={locale} kind="loading" code={entry.code} now={now} />;
  }
  const snapshot = read.snapshot;
  return (
    <div className="rc-detail" aria-busy={busy}>
      {banner}
      <RoomHeader locale={locale} snapshot={snapshot} songs={songs} created={entry.created}>
        <FreshnessBar locale={locale} snapshot={snapshot} receivedAt={read.receivedAt} now={now} loading={busy} live={live} onRefresh={onRefresh} onLive={onLive} />
      </RoomHeader>
      {error && error.code !== "cooldown" && <RoomStateCard locale={locale} kind={error.code} code={entry.code} compact now={now} retryAt={retryAt} onRetry={onRefresh} />}
      <Players key={`${snapshot.region}:${snapshot.code}`} locale={locale} snapshot={snapshot} songs={songs} cards={cards} assetUrl={assetUrl} changed={changed} />
    </div>
  );
}

/** The room's song and missions, its code and seats, and (as children) how fresh the read is. */
function RoomHeader({ locale, snapshot, songs, created, children }: { locale: AppLocale; snapshot: RoomSnapshot; songs: ReadonlyMap<number, RoomSong>; created: boolean; children: ReactNode }) {
  const tr = (name: string, values?: Record<string, string | number>) => t(locale, `roomCheck.room.${name}`, values);
  const song = snapshot.room.musicId !== null ? songs.get(snapshot.room.musicId) : undefined;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard?.writeText(snapshot.code).then(() => setCopied(true), () => undefined);
  };
  return (
    <header className="rc-room-header">
      <span className="rc-room-cover">{song ? <img src={song.jacketUrl} alt="" /> : <NoteIcon />}</span>
      <div className="rc-room-title">
        <h2 title={tr("song")}>{song?.title ?? (snapshot.room.musicId ? tr("unknownSong", { id: snapshot.room.musicId }) : tr("noSong"))}</h2>
        <div className="rc-room-sub">
          {song?.bandName && <span>{song.bandName}</span>}
          {snapshot.room.missions.length > 0 && <ol className="rc-missions" aria-label={tr("missions")}>
            {snapshot.room.missions.map((mission, index) => <li key={index} data-mission={mission}>{missionLabel(locale, mission)}</li>)}
          </ol>}
        </div>
      </div>
      <div className="rc-room-facts">
        {created && <span className="rc-own" title={tr("ownHint")}>{tr("own")}</span>}
        <button type="button" className="rc-code md3-state" onClick={copy} title={tr("copy")} aria-label={tr("copyCode", { code: snapshot.code })}>
          <span>{snapshot.code}</span>
          <small aria-live="polite">{copied ? tr("copied") : tr("copy")}</small>
        </button>
        <Seats humans={snapshot.room.humans} capacity={snapshot.room.capacity} label={t(locale, "roomCheck.list.humans", { n: snapshot.room.humans, capacity: snapshot.room.capacity })} />
      </div>
      {children}
    </header>
  );
}

/** Which songs the players picked, most picked first. */
function Votes({ locale, snapshot, songs }: { locale: AppLocale; snapshot: RoomSnapshot; songs: ReadonlyMap<number, RoomSong> }) {
  const votes = songVotes(snapshot);
  if (votes.length < 2) return null;
  return (
    <div className="rc-votes">
      <span className="rc-votes-label">{t(locale, "roomCheck.room.votes")}</span>
      <ol aria-label={t(locale, "roomCheck.room.votes")}>
        {votes.map((vote) => {
          const song = songs.get(vote.musicId);
          return <li key={vote.musicId} data-room={vote.room || undefined}>
            {song ? <img src={song.jacketUrl} alt="" loading="lazy" /> : <span className="rc-vote-blank"><NoteIcon /></span>}
            <span className="rc-vote-title">{song?.title ?? t(locale, "roomCheck.room.unknownSong", { id: vote.musicId })}</span>
            <strong>{t(locale, "roomCheck.room.voteCount", { n: vote.count })}</strong>
          </li>;
        })}
      </ol>
    </div>
  );
}

function Players({ locale, snapshot, songs, cards, assetUrl, changed }: {
  locale: AppLocale; snapshot: RoomSnapshot; songs: ReadonlyMap<number, RoomSong>; cards: DeckCardLookup; assetUrl: AssetUrl; changed: ReadonlySet<string>;
}) {
  const tr = (name: string, values?: Record<string, string | number>) => t(locale, `roomCheck.player.${name}`, values);
  const withTeams = snapshot.players.filter((player): player is RoomPlayer & { formation: RoomFormation } => player.formation !== null);
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  // The picked player while they stay with a team; otherwise the host, then whoever joined first.
  const selected = withTeams.find((player) => key(player) === picked) ?? withTeams.find((player) => player.host) ?? withTeams[0];
  const shown = all ? withTeams : selected ? [selected] : [];
  const share = rankShare(snapshot.players);
  const sheetId = (player: RoomPlayer) => `rc-sheet-${player.joinOrder}`;
  const empty = Math.max(0, snapshot.room.capacity - snapshot.players.length);
  return (
    <section className="rc-players" aria-label={tr("title")}>
      <div className="rc-players-head">
        <h3>{tr("title")}</h3>
        <Votes locale={locale} snapshot={snapshot} songs={songs} />
        {withTeams.length > 1 && <button type="button" className="md3-button md3-button--text md3-button--small" aria-pressed={all} onClick={() => setAll(!all)}>
          {tr(all ? "collapseAll" : "expandAll")}
        </button>}
      </div>
      <ol className="rc-seat-list" style={{ "--rc-capacity": snapshot.room.capacity } as CSSProperties}>
        {snapshot.players.map((player) => <PlayerSeat key={key(player)} locale={locale} player={player} cards={cards} songs={songs} assetUrl={assetUrl}
          share={share.get(key(player)) ?? 0} selected={!all && player === selected} controls={sheetId(player)} changed={changed.has(key(player))}
          onSelect={() => { setPicked(key(player)); setAll(false); }} />)}
        {Array.from({ length: empty }, (_, index) => <EmptySeat key={`seat-${index}`} locale={locale} />)}
      </ol>
      {shown.map((player) => <TeamSheet key={key(player)} id={sheetId(player)} locale={locale} player={player} cards={cards} assetUrl={assetUrl} titled={all} />)}
    </section>
  );
}

/** A music note, where a song has no jacket on this site. */
function NoteIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" />
  </svg>;
}
