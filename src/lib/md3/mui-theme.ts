/**
 * The MoeNotes MUI theme: Material 3 on top of MUI v9.
 *
 * Colors: every component style below reads `var(--md-sys-color-*)` (src/styles/md3/colors.css, overridden on <html>
 * by a band seed), so switching light/dark or the band color is pure CSS. The MUI palette itself only needs valid
 * defaults (MUI's own CSS variables are bridged to the M3 roles in src/styles/md3/mui-bridge.css).
 * Color scheme: `[data-theme="dark"]`, owned by the settings pipeline (src/lib/settings/apply-theme.ts); MUI never
 * writes it (no storage manager, `colorSchemeNode` left alone by Md3Provider).
 */
import { createTheme, type CSSObject, type Theme, type ThemeOptions } from "@mui/material/styles";
import { MD3_DEFAULT_SEED, md3Colors } from "@/lib/md3/scheme";

const c = (role: string) => `var(--md-sys-color-${role})`;
/** A role at an opacity, through its `r g b` channel variable. */
const ca = (role: string, opacity: number | string) => `rgb(var(--md-sys-color-${role}-rgb) / ${opacity})`;
const shape = {
  xs: "var(--md-sys-shape-corner-extra-small)",
  sm: "var(--md-sys-shape-corner-small)",
  md: "var(--md-sys-shape-corner-medium)",
  lg: "var(--md-sys-shape-corner-large)",
  xl: "var(--md-sys-shape-corner-extra-large)",
  full: "var(--md-sys-shape-corner-full)",
} as const;
const elevation = (level: 0 | 1 | 2 | 3 | 4 | 5) => `var(--md-sys-elevation-level${level})`;
const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
};
const HOVER = "var(--md-sys-state-hover-opacity)";
const PRESSED = "var(--md-sys-state-pressed-opacity)";
const DISABLED_CONTENT = "var(--md-sys-state-disabled-content-opacity)";
const DISABLED_CONTAINER = "var(--md-sys-state-disabled-container-opacity)";

type Type = { size: string; line: string; tracking: string; weight: number };
const typeScale = (name: string, weight: number): Type => ({
  size: `var(--md-sys-typescale-${name}-size)`,
  line: `var(--md-sys-typescale-${name}-line-height)`,
  tracking: `var(--md-sys-typescale-${name}-tracking)`,
  weight,
});
type FontStyle = { fontFamily: string; fontSize: string; lineHeight: string; letterSpacing: string; fontWeight: number };
const font = (t: Type, family = "var(--md-ref-typeface-plain)"): FontStyle => ({
  fontFamily: family,
  fontSize: t.size,
  lineHeight: t.line,
  letterSpacing: t.tracking,
  fontWeight: t.weight,
});
// Weights as in src/styles/md3/tokens.css: display bold, headlines and the large title semibold.
const TYPE = {
  displayLarge: typeScale("display-large", 700),
  displayMedium: typeScale("display-medium", 700),
  displaySmall: typeScale("display-small", 700),
  headlineLarge: typeScale("headline-large", 600),
  headlineMedium: typeScale("headline-medium", 600),
  headlineSmall: typeScale("headline-small", 600),
  titleLarge: typeScale("title-large", 600),
  titleMedium: typeScale("title-medium", 500),
  titleSmall: typeScale("title-small", 500),
  labelLarge: typeScale("label-large", 500),
  labelMedium: typeScale("label-medium", 500),
  labelSmall: typeScale("label-small", 500),
  bodyLarge: typeScale("body-large", 400),
  bodyMedium: typeScale("body-medium", 400),
  bodySmall: typeScale("body-small", 400),
};
const brand = "var(--md-ref-typeface-brand)";

/**
 * An M3 state layer: a `::before` overlay tinted with the content color. Hover / focus / pressed opacities come from
 * the state tokens; the element needs `position: relative` (MUI ButtonBase has it) and keeps its own background.
 */
const stateLayer = (color = "currentColor"): CSSObject => ({
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    backgroundColor: color,
    opacity: 0,
    pointerEvents: "none",
    transition: `opacity 150ms ${easing.standard}`,
  },
  "@media (hover: hover)": { "&:hover::before": { opacity: HOVER } },
  "&.Mui-focusVisible::before": { opacity: PRESSED },
  "&:active::before": { opacity: PRESSED },
  "&.Mui-disabled::before": { opacity: 0 },
});

