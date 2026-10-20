import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { RoomErrorCode } from "@/lib/room-check/types";
import SiriusLoader from "@/components/shared/SiriusLoader";

type Kind = RoomErrorCode | "intro" | "loading";

interface Props {
  locale: AppLocale;
  kind: Kind;
  code?: string;
  now: number;
  /** When a retry makes sense again (epoch ms on the page's clock). */
  retryAt?: number | null;
  onRetry?: () => void;
  /** A one-line notice above an older read instead of a whole card. */
  compact?: boolean;
}

const RETRYABLE: readonly Kind[] = ["busy", "network", "invalid", "cooldown", "room_not_found"];

/** Every state without a room to show, in one card style: the first visit, a read under way, and each failure. */
export default function RoomStateCard({ locale, kind, code, now, retryAt = null, onRetry, compact = false }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.states.${key}`, values);
  if (kind === "loading") return <div className="rc-state"><SiriusLoader locale={locale} label={tr("loading", { code: code ?? "" })} className="min-h-64" /></div>;
  const wait = retryAt !== null ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  const retry = onRetry && RETRYABLE.includes(kind) && (
    <button type="button" className="md3-button md3-button--tonal md3-button--small" onClick={onRetry} disabled={wait > 0}>
      {wait > 0 ? tr("retryIn", { n: wait }) : tr("retry")}
    </button>
  );
  if (compact) return <div className="rc-notice" role="status" data-kind={kind}><span>{tr(`${kind}.title`, { code: code ?? "" })}</span>{retry}</div>;
  return (
    <div className="rc-state" data-kind={kind} role={kind === "intro" ? undefined : "status"}>
      <StateIcon kind={kind} />
      <h2>{tr(`${kind}.title`, { code: code ?? "" })}</h2>
      <p>{tr(`${kind}.body`)}</p>
      {retry}
    </div>
  );
}

function StateIcon({ kind }: { kind: Kind }) {
  const path = kind === "intro" ? "M4 6h16v12H4zM8 10h8M8 14h5"
    : kind === "room_full" ? "M5 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
    : kind === "busy" || kind === "cooldown" ? "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"
    : "M12 8v5M12 16.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z";
  return <svg className="rc-state-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

/** Hosting a room with entry conditions, not open yet. */
export function ComingSoonCard({ locale }: { locale: AppLocale }) {
  const tr = (key: string) => t(locale, `roomCheck.host.${key}`);
  return (
    <aside className="rc-soon" aria-disabled="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 17h18M5 17l1.5-6h11L19 17M8 11l1-4h6l1 4M7 20a1.5 1.5 0 1 0 0-3M17 20a1.5 1.5 0 1 0 0-3" />
      </svg>
      <div><strong>{tr("title")}</strong><p>{tr("body")}</p></div>
      <span className="rc-soon-badge">{tr("badge")}</span>
    </aside>
  );
}
