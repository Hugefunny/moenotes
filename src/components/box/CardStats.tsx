import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { BoxCard, CardFieldName, CardKind } from "@/lib/box/model";
import "@/styles/card-stats.css";

/** The values a card kind records, in reading order: level first, then the 1–5 steps. */
export const STAT_FIELDS: Readonly<Record<CardKind, readonly CardFieldName[]>> = {
  member: ["level", "awake", "rank", "liveSkillLevel", "gekisouSkillLevel"],
  snap: ["level", "rank"],
};
/** The 1–5 steps reach their maximum at 5. */
const STEP_MAX = 5;

/**
 * A card's recorded values as one compact row: a short label over each value. Steps at their maximum are marked, and
 * unknown values show a dash, so a grid of cards reads at a glance which ones are finished.
 */
export default function CardStats({ locale, card, className = "" }: { locale: AppLocale; card: BoxCard; className?: string }) {
  const tr = (key: string) => t(locale, `deckWorkspace.${key}`);
  return <dl className={`cs-stats ${className}`.trim()} data-kind={card.kind}>
    {STAT_FIELDS[card.kind].map(name => {
      const value = card.fields[name].value;
      const label = name === "level" ? tr("collection.cultivationLevel") : tr(name);
      return <div key={name} data-field={name} data-max={name !== "level" && value === STEP_MAX ? "true" : undefined} title={`${label} ${value ?? tr("unknown")}`}>
        <dt>{tr(`statShort.${name}`)}</dt>
        <dd aria-label={value === null ? tr("unknown") : undefined}>{value ?? "—"}</dd>
      </div>;
    })}
  </dl>;
}