/** Disabled filled container: on-surface at 12%, content on-surface at 38% (M3 disabled spec). */
const disabledFilled: CSSObject = {
  "&.Mui-disabled": {
    backgroundColor: ca("on-surface", DISABLED_CONTAINER),
    color: ca("on-surface", DISABLED_CONTENT),
    boxShadow: "none",
  },
};
const disabledText: CSSObject = { "&.Mui-disabled": { color: ca("on-surface", DISABLED_CONTENT) } };

/** Container + content for one palette color of a filled control. */
const filledColor = (color: string) => ({ backgroundColor: c(color), color: c(`on-${color}`) });
const tonalColor = (color: string) => ({ backgroundColor: c(`${color}-container`), color: c(`on-${color}-container`) });

const PALETTE_COLORS = ["primary", "secondary", "tertiary", "error", "success", "warning"] as const;

export type Md3Density = "comfortable" | "compact";

function paletteFor(dark: boolean): NonNullable<ThemeOptions["palette"]> {
  const colors = md3Colors(MD3_DEFAULT_SEED, dark);
  const pair = (main: string, on: string) => ({ main: colors[main]!, contrastText: colors[on]! });
  return {
    mode: dark ? "dark" : "light",
    primary: pair("primary", "onPrimary"),
    secondary: pair("secondary", "onSecondary"),
    tertiary: pair("tertiary", "onTertiary"),
    error: pair("error", "onError"),
    success: pair("success", "onSuccess"),
    warning: pair("warning", "onWarning"),
    info: pair("primary", "onPrimary"),
    background: { default: colors.surface!, paper: colors.surfaceContainerLow! },
    text: { primary: colors.onSurface!, secondary: colors.onSurfaceVariant!, disabled: colors.outline! },
    divider: colors.outlineVariant!,
    action: {
      hoverOpacity: 0.08,
      focusOpacity: 0.1,
      selectedOpacity: 0.12,
      activatedOpacity: 0.12,
      disabledOpacity: 0.38,
    },
  };
}

