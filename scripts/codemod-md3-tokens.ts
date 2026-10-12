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
    // Legacy surfaces: section panels become the M3 tonal surface; the old segmented wrapper the M3 one.
    out = out.replace(/(^|[\s"'`])(?:mn-paper|mn-glass|mn-system-section)(?=[\s"'`])/g, "$1md3-surface");
    out = out.replace(/(^|[\s"'`])(?:mn-card|mn-sticker)(?=[\s"'`])/g, "$1md3-card-outlined");
    out = out.replace(/(^|[\s"'`])mn-stripes-cream(?=[\s"'`])/g, "$1md3-transparency-grid");
    out = out.replace(/(^|[\s"'`])mn-texture-orbit(?=[\s"'`])/g, "$1md3-placeholder");
    // Sirius gradient section headers become flat (M3 headers sit on the surface, divided by an outline).
    out = out.replace(/\s?bg-gradient-to-[a-z]+ from-(?:primary|secondary-container|category\d)\/\d+ to-transparent/g, "");
    // Hover lifts and press scales: M3 shows interaction with state layers, not motion.
    out = out.replace(/\s(?:[a-z-]+:)*hover:-translate-y-(?:0\.5|1|2)(?=[\s"'`])/g, "");
    out = out.replace(/\s(?:[a-z-]+:)*active:scale-(?:9[0-9])(?=[\s"'`])/g, "");
    // Legacy segmented groups: wrapper → .md3-segmented, its toggle buttons (a ternary between a selected and an
    // idle class list) → .md3-segment (the aria-pressed/selected attribute carries the state).
    out = out.replace(/className="mn-segmented[^"]*"(?=[^>]*role="tablist")/g, 'className="md3-tabs"');
    out = out.replace(/className="mn-segmented[^"]*"/g, (match) => {
      const keep = match.match(/\b(?:mb|mt|ml|mr|mx|my)-[0-9.]+\b|\bw-fit\b|\bshrink-0\b/g) ?? [];
      return `className="md3-segmented ${keep.join(" ")}"`.replace(/\s+"$/, '"');
    });
    out = out.replace(/className=\{`[a-z0-9:.\-[\]/ ]*\$\{[^}?]+\?\s*"[^"]*bg-secondary-container[^"]*"\s*:\s*"[^"]*"\}[^`]*`\}/g, (match, offset: number, whole: string) => {
      // Only inside a segmented group: the nearest wrapper opened before this button.
      const before = whole.slice(Math.max(0, offset - 700), offset);
      if (before.lastIndexOf("md3-tabs") > Math.max(before.lastIndexOf("</div>"), before.lastIndexOf("md3-segmented"))) return 'className="md3-tab md3-state"';
      return before.lastIndexOf("md3-segmented") > before.lastIndexOf("</div>") ? 'className="md3-segment md3-state"' : match;
    });
    out = out.replace(/\bborder-\[1\.5px\]/g, "border");
    // Radii onto the M3 shape scale.
    out = out.replace(/\brounded-3xl\b/g, "rounded-shape-lg").replace(/\brounded-2xl\b/g, "rounded-shape-lg").replace(/\brounded-xl\b/g, "rounded-shape-md").replace(/\brounded-lg\b/g, "rounded-shape-sm").replace(/\brounded-md\b/g, "rounded-shape-sm");
    out = migrateTypography(out);
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

/**
 * Class-string typography onto the M3 type scale. Works on whole class lists (className="…" / class="…" and template
 * literals' static parts), so it can see size, weight, case and tracking together:
 * - uppercase / tracked small text (eyebrows, table heads) → label-medium/large, no forced case or tracking;
 * - text-[10px]/[11px] → label-small; text-xs → body-small (label-medium when bold); text-sm → body-medium
 *   (label-large when bold/black); text-base → body-large (title-medium when bold); text-lg → title-large;
 *   text-xl/2xl → headline-small, text-3xl → headline-medium, text-4xl → headline-large;
 * - font-black / font-bold / font-semibold go: the scale's weight applies. Responsive prefixes are kept.
 */
const SIZE_MAP: Record<string, [regular: string, strong: string]> = {
  "text-[8px]": ["text-label-small", "text-label-small"],
  "text-[9px]": ["text-label-small", "text-label-small"],
  "text-[10px]": ["text-label-small", "text-label-small"],
  "text-[11px]": ["text-label-small", "text-label-small"],
  "text-xs": ["text-body-small", "text-label-medium"],
  "text-sm": ["text-body-medium", "text-label-large"],
  "text-base": ["text-body-large", "text-title-medium"],
  "text-lg": ["text-title-large", "text-title-large"],
  "text-xl": ["text-headline-small", "text-headline-small"],
  "text-2xl": ["text-headline-small", "text-headline-small"],
  "text-3xl": ["text-headline-medium", "text-headline-medium"],
  "text-4xl": ["text-headline-large", "text-headline-large"],
  "text-5xl": ["text-display-small", "text-display-small"],
};
const STRONG = new Set(["font-black", "font-bold", "font-semibold", "font-extrabold"]);
const DROP = new Set(["font-black", "font-bold", "font-semibold", "font-extrabold", "font-medium", "uppercase", "tracking-wider", "tracking-wide", "tracking-widest", "tracking-tight", "tracking-tighter", "tracking-normal", "leading-none", "leading-tight", "leading-relaxed", "leading-snug"]);

function migrateClassList(list: string): string {
  const tokens = list.split(/(\s+)/);
  const words = tokens.filter((token) => token.trim());
  const base = (word: string) => word.split(":").at(-1) ?? word;
  const strong = words.some((word) => STRONG.has(base(word)));
  const label = words.some((word) => base(word) === "uppercase" || base(word).startsWith("tracking-["));
  const hasSize = words.some((word) => SIZE_MAP[base(word)]);
  if (!hasSize && !words.some((word) => DROP.has(base(word)))) return list;
  return tokens
    .map((token) => {
      if (!token.trim()) return token;
      const parts = token.split(":");
      const utility = parts.pop()!;
      const prefix = parts.length ? `${parts.join(":")}:` : "";
      const size = SIZE_MAP[utility];
      if (size) {
        const next = label ? (utility === "text-sm" ? "text-label-large" : "text-label-medium") : size[strong ? 1 : 0];
        return `${prefix}${next}`;
      }
      // Weight, case and tracking only drop where the size is set by the scale (else they still carry meaning).
      if (hasSize && DROP.has(utility)) return "";
      if (hasSize && utility.startsWith("tracking-[")) return "";
      return token;
    })
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function migrateTypography(source: string): string {
  return source
    .replace(/\b(className|class)=(["'])([^"']*)\2/g, (_m, attr: string, quote: string, value: string) => `${attr}=${quote}${migrateClassList(value)}${quote}`)
    .replace(/\b(className|class)=\{`([^`]*)`\}/g, (_m, attr: string, value: string) => {
      // Template literal: migrate the static runs between ${…} expressions; the expressions' own strings are handled
      // by the plain-string pass below.
      const migrated = value.replace(/(^|\})([^$]*?)(\$\{|$)/g, (_x, open: string, text: string, close: string) => `${open}${text.trim() ? ` ${migrateClassList(text)} ` : text}${close}`);
      return `${attr}={\`${migrated.replace(/\s{2,}/g, " ").trim()}\`}`;
    })
    // Class strings inside expressions (ternaries, constants): only those that look like utility lists.
    .replace(/(["'])((?:[a-z0-9:[\]\/._%-]+\s+)*[a-z0-9:[\]\/._%-]+)\1/g, (match, quote: string, value: string) =>
      /\btext-(?:xs|sm|base|lg|[2-5]?xl|\[(?:8|9|10|11)px\])(?=[\s"']|$)/.test(value) ? `${quote}${migrateClassList(value)}${quote}` : match);
}

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
