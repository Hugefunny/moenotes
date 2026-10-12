/**
 * Emotion cache for the MUI islands.
 *
 * - Every rule goes into `@layer mui` (declared in src/styles/global.css between Tailwind's base and utilities), so
 *   Tailwind utilities on a MUI component win without `!important`.
 * - The key stays `css`: Emotion moves server-rendered `<style data-emotion="css …">` tags out of the island into
 *   <head> before React hydrates, and skips re-inserting rules it finds there.
 * - On the server every render gets its own cache (Astro renders many pages in one process; a shared cache would
 *   mark rules as inserted and leave later pages without them). In the browser one cache serves all islands.
 */
import createCache, { type EmotionCache } from "@emotion/cache";

const LAYER = "mui";

function layered(cache: EmotionCache): EmotionCache {
  const insert = cache.insert;
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    if (!serialized.styles.startsWith("@layer")) {
      serialized = { ...serialized, styles: `@layer ${LAYER}{${serialized.styles}}` };
    }
    return insert(selector, serialized, sheet, shouldCache);
  };
  return cache;
}

let browserCache: EmotionCache | null = null;

export function getMd3EmotionCache(): EmotionCache {
  if (typeof document === "undefined") return layered(createCache({ key: "css" }));
  // Appended (not prepended): the cascade layer order is declared first in <head> (RootLayout), and a `@layer mui`
  // rule before that statement would make `mui` the lowest layer, under Tailwind's preflight.
  browserCache ??= layered(createCache({ key: "css" }));
  return browserCache;
}
