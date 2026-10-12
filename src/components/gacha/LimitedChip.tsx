import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

export default function LimitedChip({ locale }: { locale: AppLocale }) {
  return (
    <span className="inline-flex items-center rounded-full border border-category3/80 bg-surface-container-low px-2.5 py-1 text-label-small text-on-surface-variant">
      {t(locale, "gacha.limited")}
    </span>
  );
}