function components(density: Md3Density): ThemeOptions["components"] {
  const compact = density === "compact";
  return {
    MuiCssBaseline: { styleOverrides: {} },
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        // The ripple is the pressed state layer: tinted with the content color, at the pressed opacity.
        root: { "& .MuiTouchRipple-child": { backgroundColor: "currentColor" }, "& .MuiTouchRipple-rippleVisible": { opacity: PRESSED } },
      },
    },

    // ── Common buttons (M3: 40dp, full shape, label-large) ──
    MuiButton: {
      defaultProps: { variant: "filled", disableElevation: true, size: compact ? "small" : "medium" },
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          minWidth: 48,
          minHeight: 40,
          paddingInline: 24,
          paddingBlock: 0,
          borderRadius: shape.full,
          textTransform: "none",
          gap: 8,
          transition: `box-shadow 200ms ${easing.standard}, background-color 200ms ${easing.standard}, color 200ms ${easing.standard}`,
          ...stateLayer(),
          "& .MuiButton-startIcon, & .MuiButton-endIcon": { margin: 0, "& > *:nth-of-type(1)": { fontSize: 18 } },
          "& .MuiButton-startIcon svg, & .MuiButton-endIcon svg": { width: 18, height: 18 },
        },
        sizeSmall: { minHeight: 32, paddingInline: 16, gap: 6 },
        sizeLarge: { minHeight: 56, paddingInline: 32, ...font(TYPE.titleMedium) },
      },
      variants: [
        // filled / contained
        ...(["filled", "contained"] as const).flatMap((variant) => [
          { props: { variant }, style: { ...filledColor("primary"), boxShadow: "none", "@media (hover: hover)": { "&:hover": { boxShadow: elevation(1) } }, ...disabledFilled } },
          ...PALETTE_COLORS.map((color) => ({ props: { variant, color }, style: filledColor(color) })),
        ]),
        // tonal: M3's tonal button is secondary-container. MUI defaults `color` to "primary", so the per-color
        // overrides skip primary (a primary-container tonal button is not an M3 style).
        { props: { variant: "tonal" }, style: { ...tonalColor("secondary"), "@media (hover: hover)": { "&:hover": { boxShadow: elevation(1) } }, ...disabledFilled } },
        ...PALETTE_COLORS.filter((color) => color !== "primary").map((color) => ({ props: { variant: "tonal" as const, color }, style: tonalColor(color) })),
        // elevated
        { props: { variant: "elevated" }, style: { backgroundColor: c("surface-container-low"), color: c("primary"), boxShadow: elevation(1), "@media (hover: hover)": { "&:hover": { boxShadow: elevation(2) } }, ...disabledFilled } },
        // outlined
        { props: { variant: "outlined" }, style: { paddingInline: 24, border: `1px solid ${c("outline-variant")}`, color: c("primary"), backgroundColor: "transparent", "&:hover": { border: `1px solid ${c("outline-variant")}`, backgroundColor: "transparent" }, "&.Mui-focusVisible": { borderColor: c("outline-variant") }, "&.Mui-disabled": { borderColor: ca("on-surface", DISABLED_CONTAINER), color: ca("on-surface", DISABLED_CONTENT) } } },
        ...PALETTE_COLORS.map((color) => ({ props: { variant: "outlined" as const, color }, style: { color: c(color) } })),
        // text
        { props: { variant: "text" }, style: { paddingInline: 12, color: c("primary"), backgroundColor: "transparent", "&:hover": { backgroundColor: "transparent" }, ...disabledText } },
        ...PALETTE_COLORS.map((color) => ({ props: { variant: "text" as const, color }, style: { color: c(color) } })),
        { props: { color: "inherit" }, style: { color: "inherit" } },
      ],
    },

    // ── Icon buttons (M3: 40dp container, 24dp icon; data-variant selects filled / tonal / outlined) ──
    MuiIconButton: {
      defaultProps: { size: compact ? "small" : "medium" },
      styleOverrides: {
        root: {
          position: "relative",
          width: 40,
          height: 40,
          padding: 8,
          borderRadius: shape.full,
          color: c("on-surface-variant"),
          transition: `background-color 200ms ${easing.standard}, color 200ms ${easing.standard}`,
          "&:hover": { backgroundColor: "transparent" },
          ...stateLayer(),
          "& svg": { width: 24, height: 24 },
          '&[aria-pressed="true"]': { color: c("primary") },
          '&[data-variant="filled"]': { ...filledColor("primary"), '&[aria-pressed="false"]': { backgroundColor: c("surface-container-highest"), color: c("primary") }, ...disabledFilled },
          '&[data-variant="tonal"]': { ...tonalColor("secondary"), '&[aria-pressed="false"]': { backgroundColor: c("surface-container-highest"), color: c("on-surface-variant") }, ...disabledFilled },
          '&[data-variant="outlined"]': { border: `1px solid ${c("outline-variant")}`, '&[aria-pressed="true"]': { border: 0, backgroundColor: c("inverse-surface"), color: c("inverse-on-surface") }, "&.Mui-disabled": { borderColor: ca("on-surface", DISABLED_CONTAINER) } },
          ...disabledText,
        },
        sizeSmall: { width: 32, height: 32, padding: 6, "& svg": { width: 20, height: 20 } },
        sizeLarge: { width: 48, height: 48, padding: 12 },
        colorPrimary: { color: c("primary") },
        colorInherit: { color: "inherit" },
      },
    },

    // ── FAB (M3: surface / primary / secondary / tertiary containers, 56dp, large shape) ──
    MuiFab: {
      defaultProps: { color: "primary" },
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          width: 56,
          height: 56,
          borderRadius: shape.lg,
          textTransform: "none",
          boxShadow: elevation(3),
          ...tonalColor("primary"),
          ...stateLayer(),
          "&:hover": { boxShadow: elevation(4), ...tonalColor("primary") },
          "&:active": { boxShadow: elevation(3) },
          "& svg": { width: 24, height: 24 },
        },
        // MUI's default size is "large", which is the M3 standard FAB (56dp); "small" is the M3 small FAB (40dp).
        sizeSmall: { width: 40, height: 40, minHeight: 40, borderRadius: shape.md },
        sizeMedium: { width: 56, height: 56 },
        // Extended FABs size to their label: `&&` outranks the circular size rules emitted alongside.
        extended: { "&&": { width: "auto", height: 56, minWidth: 80, paddingInline: 16, gap: 12, borderRadius: shape.lg } },
      },
      variants: [
        { props: { size: "large" }, style: { width: 56, height: 56 } },
        { props: { color: "primary" }, style: { ...tonalColor("primary"), "&:hover": tonalColor("primary") } },
        { props: { color: "secondary" }, style: { ...tonalColor("secondary"), "&:hover": tonalColor("secondary") } },
        { props: { color: "tertiary" }, style: { ...tonalColor("tertiary"), "&:hover": tonalColor("tertiary") } },
        { props: { color: "surface" }, style: { backgroundColor: c("surface-container-high"), color: c("primary"), "&:hover": { backgroundColor: c("surface-container-high") } } },
      ],
    },

    // ── Chips (M3: 32dp, small shape, label-large) ──
    MuiChip: {
      defaultProps: { variant: "assist" },
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          height: compact ? 28 : 32,
          borderRadius: shape.sm,
          color: c("on-surface-variant"),
          backgroundColor: "transparent",
          gap: 8,
          paddingInline: 8,
          "& .MuiChip-label": { paddingInline: 8 },
          "& .MuiChip-icon, & .MuiChip-avatar": { marginInline: 0, width: 18, height: 18, color: c("primary") },
          "& .MuiChip-deleteIcon": { margin: 0, width: 18, height: 18, color: c("on-surface-variant"), "&:hover": { color: c("on-surface") } },
          "&.MuiChip-clickable": { ...stateLayer(), "&:hover": { backgroundColor: "transparent" } },
          "&.Mui-disabled": { opacity: 1, color: ca("on-surface", DISABLED_CONTENT), borderColor: ca("on-surface", DISABLED_CONTAINER) },
        },
        sizeSmall: { height: 24, ...font(TYPE.labelMedium), "& .MuiChip-label": { paddingInline: 6 }, paddingInline: 4 },
      },
      variants: [
        { props: { variant: "assist" }, style: { border: `1px solid ${c("outline-variant")}`, color: c("on-surface") } },
        { props: { variant: "outlined" }, style: { border: `1px solid ${c("outline-variant")}`, color: c("on-surface") } },
        {
          props: { variant: "filter" },
          style: {
            border: `1px solid ${c("outline-variant")}`,
            color: c("on-surface-variant"),
            '&[aria-pressed="true"], &[aria-checked="true"], &[aria-selected="true"]': {
              border: "1px solid transparent",
              backgroundColor: c("secondary-container"),
              color: c("on-secondary-container"),
              "&.MuiChip-clickable:hover": { backgroundColor: c("secondary-container") },
            },
          },
        },
        { props: { variant: "input" }, style: { border: `1px solid ${c("outline-variant")}`, color: c("on-surface-variant") } },
        { props: { variant: "filled" }, style: { ...tonalColor("secondary"), "&.MuiChip-clickable:hover": tonalColor("secondary") } },
        { props: { variant: "tonal" }, style: { height: compact ? 22 : 24, borderRadius: shape.sm, ...font(TYPE.labelMedium), ...tonalColor("secondary"), "& .MuiChip-label": { paddingInline: 4 }, paddingInline: 4 } },
        ...PALETTE_COLORS.map((color) => ({ props: { variant: "tonal" as const, color }, style: tonalColor(color) })),
        ...PALETTE_COLORS.map((color) => ({ props: { variant: "filled" as const, color }, style: { ...tonalColor(color), "&.MuiChip-clickable:hover": tonalColor(color) } })),
      ],
    },

    // ── Cards & surfaces (M3: elevated / filled / outlined, medium shape) ──
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none", backgroundColor: c("surface-card"), color: c("on-surface") },
        rounded: { borderRadius: shape.md },
        outlined: { border: `1px solid ${ca("outline-variant", 0.7)}`, backgroundColor: c("surface-card") },
      },
      variants: [
        { props: { variant: "filled" }, style: { backgroundColor: c("surface-container-highest") } },
        { props: { variant: "elevated" }, style: { backgroundColor: c("surface-card"), boxShadow: elevation(1) } },
      ],
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderRadius: shape.md, overflow: "hidden" } },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: { position: "relative", ...stateLayer(c("on-surface")), "& .MuiCardActionArea-focusHighlight": { display: "none" } },
      },
    },
    MuiCardContent: { styleOverrides: { root: { padding: 16, "&:last-child": { paddingBottom: 16 } } } },

    // ── Dialogs (M3: extra-large shape, surface-container-high, headline-small) ──
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: shape.xl,
          backgroundColor: c("surface-container-high"),
          boxShadow: elevation(3),
          margin: 16,
          maxHeight: "calc(100% - 32px)",
        },
        paperFullScreen: { borderRadius: 0, margin: 0, maxHeight: "100%" },
      },
    },
    MuiBackdrop: {
      styleOverrides: { root: { backgroundColor: ca("scrim", 0.32), "&.MuiBackdrop-invisible": { backgroundColor: "transparent" } } },
    },
    MuiDialogTitle: { styleOverrides: { root: { ...font(TYPE.headlineSmall, brand), color: c("on-surface"), padding: "24px 24px 16px" } } },
    MuiDialogContent: { styleOverrides: { root: { ...font(TYPE.bodyMedium), color: c("on-surface-variant"), padding: "0 24px 24px" } } },
    MuiDialogContentText: { styleOverrides: { root: { color: c("on-surface-variant") } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "0 24px 24px", gap: 8, "& > :not(style) ~ :not(style)": { marginLeft: 0 } } } },

    // ── Menus, popovers, tooltips ──
    MuiPopover: {
      styleOverrides: { paper: { borderRadius: shape.xs, backgroundColor: c("surface-container"), boxShadow: elevation(2) } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: shape.xs, backgroundColor: c("surface-container"), boxShadow: elevation(2), minWidth: 112 },
        list: { paddingBlock: 8 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          minHeight: compact ? 40 : 48,
          paddingInline: 12,
          gap: 12,
          color: c("on-surface"),
          "&:hover": { backgroundColor: "transparent" },
          ...stateLayer(),
          "&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": { backgroundColor: c("secondary-container"), color: c("on-secondary-container") },
          "&.Mui-focusVisible": { backgroundColor: "transparent" },
          "& .MuiListItemIcon-root": { minWidth: 0, color: c("on-surface-variant") },
          "& svg": { width: 24, height: 24 },
        },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 400 },
      styleOverrides: {
        tooltip: { ...font(TYPE.bodySmall), backgroundColor: c("inverse-surface"), color: c("inverse-on-surface"), borderRadius: shape.xs, padding: "4px 8px", maxWidth: 320 },
      },
    },

    // ── Lists & navigation ──
    MuiList: { styleOverrides: { root: { paddingBlock: 8 } } },
    MuiListSubheader: {
      styleOverrides: { root: { ...font(TYPE.titleSmall), backgroundColor: "transparent", color: c("on-surface-variant"), lineHeight: "48px", paddingInline: 16 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          position: "relative",
          minHeight: compact ? 44 : 56,
          paddingInline: 16,
          gap: 16,
          color: c("on-surface"),
          "&:hover": { backgroundColor: "transparent" },
          ...stateLayer(),
          "&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": { backgroundColor: c("secondary-container"), color: c("on-secondary-container") },
          "&.Mui-focusVisible": { backgroundColor: "transparent" },
        },
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 0, color: c("on-surface-variant"), "& svg": { width: 24, height: 24 } } } },
    MuiListItemText: {
      styleOverrides: {
        root: { marginBlock: 0 },
        primary: { ...font(TYPE.bodyLarge), color: "inherit" },
        secondary: { ...font(TYPE.bodyMedium), color: c("on-surface-variant") },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: c("outline-variant") } } },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: c("surface-container-low"), color: c("on-surface"), border: 0, boxShadow: "none" },
        modal: { "& .MuiDrawer-paper": { boxShadow: elevation(1) } },
        anchorLeft: { "&.MuiDrawer-modal .MuiDrawer-paper, & > .MuiDrawer-paper": { borderRadius: `0 ${shape.lg} ${shape.lg} 0` } },
        anchorRight: { "& > .MuiDrawer-paper": { borderRadius: `${shape.lg} 0 0 ${shape.lg}` } },
        anchorBottom: { "& > .MuiDrawer-paper": { borderRadius: `${shape.xl} ${shape.xl} 0 0` } },
        docked: { "& > .MuiDrawer-paper": { borderRadius: 0 } },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: {
        root: { backgroundColor: c("surface"), color: c("on-surface"), backgroundImage: "none", boxShadow: "none", transition: `background-color 200ms ${easing.standard}` },
        colorDefault: { backgroundColor: c("surface"), color: c("on-surface") },
      },
    },
    MuiToolbar: { styleOverrides: { root: { minHeight: 64, gap: 4, "@media (min-width: 600px)": { minHeight: 64 } } } },
    MuiBottomNavigation: { styleOverrides: { root: { height: 80, backgroundColor: c("surface-container") } } },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: { ...font(TYPE.labelMedium), color: c("on-surface-variant"), gap: 4, paddingTop: 12, "&.Mui-selected": { color: c("on-surface") } },
        label: { ...font(TYPE.labelMedium), "&.Mui-selected": { fontSize: "var(--md-sys-typescale-label-medium-size)" } },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 48, borderBottom: `1px solid ${c("surface-container-highest")}` },
        indicator: { height: 3, borderRadius: "3px 3px 0 0", backgroundColor: c("primary") },
        scrollButtons: { color: c("on-surface-variant"), "&.Mui-disabled": { opacity: 0.38 } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          ...font(TYPE.titleSmall),
          position: "relative",
          minHeight: 48,
          minWidth: 0,
          paddingInline: 16,
          textTransform: "none",
          color: c("on-surface-variant"),
          ...stateLayer(),
          "&.Mui-selected": { color: c("primary") },
          "& svg": { width: 24, height: 24 },
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: { root: { ...font(TYPE.bodyMedium), color: c("on-surface-variant") }, separator: { marginInline: 4, color: c("outline") } },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: { root: { color: c("primary"), textDecorationColor: ca("primary", 0.4) } },
    },
    MuiPagination: { styleOverrides: { ul: { gap: 4 } } },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          minWidth: 40,
          height: 40,
          borderRadius: shape.full,
          color: c("on-surface-variant"),
          "&:hover": { backgroundColor: "transparent" },
          ...stateLayer(),
          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: c("secondary-container"), color: c("on-secondary-container") },
        },
      },
    },

    // ── Selection controls ──
    MuiSwitch: {
      styleOverrides: {
        root: { width: 52 + 24, height: 32 + 24, padding: 12 },
        switchBase: {
          padding: 16,
          top: 4,
          left: 4,
          color: c("outline"),
          "&:hover": { backgroundColor: ca("on-surface", HOVER) },
          "&.Mui-checked": {
            transform: "translateX(20px)",
            color: c("on-primary"),
            "&:hover": { backgroundColor: ca("primary", HOVER) },
            "& + .MuiSwitch-track": { backgroundColor: c("primary"), borderColor: c("primary"), opacity: 1 },
            "& .MuiSwitch-thumb": { width: 24, height: 24, margin: -4 },
          },
          "&.Mui-disabled + .MuiSwitch-track": { opacity: DISABLED_CONTAINER },
          "&.Mui-disabled .MuiSwitch-thumb": { opacity: DISABLED_CONTENT },
          "&.Mui-focusVisible": { backgroundColor: ca("on-surface", PRESSED) },
          "&:active .MuiSwitch-thumb": { width: 28, height: 28, margin: -6 },
        },
        thumb: { width: 16, height: 16, boxShadow: "none", transition: `width 150ms ${easing.standard}, height 150ms ${easing.standard}, margin 150ms ${easing.standard}` },
        track: { borderRadius: shape.full, border: `2px solid ${c("outline")}`, backgroundColor: c("surface-container-highest"), opacity: 1, boxSizing: "border-box" },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: c("on-surface-variant"),
          "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: c("primary") },
          "&.Mui-disabled": { color: ca("on-surface", DISABLED_CONTENT) },
          "&:hover": { backgroundColor: ca("on-surface", HOVER) },
          "&.Mui-checked:hover": { backgroundColor: ca("primary", HOVER) },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: c("on-surface-variant"),
          "&.Mui-checked": { color: c("primary") },
          "&.Mui-disabled": { color: ca("on-surface", DISABLED_CONTENT) },
          "&:hover": { backgroundColor: ca("on-surface", HOVER) },
          "&.Mui-checked:hover": { backgroundColor: ca("primary", HOVER) },
        },
      },
    },
    MuiFormControlLabel: { styleOverrides: { label: { ...font(TYPE.bodyMedium), color: c("on-surface") } } },
    MuiSlider: {
      styleOverrides: {
        root: { color: c("primary"), height: 4 },
        rail: { backgroundColor: c("secondary-container"), opacity: 1 },
        track: { border: 0 },
        thumb: { width: 20, height: 20, backgroundColor: c("primary"), "&:hover, &.Mui-focusVisible": { boxShadow: `0 0 0 8px ${ca("primary", HOVER)}` }, "&.Mui-active": { boxShadow: `0 0 0 10px ${ca("primary", PRESSED)}` } },
        valueLabel: { ...font(TYPE.labelLarge), backgroundColor: c("inverse-surface"), color: c("inverse-on-surface"), borderRadius: shape.full },
        mark: { backgroundColor: c("on-secondary-container"), width: 4, height: 4, borderRadius: "50%" },
        markActive: { backgroundColor: c("on-primary") },
      },
    },
    // Segmented buttons (M3): outlined pill group, secondary-container when selected.
    MuiToggleButtonGroup: {
      styleOverrides: {
        // MoeSekai's segmented buttons: a surface-container-high trough, the selected segment filled with the seed.
        root: { borderRadius: shape.md, gap: 2, padding: 4, backgroundColor: c("surface-container-high") },
        grouped: {
          "&&": { margin: 0, border: 0, borderRadius: shape.sm },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          ...font(TYPE.labelLarge),
          position: "relative",
          minHeight: compact ? 28 : 32,
          paddingInline: compact ? 10 : 12,
          gap: 6,
          textTransform: "none",
          border: 0,
          borderRadius: shape.sm,
          color: c("on-surface-variant"),
          "&:hover": { backgroundColor: "transparent", color: c("on-surface") },
          ...stateLayer(),
          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: c("primary-container"), color: c("on-primary-container") },
          "&.Mui-disabled": { color: ca("on-surface", DISABLED_CONTENT), borderColor: ca("on-surface", DISABLED_CONTAINER) },
          "& svg": { width: 18, height: 18 },
        },
        sizeSmall: { minHeight: 28, paddingInline: 10 },
      },
    },

    // ── Text fields (M3 outlined by default; filled available) ──
    MuiTextField: { defaultProps: { variant: "outlined", size: compact ? "small" : "medium" } },
    MuiFormControl: { defaultProps: { size: compact ? "small" : "medium" } },
    MuiInputBase: {
      styleOverrides: {
        root: { ...font(TYPE.bodyLarge), color: c("on-surface"), "&.Mui-disabled": { color: ca("on-surface", DISABLED_CONTENT) } },
        input: { "&::placeholder": { color: c("on-surface-variant"), opacity: 1 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: shape.xs,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: c("outline") },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c("on-surface") },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c("primary"), borderWidth: 2 },
          "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: c("error") },
          "&.Mui-disabled .MuiOutlinedInput-notchedOutline": { borderColor: ca("on-surface", DISABLED_CONTAINER) },
          "& .MuiInputAdornment-root": { color: c("on-surface-variant") },
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          borderRadius: `${shape.xs} ${shape.xs} 0 0`,
          backgroundColor: c("surface-container-highest"),
          "&:hover": { backgroundColor: c("surface-container-highest") },
          "&.Mui-focused": { backgroundColor: c("surface-container-highest") },
          "&::before": { borderBottomColor: c("on-surface-variant") },
          "&::after": { borderBottomColor: c("primary") },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { ...font(TYPE.bodyLarge), color: c("on-surface-variant"), "&.Mui-focused": { color: c("primary") }, "&.Mui-error": { color: c("error") } },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { ...font(TYPE.bodySmall), color: c("on-surface-variant"), "&.Mui-error": { color: c("error") } } } },
    MuiSelect: { defaultProps: { MenuProps: { slotProps: { paper: { elevation: 0 } } } } },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { borderRadius: shape.xs, backgroundColor: c("surface-container"), boxShadow: elevation(2) },
        option: { ...font(TYPE.bodyLarge), minHeight: 48, '&[aria-selected="true"]': { backgroundColor: `${c("secondary-container")} !important` } },
      },
    },

    // ── Feedback ──
    MuiSnackbarContent: {
      styleOverrides: {
        root: { ...font(TYPE.bodyMedium), backgroundColor: c("inverse-surface"), color: c("inverse-on-surface"), borderRadius: shape.xs, boxShadow: elevation(3), padding: "4px 16px" },
        action: { color: c("inverse-primary") },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { ...font(TYPE.bodyMedium), borderRadius: shape.md, alignItems: "flex-start" },
        standard: {
          '&.MuiAlert-colorInfo': { ...tonalColor("primary"), "& .MuiAlert-icon": { color: c("primary") } },
          '&.MuiAlert-colorSuccess': { ...tonalColor("success"), "& .MuiAlert-icon": { color: c("success") } },
          '&.MuiAlert-colorWarning': { ...tonalColor("warning"), "& .MuiAlert-icon": { color: c("warning") } },
          '&.MuiAlert-colorError': { ...tonalColor("error"), "& .MuiAlert-icon": { color: c("error") } },
        },
      },
    },
    MuiAlertTitle: { styleOverrides: { root: { ...font(TYPE.titleSmall), marginBottom: 2 } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 4, borderRadius: shape.full, backgroundColor: c("secondary-container") },
        bar: { borderRadius: shape.full, backgroundColor: c("primary") },
      },
    },
    MuiCircularProgress: { styleOverrides: { root: { color: c("primary") }, circle: { strokeLinecap: "round" } } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: c("surface-container-highest") }, rounded: { borderRadius: shape.md } } },
    MuiBadge: {
      styleOverrides: {
        badge: { ...font(TYPE.labelSmall), minWidth: 16, height: 16, padding: "0 4px", borderRadius: shape.full },
        colorError: { backgroundColor: c("error"), color: c("on-error") },
        colorPrimary: { backgroundColor: c("primary"), color: c("on-primary") },
        dot: { minWidth: 6, width: 6, height: 6, padding: 0 },
      },
    },
    MuiAvatar: { styleOverrides: { colorDefault: { backgroundColor: c("primary-container"), color: c("on-primary-container") } } },

    // ── Data tables ──
    MuiTableContainer: { styleOverrides: { root: { borderRadius: shape.md } } },
    MuiTableCell: {
      styleOverrides: {
        root: { ...font(TYPE.bodyMedium), borderBottomColor: c("outline-variant"), color: c("on-surface"), paddingBlock: compact ? 6 : 12 },
        head: { ...font(TYPE.titleSmall), color: c("on-surface-variant"), backgroundColor: c("surface-container") },
        stickyHeader: { backgroundColor: c("surface-container") },
      },
    },
    MuiTableRow: {
      styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: ca("on-surface", HOVER) }, "&.Mui-selected": { backgroundColor: c("secondary-container") } } },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: { root: { backgroundColor: "transparent", "&::before": { backgroundColor: c("outline-variant") } } },
    },
    MuiAccordionSummary: { styleOverrides: { root: { ...font(TYPE.titleMedium), position: "relative", minHeight: 56, ...stateLayer() } } },
  };
}

