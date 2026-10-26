import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { storageKeys } from "../src/config/storage";
import { accentCache, ACCENT_CACHE_VERSION } from "../src/lib/settings/accent";
import { buildNavGroupBootstrapScript, buildThemeBootstrapScript } from "../src/lib/settings/apply-theme";
import { contrastRatio, MD3_ROLES, roleToKebab } from "../src/lib/md3/roles";
import { MD3_DEFAULT_SEED, md3Schemes } from "../src/lib/md3/scheme";
import { buildMd3ColorsCss } from "../src/lib/md3/tokens-css";
import { normalizeSettings, parseSettingsJson } from "../src/lib/settings/schema";

describe("settings", () => {
  test("settings stored by an older version read with defaults for the new fields", () => {
    expect(parseSettingsJson(JSON.stringify({ locale: "ja-JP", colorScheme: "dark", gameServer: "jp" }))).toEqual({
      locale: "ja-JP", colorScheme: "dark", gameServer: "jp", accentColor: "default", density: "comfortable",
    });
  });

  test("accent colors and density are checked", () => {
    expect(normalizeSettings({ accentColor: "#3388bb", density: "compact" })).toMatchObject({ accentColor: "#3388BB", density: "compact" });
    expect(normalizeSettings({ accentColor: "red", density: "tiny" })).toMatchObject({ accentColor: "default", density: "comfortable" });
    expect(normalizeSettings({ accentColor: "#38b" })).toMatchObject({ accentColor: "default" });
  });
});

describe("material 3 schemes from band colors", () => {
  // MasterBand.mainColorCode of the five bands (TW, 2026-10), the default seed, plus a very light and a very dark color.
  const seeds = [MD3_DEFAULT_SEED, "#3388BB", "#881144", "#FF7788", "#AA22EE", "#FFAA33", "#FFFF00", "#101010"];
  // Content / container pairs that carry text: M3 guarantees 4.5:1 for each at standard contrast.
  const textPairs = [
    ["onPrimary", "primary"],
    ["onPrimaryContainer", "primaryContainer"],
    ["onSecondaryContainer", "secondaryContainer"],
    ["onTertiaryContainer", "tertiaryContainer"],
    ["onErrorContainer", "errorContainer"],
    ["onSurface", "surface"],
    ["onSurface", "surfaceContainerHighest"],
    ["onSurfaceVariant", "surfaceContainerHighest"],
    ["inverseOnSurface", "inverseSurface"],
    ["onSuccessContainer", "successContainer"],
    ["onWarningContainer", "warningContainer"],
    ["onCategory1Container", "category1Container"],
    ["onCategory5Container", "category5Container"],
    ["primary", "surfaceContainerLow"],
    ["error", "surface"],
    ["success", "surface"],
  ] as const;

  test("every scheme carries every role as a hex color", () => {
    for (const seed of seeds) {
      const schemes = md3Schemes(seed)!;
      for (const theme of ["light", "dark"] as const) {
        for (const role of MD3_ROLES) expect(schemes[theme][role]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test("text stays readable on its container in both themes", () => {
    for (const seed of seeds) {
      const schemes = md3Schemes(seed)!;
      for (const theme of ["light", "dark"] as const) {
        const colors = schemes[theme];
        for (const [content, container] of textPairs) {
          expect(contrastRatio(colors[content]!, colors[container]!)).toBeGreaterThanOrEqual(4.5);
        }
        // Outlines of controls and focus indicators: 3:1 against the surface.
        expect(contrastRatio(colors.outline!, colors.surface!)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("rejects what is not a color", () => {
    expect(md3Schemes("default")).toBeNull();
    expect(md3Schemes("#12345")).toBeNull();
    expect(accentCache("red")).toBeNull();
  });

  test("the cache the bootstrap script reads carries its version and both schemes", () => {
    const cache = accentCache("#3388BB")!;
    expect(cache.version).toBe(ACCENT_CACHE_VERSION);
    expect(cache.color).toBe("#3388BB");
    expect(cache.light.primary).not.toBe(cache.dark.primary);
    const script = buildThemeBootstrapScript();
    expect(script).toContain(`cached.version === ${ACCENT_CACHE_VERSION}`);
    for (const role of MD3_ROLES) expect(script).toContain(`"${role}"`);
    expect(() => new Function(script)).not.toThrow();
  });

  test("the committed default scheme stylesheet is the generator's output", () => {
    const committed = readFileSync(new URL("../src/styles/md3/colors.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildMd3ColorsCss());
    for (const role of MD3_ROLES) expect(committed).toContain(`--md-sys-color-${roleToKebab(role)}:`);
  });
});

describe("navigation drawer held back until stored folds are applied", () => {
  function runBootstrap(stored: string | null) {
    const dataset: Record<string, string> = {};
    let timer: (() => void) | null = null;
    runInNewContext(buildNavGroupBootstrapScript(), {
      localStorage: { getItem: (key: string) => (key === storageKeys.navGroups ? stored : null) },
      document: { documentElement: { dataset } },
      setTimeout: (callback: () => void) => {
        timer = callback;
        return 1;
      },
    });
    return { dataset, fireTimeout: () => timer?.() };
  }

  test("a folded group hides the drawer, and the timeout reveals it if React never does", () => {
    const drawer = runBootstrap(JSON.stringify({ database: true, musics: false }));
    expect(drawer.dataset.navGroups).toBe("pending");
    drawer.fireTimeout();
    expect(drawer.dataset.navGroups).toBeUndefined();
  });

  test("nothing folded leaves the server markup untouched", () => {
    for (const stored of [null, "", "not json", "[]", JSON.stringify({ database: false }), JSON.stringify({ tools: "true" })]) {
      expect(runBootstrap(stored).dataset.navGroups).toBeUndefined();
    }
  });

  test("the script is valid JavaScript", () => {
    expect(() => new Function(buildNavGroupBootstrapScript())).not.toThrow();
    expect(buildNavGroupBootstrapScript()).toContain(JSON.stringify(storageKeys.navGroups));
  });
});
