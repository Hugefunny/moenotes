import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { NewsCategory } from "@/lib/game-api/announcements";

const toneByCategory: Record<NewsCategory, string> = {
  maintenance: "border-primary/45 bg-secondary-container text-primary",
  bug: "border-error/55 bg-error/14 text-error",
  campaign: "border-category1/70 bg-category1-container text-on-surface-variant",
  update: "border-success/80 bg-success-container text-on-success-container",
  gacha: "border-category3/60 bg-category3/16 text-on-surface",
  other: "border-outline-variant bg-surface-container-highest text-on-surface-variant",
};

export default function NewsCategoryBadge({ locale, category }: { locale: AppLocale; category: NewsCategory }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-label-small leading-4 ${toneByCategory[category]}`}>
      {t(locale, `news.category.${category}`)}
    </span>
  );
}
