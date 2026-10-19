/**
 * A page title split around the part its heading marks with the highlighter. MoeSekai's page header marks one word of
 * the title ("Card *Compendium*"), not all of it.
 *
 * `preferred` is the locale's choice (messages `pageTitleHighlights`), used where the title contains it. Otherwise
 * (a locale without one, where `t` falls back to English) the last space-separated word is marked, or the whole title
 * when it has no space.
 */
export function splitTitleHighlight(title: string, preferred?: string): { before: string; mark: string; after: string } {
  const at = preferred ? title.lastIndexOf(preferred) : -1;
  if (preferred && at >= 0) return { before: title.slice(0, at), mark: preferred, after: title.slice(at + preferred.length) };
  const trimmed = title.trimEnd();
  const space = trimmed.lastIndexOf(" ");
  if (space > 0) return { before: trimmed.slice(0, space + 1), mark: trimmed.slice(space + 1), after: "" };
  return { before: "", mark: title, after: "" };
}

/** The `pageTitleHighlights` key of a page title key: `seo.cards.title` → `cards`, `openPlatform.docs.title` → `openPlatformDocs`. */
export function titleHighlightId(titleKey: string): string {
  return titleKey
    .replace(/^seo\./, "")
    .replace(/\.title$/, "")
    .replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase());
}
