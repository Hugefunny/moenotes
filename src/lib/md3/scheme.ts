/**
 * Material 3 schemes from one seed color (the default brand blue, or a band's MasterBand.mainColorCode chosen in the
 * settings): tonal-spot schemes from material-color-utilities with more of the seed in the neutrals (NEUTRAL_CHROMA),
 * plus the extended groups of src/lib/md3/roles.ts harmonized toward the seed so success / warning / category hues sit
 * in the same family as the theme.
 *
 * The result is cached in browser storage (src/lib/settings/apply-theme.ts) so the head bootstrap script applies it
 * before the first paint; the default seed's schemes are baked into src/styles/md3/tokens.css by
 * scripts/generate-md3-tokens.ts.
 */
import { Blend, DynamicScheme, Hct, SchemeTonalSpot, TonalPalette, Variant, argbFromHex, hexFromArgb } from "@material/material-color-utilities";
import { MD3_BASE_ROLES, MD3_EXTENDED_GROUPS, type Md3Colors, type Md3ExtendedGroup, type Md3Schemes } from "@/lib/md3/roles";

/** The legacy brand accent-deep: the default theme keeps the MoeNotes blue. */
export const MD3_DEFAULT_SEED = "#395EA8";

/** Source hues of the extended groups, harmonized toward the seed. */
export const MD3_EXTENDED_SOURCES: Record<Md3ExtendedGroup, string> = {
  success: "#2E7D32",
  warning: "#C77700",
  category1: "#D3487A", // rose / pink
  category2: "#00A3B4", // cyan
  category3: "#E5A50A", // amber
  category4: "#4E9A4A", // mint / moss
  category5: "#7A5AC8", // violet
};

// Extended groups follow M3 custom-color tones: color / on / container / on-container.
const LIGHT_TONES = [40, 100, 90, 10] as const;
const DARK_TONES = [80, 20, 30, 90] as const;
// A floor so harmonized hues stay recognizably colored even when the source is muted.
const EXTENDED_MIN_CHROMA = 40;

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function extendedGroup(group: Md3ExtendedGroup, seedArgb: number, dark: boolean): Md3Colors {
  const harmonized = Hct.fromInt(Blend.harmonize(argbFromHex(MD3_EXTENDED_SOURCES[group]), seedArgb));
  const palette = TonalPalette.fromHueAndChroma(harmonized.hue, Math.max(harmonized.chroma, EXTENDED_MIN_CHROMA));
  const tones = dark ? DARK_TONES : LIGHT_TONES;
  const cap = group.charAt(0).toUpperCase() + group.slice(1);
  return {
    [group]: hexFromArgb(palette.tone(tones[0])),
    [`on${cap}`]: hexFromArgb(palette.tone(tones[1])),
    [`${group}Container`]: hexFromArgb(palette.tone(tones[2])),
    [`on${cap}Container`]: hexFromArgb(palette.tone(tones[3])),
  };
}

/**
 * Chroma of the surfaces and outlines, and of the secondary roles (selected chips, segmented buttons). Tonal spot keeps
 * them near grey (6, 8 and 16); with these the default blue reads as a night sky rather than grey, and a band's color
 * carries into the page it themes.
 */
const NEUTRAL_CHROMA = 14;
const NEUTRAL_VARIANT_CHROMA = 18;
const SECONDARY_CHROMA = 24;

/** One theme (light or dark) for `seed` (`#RRGGBB`). */
export function md3Colors(seed: string, dark: boolean): Md3Colors {
  const seedArgb = argbFromHex(seed);
  const source = Hct.fromInt(seedArgb);
  const tonalSpot = new SchemeTonalSpot(source, dark, 0);
  const scheme = new DynamicScheme({
    sourceColorHct: source,
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0,
    isDark: dark,
    primaryPalette: tonalSpot.primaryPalette,
    secondaryPalette: TonalPalette.fromHueAndChroma(tonalSpot.secondaryPalette.hue, SECONDARY_CHROMA),
    tertiaryPalette: tonalSpot.tertiaryPalette,
    neutralPalette: TonalPalette.fromHueAndChroma(source.hue, NEUTRAL_CHROMA),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(source.hue, NEUTRAL_VARIANT_CHROMA),
  });
  const colors: Md3Colors = {};
  for (const role of MD3_BASE_ROLES) colors[role] = hexFromArgb(scheme[role]);
  for (const group of MD3_EXTENDED_GROUPS) Object.assign(colors, extendedGroup(group, seedArgb, dark));
  return colors;
}

/** Light and dark schemes for `seed`, or null when it is not a `#RRGGBB` color. */
export function md3Schemes(seed: string): Md3Schemes | null {
  if (!isHexColor(seed)) return null;
  return { light: md3Colors(seed, false), dark: md3Colors(seed, true) };
}
