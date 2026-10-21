import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

export interface AtFourState {
  /** The prompt still asks what to do; once it is dismissed the offer stays as a one-line notice. */
  prompt: boolean;
  kicking: boolean;
  failed: boolean;
  onKick: () => void;
  onKeep: () => void;
}

/** The room observer can leave at any time; its reminder stays visible while present. */
export default function AtFourNotice({ locale, state }: { locale: AppLocale; state: AtFourState }) {
  const tr = (key: string) => t(locale, `roomCheck.atFour.${key}`);
  const actions = (
    <div className="rc-atfour-actions">
      <button type="button" className="md3-button md3-button--filled md3-button--small" onClick={state.onKick} disabled={state.kicking}>
        {tr(state.kicking ? "kicking" : "kick")}
      </button>
      {state.prompt && <button type="button" className="md3-button md3-button--text md3-button--small" onClick={state.onKeep}>{tr("keep")}</button>}
    </div>
  );
  if (!state.prompt) {
    return (
      <div className="rc-atfour" data-variant="notice" role="status">
        <FourIcon />
        <p>{tr("notice")}</p>
        {actions}
        {state.failed && <p className="rc-atfour-error" role="alert">{tr("failed")}</p>}
      </div>
    );
  }
  return (
    <div className="rc-atfour" data-variant="prompt" role="status" aria-labelledby="rc-atfour-title" aria-describedby="rc-atfour-body">
      <FourIcon />
      <div className="rc-atfour-text">
        <h3 id="rc-atfour-title">{tr("promptTitle")}</h3>
        <p id="rc-atfour-body">{tr("promptBody")}</p>
        {state.failed && <p className="rc-atfour-error" role="alert">{tr("failed")}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Four seats taken. */
function FourIcon() {
  return (
    <svg className="rc-atfour-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 19v-1a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1M13 19v-1a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1" />
    </svg>
  );
}
