import type { AppLocale } from "./locales";
import { SUPPORTED_LOCALES } from "./locales";
import { buildEnv } from "./build-env";

/**
 * Which locales a single `astro build` renders. The GitHub Actions site build sets `MOENOTES_BUILD_LOCALES=all`;
 * a local `astro build` can set `core`, `rest` or a list to render fewer locales while developing, and
 * `astro dev` leaves it unset to render every locale. This module reads the variable through `buildEnv` (project boundary:
 * no direct `process.env` outside `./build-env.ts`).
 */

/** The five locales that ship first: the product's primary languages. */
export const CORE_LOCALES: readonly AppLocale[] = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"];

/** The locales built in the follow-up batch. */
export const REST_LOCALES: readonly AppLocale[] = SUPPORTED_LOCALES.filter(
  (locale): locale is AppLocale => !CORE_LOCALES.includes(locale),
);

export type BuildLocaleSelection =
  | { kind: "all" }
  | { kind: "core" }
  | { kind: "rest" }
  | { kind: "list"; locales: readonly AppLocale[] };

/**
 * Parse the `MOENOTES_BUILD_LOCALES` value: unset/empty/`all` renders every locale; `core`/`rest` name the two
 * batches; otherwise a comma-separated list of locales. Unknown tokens are dropped; a list left empty falls back
 * to `all` so a typo never produces an empty site.
 */
export function resolveBuildLocales(value: string | undefined): BuildLocaleSelection {
  const raw = value?.trim();
  if (!raw || raw === "all") return { kind: "all" };
  if (raw === "core") return { kind: "core" };
  if (raw === "rest") return { kind: "rest" };
  const locales = raw.split(",").map((token) => token.trim()).filter((token): token is AppLocale =>
    (SUPPORTED_LOCALES as readonly string[]).includes(token),
  );
  return locales.length ? { kind: "list", locales } : { kind: "all" };
}

/** The concrete locale set a selection renders, preserving `SUPPORTED_LOCALES` order. */
export function buildLocaleSet(selection: BuildLocaleSelection): readonly AppLocale[] {
  switch (selection.kind) {
    case "all":
      return SUPPORTED_LOCALES;
    case "core":
      return SUPPORTED_LOCALES.filter((locale) => CORE_LOCALES.includes(locale));
    case "rest":
      return SUPPORTED_LOCALES.filter((locale) => REST_LOCALES.includes(locale));
    case "list":
      return SUPPORTED_LOCALES.filter((locale) => selection.locales.includes(locale));
  }
}

/**
 * The locales this build renders, from `MOENOTES_BUILD_LOCALES` (via `buildEnv`, the project boundary for
 * process env). Unset/`all` renders every locale — the behavior local `astro build`/`astro dev` have always had.
 */
export function activeBuildLocales(): readonly AppLocale[] {
  return buildLocaleSet(resolveBuildLocales(buildEnv("MOENOTES_BUILD_LOCALES")));
}
