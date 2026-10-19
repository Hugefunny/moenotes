/**
 * Material 3 color roles: the names every scheme carries, their CSS variables, and the extended roles MoeNotes adds
 * (success, warning and five category hues for tags and charts). Dependency-free, so the head bootstrap script and
 * tests can use it without pulling in material-color-utilities.
 */

/** The M3 baseline sys color roles (material-color-utilities `MaterialDynamicColors`, 2021 spec). */
export const MD3_BASE_ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceTint",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "outline",
  "outlineVariant",
  "scrim",
  "shadow",
] as const;

/** Category hues for tags and charts, harmonized toward the seed. */
export const MD3_CATEGORY_GROUPS = ["category1", "category2", "category3", "category4", "category5"] as const;

export type Md3CategoryGroup = (typeof MD3_CATEGORY_GROUPS)[number];

/** Extended color groups (M3 "custom colors"): color / on / container / on-container. Status colors keep fixed hues. */
export const MD3_EXTENDED_GROUPS = ["success", "warning", ...MD3_CATEGORY_GROUPS] as const;

export const MD3_EXTENDED_ROLES = MD3_EXTENDED_GROUPS.flatMap((group) => {
  const cap = group.charAt(0).toUpperCase() + group.slice(1);
  return [group, `on${cap}`, `${group}Container`, `on${cap}Container`];
});

/**
 * Beyond M3: the card surface (white on the light page, a step above it in dark mode) and the highlighter ink under
 * page titles (`.mn-brand-mark`), the seed thinned until on-surface text over it reads.
 */
export const MD3_SURFACE_ROLES = ["surfaceCard", "brandMark"] as const;

export const MD3_ROLES: readonly string[] = [...MD3_BASE_ROLES, ...MD3_EXTENDED_ROLES, ...MD3_SURFACE_ROLES];

export type Md3BaseRole = (typeof MD3_BASE_ROLES)[number];

/** One theme's colors: role name (camelCase) → `#rrggbb`. */
export type Md3Colors = Record<string, string>;

export interface Md3Schemes {
  light: Md3Colors;
  dark: Md3Colors;
}

/** `surfaceContainerLow` → `surface-container-low`; digits stay attached (`category1` → `category1`). */
export function roleToKebab(role: string): string {
  return role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function roleCssVariable(role: string): string {
  return `--md-sys-color-${roleToKebab(role)}`;
}

/** Every role also gets an `r g b` channel variable (`--md-sys-color-primary-rgb`), for translucent fills: MUI's
 * `alpha()` and `rgb(var(--…-rgb) / 0.32)` scrims. */
export function roleChannelVariable(role: string): string {
  return `${roleCssVariable(role)}-rgb`;
}

/** `#rrggbb` → `r g b`, or null. */
export function hexChannel(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/** CSS declarations (`--md-sys-color-*: #hex;`, plus channel variables) for one theme's colors. */
export function colorDeclarations(colors: Md3Colors): Array<readonly [string, string]> {
  const declarations: Array<readonly [string, string]> = [];
  for (const role of MD3_ROLES) {
    const hex = colors[role];
    if (hex) declarations.push([roleCssVariable(role), hex]);
  }
  for (const role of MD3_ROLES) {
    const channel = colors[role] ? hexChannel(colors[role]!) : null;
    if (channel) declarations.push([roleChannelVariable(role), channel]);
  }
  return declarations;
}

/** WCAG relative luminance contrast of two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channel = hexChannel(hex);
    if (!channel) return 0;
    const [r, g, bl] = channel.split(" ").map((c) => {
      const s = Number(c) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
