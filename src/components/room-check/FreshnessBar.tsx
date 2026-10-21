import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { formatAge } from "@/lib/game-api/server";
import type { WatchStop } from "@/lib/room-check/types";
import { freshness, readAge, refreshIn, refreshWindow } from "@/lib/room-check/summary";
import type { RoomSnapshot } from "@/lib/room-check/types";

export type LiveState = { status: "off" } | { status: "on" } | { status: "stopped"; reason: WatchStop };

interface Props {
  locale: AppLocale;
  snapshot: RoomSnapshot;
  receivedAt: number;
  now: number;
  loading: boolean;
  unavailable?: boolean;
  live: LiveState;
  onRefresh: () => void;
  onLive: (on: boolean) => void;
}

/** "Just now", "12 s ago", then minutes and hours. */
export function ageText(locale: AppLocale, age: number): string {
  if (age < 5_000) return t(locale, "roomCheck.fresh.justNow");
  if (age < 60_000) return t(locale, "roomCheck.fresh.secondsAgo", { n: Math.floor(age / 1000) });
  return formatAge(0, age, locale);
}

/**
 * How old the shown read is and whether it can be read again: a dot that turns from green to amber to grey, the age
 * ticking every second (screen readers hear it every five), where the read came from, the refresh button with its
 * wait drawn as a ring, and the live switch.
 */
export default function FreshnessBar({ locale, snapshot, receivedAt, now, loading, unavailable, live, onRefresh, onLive }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.fresh.${key}`, values);
  const age = readAge(snapshot, receivedAt, now);
  const wait = refreshIn(snapshot, receivedAt, now);
  const span = refreshWindow(snapshot);
  const spoken = Math.floor(age / 5_000) * 5_000;
  const on = live.status === "on";
  return (
    <div className="rc-fresh" data-level={on ? "live" : freshness(age)}>
      <span className="rc-fresh-dot" aria-hidden="true" />
      <span className="rc-fresh-text">
        <strong title={new Date(Date.now() - age).toLocaleString(locale)}>{on ? tr("live") : tr("readAgo", { time: ageText(locale, age) })}</strong>
        <small>{tr(`source.${snapshot.source}`)}</small>
        <span className="sr-only" aria-live="polite">{tr("readAgo", { time: ageText(locale, spoken) })}</span>
      </span>
      {live.status === "stopped" && !unavailable && <span className="rc-fresh-note" role="status">{tr(`stopped.${live.reason}`)}</span>}
      <span className="rc-fresh-actions">
        {/* A live view updates itself; the manual refresh comes back when it stops. */}
        {!on && !unavailable && <button type="button" className="md3-button md3-button--tonal md3-button--small rc-refresh" onClick={onRefresh}
          disabled={loading || wait > 0} aria-label={wait > 0 ? tr("refreshIn", { n: Math.ceil(wait / 1000) }) : tr("refresh")}>
          <CooldownRing share={span > 0 ? wait / span : 0} spinning={loading} />
          <span aria-hidden="true">{wait > 0 ? tr("refreshInShort", { n: Math.ceil(wait / 1000) }) : tr("refresh")}</span>
        </button>}
        {!unavailable && <label className="rc-live-switch">
          <span>{tr("liveToggle")}</span>
          <button type="button" role="switch" aria-checked={on} className={`md3-switch${on ? " md3-switch--on" : ""}`} onClick={() => onLive(!on)}>
            <span className="md3-switch__thumb" />
          </button>
        </label>}
      </span>
    </div>
  );
}

/** The refresh wait as a ring that empties as the wait runs out; a spinning arc while a read is under way. */
function CooldownRing({ share, spinning }: { share: number; spinning: boolean }) {
  const circumference = 2 * Math.PI * 8;
  return (
    <svg className="rc-ring" data-spinning={spinning || undefined} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="8" className="rc-ring-track" />
      {spinning
        ? <circle cx="10" cy="10" r="8" className="rc-ring-arc" strokeDasharray={`${circumference * 0.3} ${circumference}`} />
        : share > 0 && <circle cx="10" cy="10" r="8" className="rc-ring-arc" strokeDasharray={`${circumference * share} ${circumference}`} transform="rotate(-90 10 10)" />}
      {!spinning && share === 0 && <path d="M14.5 7.5A5 5 0 1 0 15 11M14.5 4.5v3h-3" className="rc-ring-icon" />}
    </svg>
  );
}
