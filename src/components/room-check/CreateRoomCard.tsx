import { useState, type FormEvent } from "react";
import { accountLoginUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { roomCheckConfig } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { extractRoomCodes } from "@/lib/room-check/parse";
import type { RoomError, RoomErrorCode } from "@/lib/room-check/types";

interface Props {
  locale: AppLocale;
  /** The server the page looks rooms up on; a new room opens on the same one. */
  region: GameServer;
  onRegion: (region: GameServer) => void;
  busy: boolean;
  /** Why the last attempt failed. */
  error: RoomError | null;
  /** When that failure answered (the page's clock). */
  errorAt: number | null;
  /** The code of the room this browser just opened, if any. */
  opened: string | null;
  now: number;
  /** Opens a room with `code`, or without one to have the service pick it. */
  onCreate: (code: string | null) => void;
}

/** The failures opening a room can end in, each with its own copy. */
const FAILURES: readonly RoomErrorCode[] = ["bad_code", "room_exists", "login_required", "rate_limited", "busy", "bot_unavailable", "network", "invalid", "internal"];
/** Failures another attempt can get past. */
const RETRYABLE: readonly RoomErrorCode[] = ["rate_limited", "busy", "network", "invalid", "internal", "bot_unavailable"];

/**
 * Opens a room and follows it from this page. The code is optional: left blank the service picks a free one, which
 * suits a player who has no code to share yet.
 */
export default function CreateRoomCard({ locale, region, onRegion, busy, error, errorAt, opened, now, onCreate }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.create.${key}`, values);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  // The last code sent, so a retry asks for the same room again.
  const [sent, setSent] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = value.trim();
    if (!text) {
      setInvalid(false);
      setSent(null);
      onCreate(null);
      return;
    }
    const [code] = extractRoomCodes(text);
    if (!code) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSent(code);
    onCreate(code);
  };

  const kind: RoomErrorCode | null = error ? (FAILURES.includes(error.code) ? error.code : "internal") : null;
  // The wait the service asked for counts down on the retry button.
  const wait = errorAt !== null && error?.retryAfterMs != null ? Math.max(0, Math.ceil((errorAt + error.retryAfterMs - now) / 1000)) : 0;
  const retry = kind !== null && RETRYABLE.includes(kind) && (
    <button type="button" className="md3-button md3-button--tonal md3-button--small" onClick={() => onCreate(sent)} disabled={busy || wait > 0}>
      {wait > 0 ? t(locale, "roomCheck.states.retryIn", { n: wait }) : t(locale, "roomCheck.states.retry")}
    </button>
  );
  // A room is bound to the account that opens it, so the page sends a visitor without a session to sign in first.
  const login = kind === "login_required" ? (
    <button type="button" className="md3-button md3-button--tonal md3-button--small"
      onClick={() => { window.location.href = accountLoginUrl(locale, window.location.pathname); }}>
      {tr("errors.login_required.action")}
    </button>
  ) : null;

  return (
    <form className="rc-create" onSubmit={submit} noValidate aria-labelledby="rc-create-title">
      <div className="rc-create-head">
        <CreateIcon />
        <div className="rc-create-text">
          <h2 id="rc-create-title">{tr("title")}</h2>
          <p>{tr("body")}</p>
        </div>
      </div>
      <div className="rc-create-fields">
        <label className="rc-form-field">
          <span className="rc-form-label">{tr("codeLabel")}</span>
          <span className="rc-form-input">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></svg>
            <input value={value} onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
              inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={7}
              placeholder={tr("codePlaceholder")} aria-describedby="rc-create-hint" aria-invalid={invalid || undefined} />
          </span>
        </label>
        <GameServerSwitch locale={locale} value={region} onChange={onRegion} servers={roomCheckConfig.servers} />
        <button type="submit" className="md3-button md3-button--filled rc-create-submit" disabled={busy}>
          {busy && <SiriusIcon className="h-4 w-4" />}
          {tr(busy ? "creating" : "submit")}
        </button>
      </div>
      <p id="rc-create-hint" className="rc-form-hint" data-kind={invalid ? "invalid" : undefined} role={invalid ? "alert" : undefined}>
        {invalid ? tr("invalidCode") : tr("hint")}
      </p>
      {kind
        ? <div className="rc-create-error" data-kind={kind} role="alert">
          <span>{tr(`errors.${kind}.title`)} {tr(`errors.${kind}.body`)}</span>
          {kind === "login_required" ? login : retry}
        </div>
        : opened !== null && <p className="rc-create-opened" role="status">{tr("opened", { code: opened })}</p>}
    </form>
  );
}

/** A door being opened, in the site's line style. */
function CreateIcon() {
  return (
    <svg className="rc-create-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16M6 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M15 12h2M18 12v4M11 9v.5" />
    </svg>
  );
}
