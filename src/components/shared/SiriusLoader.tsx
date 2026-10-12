import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import "@/styles/sirius-loader.css";

/**
 * Material 3 circular progress indicator (indeterminate), drawn in CSS so lists can show many at once. Decorative
 * when paired with a button label or a loading status. (The name stays from the earlier loader so callers keep it.)
 */
export function SiriusIcon({ className = "h-4 w-4" }: { className?: string; spacious?: boolean }) {
  return (
    <svg className={`md3-progress-circular ${className}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle className="md3-progress-circular__track" cx="24" cy="24" r="20" />
      <circle className="md3-progress-circular__arc" cx="24" cy="24" r="20" />
    </svg>
  );
}

/** A loading status: the circular indicator with its label (block: centred in its box; compact: inline). */
export default function SiriusLoader({ locale, label, compact = false, className = "" }: {
  locale: AppLocale;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const text = label ?? t(locale, "loader.loading");
  return (
    <span className={`md3-loader ${compact ? "md3-loader--compact" : "md3-loader--block"} ${className}`} role="status" aria-label={text}>
      <SiriusIcon className={compact ? "h-6 w-6" : "h-12 w-12"} />
      {compact || label ? <span className="md3-loader__label" aria-hidden="true">{text.replace(/(?:\.{3}|…)+$/, "")}</span> : null}
    </span>
  );
}
