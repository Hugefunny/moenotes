import { useRef, type KeyboardEvent } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { freshness, readAge, shownRead } from "@/lib/room-check/summary";
import type { RoomEntry } from "@/lib/room-check/types";
import { ageText } from "./FreshnessBar";
import type { RoomSong } from "./songs";

interface Props {
  locale: AppLocale;
  rooms: readonly RoomEntry[];
  selected: string | null;
  songs: ReadonlyMap<number, RoomSong>;
  now: number;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}

export const entryKey = (entry: { code: string; region: string }) => `${entry.region}:${entry.code}`;

/** The rooms looked up in this browser, one line each; arrow keys move between them. */
export default function RoomList({ locale, rooms, selected, songs, now, onSelect, onRemove, onClear }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.list.${key}`, values);
  const listRef = useRef<HTMLOListElement>(null);
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = rooms[(index + step + rooms.length) % rooms.length];
    if (!next) return;
    onSelect(entryKey(next));
    listRef.current?.querySelector<HTMLElement>(`[data-key="${entryKey(next)}"] .rc-room-main`)?.focus();
  };
  return (
    <section className="rc-rooms" aria-label={tr("title")}>
      <div className="rc-rooms-head">
        <h2>{tr("title")}</h2>
        {rooms.length > 1 && <button type="button" className="md3-button md3-button--text md3-button--small" onClick={onClear}>{tr("clear")}</button>}
      </div>
      {rooms.length === 0 ? <p className="rc-muted rc-rooms-empty">{tr("empty")}</p> : (
        <ol ref={listRef} className="rc-room-list">
          {rooms.map((entry, index) => {
            const key = entryKey(entry);
            return (
              <li key={key} data-key={key} className="rc-room" data-selected={key === selected || undefined}>
                <button type="button" className="rc-room-main md3-state" aria-current={key === selected || undefined} onClick={() => onSelect(key)} onKeyDown={(event) => move(event, index)}>
                  <RoomLine locale={locale} entry={entry} songs={songs} now={now} />
                </button>
                <button type="button" className="md3-icon-button md3-icon-button--small rc-room-remove" onClick={() => onRemove(key)} aria-label={tr("remove", { code: entry.code })} title={tr("remove", { code: entry.code })}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function RoomLine({ locale, entry, songs, now }: { locale: AppLocale; entry: RoomEntry; songs: ReadonlyMap<number, RoomSong>; now: number }) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.list.${key}`, values);
  const read = shownRead(entry);
  const snapshot = read?.snapshot ?? null;
  const song = snapshot?.room.musicId != null ? songs.get(snapshot.room.musicId) : undefined;
  const age = read ? readAge(read.snapshot, read.receivedAt, now) : null;
  const errorCode = entry.status === "error" ? entry.error?.code ?? "invalid" : null;
  return (
    <>
      <span className="rc-room-jacket">{song ? <img src={song.jacketUrl} alt="" loading="lazy" /> : <span aria-hidden="true">#</span>}</span>
      <span className="rc-room-text">
        <span className="rc-room-code">{entry.code}</span>
        <span className="rc-room-song">{song?.title ?? (snapshot?.room.musicId ? tr("unknownSong", { id: snapshot.room.musicId }) : "")}</span>
      </span>
      <span className="rc-room-side">
        {snapshot && <Seats humans={snapshot.room.humans} capacity={snapshot.room.capacity} label={tr("humans", { n: snapshot.room.humans, capacity: snapshot.room.capacity })} />}
        {entry.status === "ready" && age !== null
          ? <span className="rc-room-age" data-level={freshness(age)}>{ageText(locale, age)}</span>
          : <span className="rc-room-status" data-status={errorCode ?? entry.status}>{tr(errorCode ? `status.error.${errorCode}` : `status.${entry.status}`)}</span>}
      </span>
    </>
  );
}

/** Taken seats as filled dots and open seats as rings. */
export function Seats({ humans, capacity, label }: { humans: number; capacity: number; label: string }) {
  return <span className="rc-seats" role="img" aria-label={label}>
    {Array.from({ length: Math.max(capacity, humans) }, (_, index) => <span key={index} data-taken={index < humans || undefined} />)}
  </span>;
}
