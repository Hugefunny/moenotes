/** Native filter categories confirmed against the in-game filter panel. */
// i18n-allow-hardcoded: Japanese master-data category markers, never rendered as UI text.
export function liveCategory(descriptionJa: string): number[] {
  if (descriptionJa.startsWith("【シンプル】")) return [1]; // i18n-allow-hardcoded: native master-data marker
  if (descriptionJa.startsWith("【ライフ】")) return [2]; // i18n-allow-hardcoded: native master-data marker
  if (descriptionJa.startsWith("【判定】")) return [3]; // i18n-allow-hardcoded: native master-data marker
  return [];
}
export function supportCategories(categories: readonly number[] | undefined, icon: number): number[] {
  const explicit = (categories ?? []).filter((n) => [1, 2, 3].includes(n));
  // Native icons: score (7), duration extension (17), recovery (14), judgement (10).
  // Some newer rows omit displaySkillCategories; their native icon retains the effect category.
  const fallback: Record<number, number[]> = { 7: [1], 17: [1], 14: [2], 10: [3] };
  return explicit.length ? explicit : fallback[icon] ?? [];
}
export interface SkillFilterCatalog {
  live: Record<string, number[]>;
  support: Record<string, number[]>;
  gekisou: Record<string, number[]>;
  gekisouSupport: Record<string, number[]>;
}