function typography(): ThemeOptions["typography"] {
  const v = font;
  return {
    fontFamily: "var(--md-ref-typeface-plain)",
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 500,
    displayLarge: v(TYPE.displayLarge, brand),
    displayMedium: v(TYPE.displayMedium, brand),
    displaySmall: v(TYPE.displaySmall, brand),
    headlineLarge: v(TYPE.headlineLarge, brand),
    headlineMedium: v(TYPE.headlineMedium, brand),
    headlineSmall: v(TYPE.headlineSmall, brand),
    titleLarge: v(TYPE.titleLarge, brand),
    titleMedium: v(TYPE.titleMedium),
    titleSmall: v(TYPE.titleSmall),
    labelLarge: v(TYPE.labelLarge),
    labelMedium: v(TYPE.labelMedium),
    labelSmall: v(TYPE.labelSmall),
    bodyLarge: v(TYPE.bodyLarge),
    bodyMedium: v(TYPE.bodyMedium),
    bodySmall: v(TYPE.bodySmall),
    // MUI's Material 2 names map onto the M3 scale.
    h1: v(TYPE.displayLarge, brand),
    h2: v(TYPE.displayMedium, brand),
    h3: v(TYPE.headlineLarge, brand),
    h4: v(TYPE.headlineMedium, brand),
    h5: v(TYPE.headlineSmall, brand),
    h6: v(TYPE.titleLarge, brand),
    subtitle1: v(TYPE.titleMedium),
    subtitle2: v(TYPE.titleSmall),
    body1: v(TYPE.bodyLarge),
    body2: v(TYPE.bodyMedium),
    caption: v(TYPE.bodySmall),
    button: { ...v(TYPE.labelLarge), textTransform: "none" },
    overline: v(TYPE.labelSmall),
  };
}

