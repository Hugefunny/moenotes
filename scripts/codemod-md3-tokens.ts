/**
 * Migration codemod (Material 3 rewrite): rewrites the legacy `--mn-*` color, shadow and font tokens to Material 3
 * roles, in Tailwind utilities, plain `var()` references (inline styles, CSS files) and the legacy class names.
 * Mapping: VISUAL_DESIGN.md (token table). Runs per path; review the diff of each domain before committing.
 *
 *   bun scripts/codemod-md3-tokens.ts <file-or-dir>...
 *
 * Layout and data variables stay (--mn-layout-max-width, --mn-sidebar-offset, --mn-filter-*, --mn-density-*,
 * --mn-cache-*, chart-data's --mn-cd-*). Removed in the cleanup phase once nothing uses the legacy tokens.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

/** Legacy token → Material 3 color role (Tailwind color name / --md-sys-color-* suffix). */
export const COLOR_ROLES: Record<string, string> = {
  "bg": "surface",
  "paper": "surface-container-low",
  "glass": "surface-container-low",
  "surface": "surface-container",
  "surface-strong": "surface-container-high",
  "cream-deep": "surface-container-highest",
  "text": "on-surface",
  "ink-soft": "on-surface-variant",
  "text-muted": "on-surface-variant",
  "border": "outline-variant",
  "glass-border": "outline-variant",
  "accent": "primary",
  "accent-deep": "primary",
  "accent-soft": "secondary-container",
  "rose": "error",
  "danger": "error",
  "mint": "success",
  "mint-deep": "on-success-container",
  "mint-soft": "success-container",
  "pink": "category1",
  "pink-soft": "category1-container",
  "cyan": "category2",
  "amber": "category3",
  "peach": "category3-container",
  "yellow": "warning-container",
  "orbit-night": "secondary-container",
  "orbit-light": "on-secondary-container",
};

/** Text colors that sit on a filled primary surface in the legacy markup (`bg-accent-deep text-paper`). */
const ON_PRIMARY_TEXT = new Set(["paper", "bg"]);

const SHADOWS: Record<string, string> = {
  "shadow": "",
  "shadow-stamp-sm": "",
  "shadow-stamp": "shadow-elevation-1",
  "shadow-stamp-lg": "shadow-elevation-1",
  "glass-shadow": "",
};
const SHADOW_VARS: Record<string, string> = {
  "shadow": "var(--md-sys-elevation-level0)",
  "shadow-stamp-sm": "var(--md-sys-elevation-level0)",
  "shadow-stamp": "var(--md-sys-elevation-level1)",
  "shadow-stamp-lg": "var(--md-sys-elevation-level1)",
  "glass-shadow": "var(--md-sys-elevation-level0)",
};
const FONTS: Record<string, string> = {
  "font-display": "var(--md-ref-typeface-brand)",
  "font-body": "var(--md-ref-typeface-plain)",
  "font-hand": "var(--md-ref-typeface-plain)",
  "font-note": "var(--md-ref-typeface-mono)",
};

const UTILITY_PREFIXES = ["bg", "text", "border", "border-t", "border-b", "border-l", "border-r", "border-x", "border-y", "ring", "ring-offset", "divide", "from", "via", "to", "fill", "stroke", "outline", "decoration", "accent", "caret", "placeholder"];
const prefixPattern = UTILITY_PREFIXES.sort((a, b) => b.length - a.length).join("|");

export function migrateSource(source: string, kind: "markup" | "css"): string {
  let out = source;

  if (kind === "markup") {
    // prefix-[var(--mn-x)](/alpha)? → prefix-role(/alpha)?
    out = out.replace(new RegExp(`\\b(${prefixPattern})-\\[var\\(--mn-([a-z-]+)\\)\\](\\/\\d+)?`, "g"), (match, prefix: string, token: string, alpha = "") => {
      if (prefix === "text" && ON_PRIMARY_TEXT.has(token)) return `text-on-primary${alpha}`;
      const role = COLOR_ROLES[token];
      return role ? `${prefix}-${role}${alpha}` : match;
    });
    // prefix-[color-mix(in_space,var(--mn-x)_N%,transparent)] → prefix-role/N
    out = out.replace(new RegExp(`\\b(${prefixPattern})-\\[color-mix\\(in_(?:srgb|oklab|oklch),var\\(--mn-([a-z-]+)\\)_(\\d+)%,transparent\\)\\]`, "g"), (match, prefix: string, token: string, percent: string) => {
      const role = COLOR_ROLES[token];
      return role ? `${prefix}-${role}/${percent}` : match;
    });
    // shadow-[var(--mn-shadow-*)]
    out = out.replace(/(^|[\s"'`{])((?:[a-z-]+:)*)shadow-\[var\(--mn-(shadow(?:-stamp(?:-sm|-lg)?)?|glass-shadow)\)\]/g, (_m, lead: string, variants: string, token: string) => {
      const utility = SHADOWS[token];
      return utility ? `${lead}${variants}${utility}` : lead;
    });
    // font-[var(--mn-font-*)]
    out = out.replace(/font-\[var\(--mn-(font-[a-z]+)\)\]/g, (match, token: string) => (FONTS[token] ? `font-[${FONTS[token]}]` : match));
    // Legacy classes: the stamp press becomes an M3 state layer; the focus helper is global now.
    out = out.replace(/(^|[\s"'`])mn-stamp-press(?:-lg)?(?=[\s"'`])/g, "$1md3-state");
    out = out.replace(/(^|[\s"'`])mn-focus(?=[\s"'`])/g, "$1");
    out = out.replace(/\bborder-\[1\.5px\]/g, "border");
    // Radii onto the M3 shape scale.
    out = out.replace(/\brounded-3xl\b/g, "rounded-shape-lg").replace(/\brounded-2xl\b/g, "rounded-shape-lg").replace(/\brounded-xl\b/g, "rounded-shape-md").replace(/\brounded-lg\b/g, "rounded-shape-sm").replace(/\brounded-md\b/g, "rounded-shape-sm");
    // Collapse doubled spaces left by removed classes inside class strings.
    out = out.replace(/(className|class)=(["'])([^"']*)\2/g, (_m, attr: string, quote: string, value: string) => `${attr}=${quote}${value.replace(/\s{2,}/g, " ").trim()}${quote}`);
  }

  // Plain var() references (inline styles, gradients, CSS files).
  out = out.replace(/var\(--mn-([a-z-]+)\)/g, (match, token: string) => {
    if (SHADOW_VARS[token]) return SHADOW_VARS[token]!;
    if (FONTS[token]) return FONTS[token]!;
    const role = COLOR_ROLES[token];
    return role ? `var(--md-sys-color-${role})` : match;
  });
  return out;
}

const EXTENSIONS: Record<string, "markup" | "css"> = { ".tsx": "markup", ".ts": "markup", ".astro": "markup", ".css": "css" };

function walk(path: string, files: string[]): void {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) walk(join(path, name), files);
  } else if (EXTENSIONS[extname(path)]) {
    files.push(path);
  }
}

if (import.meta.main) {
  const files: string[] = [];
  for (const target of process.argv.slice(2)) walk(target, files);
  let changed = 0;
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const next = migrateSource(raw, EXTENSIONS[extname(file)]!);
    if (next !== raw) {
      writeFileSync(file, next);
      changed++;
    }
  }
  console.log(`[codemod-md3] ${changed} of ${files.length} files changed`);
}