const typographyVariantMapping = {
  displayLarge: "h1",
  displayMedium: "h1",
  displaySmall: "h1",
  headlineLarge: "h2",
  headlineMedium: "h2",
  headlineSmall: "h2",
  titleLarge: "h3",
  titleMedium: "h3",
  titleSmall: "h4",
  labelLarge: "span",
  labelMedium: "span",
  labelSmall: "span",
  bodyLarge: "p",
  bodyMedium: "p",
  bodySmall: "p",
};

export function buildMd3Theme(density: Md3Density = "comfortable"): Theme {
  const shadows = ["none", ...Array.from({ length: 24 }, (_, i) => elevation(Math.min(5, Math.ceil((i + 1) / 4)) as 1 | 2 | 3 | 4 | 5))] as Theme["shadows"];
  return createTheme({
    cssVariables: { colorSchemeSelector: '[data-theme="%s"]', cssVarPrefix: "mui", disableCssColorScheme: true },
    colorSchemes: { light: { palette: paletteFor(false) }, dark: { palette: paletteFor(true) } },
    defaultColorScheme: "light",
    shape: { borderRadius: 12 },
    shadows,
    typography: typography(),
    transitions: {
      easing: {
        easeInOut: easing.standard,
        easeOut: easing.emphasizedDecelerate,
        easeIn: easing.emphasizedAccelerate,
        sharp: easing.standard,
      },
      duration: { shortest: 100, shorter: 150, short: 200, standard: 300, complex: 400, enteringScreen: 400, leavingScreen: 200 },
    },
    motion: { reducedMotion: "system" },
    focusVisible: { outlineColor: "var(--md-sys-color-secondary)", outlineWidth: 3, outlineOffset: 2 },
    zIndex: { mobileStepper: 1000, fab: 1050, speedDial: 1050, appBar: 1100, drawer: 1200, modal: 1300, snackbar: 1400, tooltip: 1500 },
    components: {
      ...components(density),
      MuiTypography: { defaultProps: { variantMapping: typographyVariantMapping } },
    },
  });
}
