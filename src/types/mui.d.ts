/**
 * Module augmentation for the Material 3 variants the MoeNotes MUI theme adds (src/lib/md3/mui-theme.ts):
 * M3 button / icon button / card / chip / FAB styles that MUI's Material 2 API does not name, the M3 type scale
 * as Typography variants, and the extended palette colors (tertiary).
 */
import type {} from "@mui/material/styles";
import type {} from "@mui/material/Button";
import type {} from "@mui/material/IconButton";
import type {} from "@mui/material/Card";
import type {} from "@mui/material/Paper";
import type {} from "@mui/material/Chip";
import type {} from "@mui/material/Fab";
import type {} from "@mui/material/Typography";
import type { CSSProperties } from "react";

type Md3TypeScale =
  | "displayLarge" | "displayMedium" | "displaySmall"
  | "headlineLarge" | "headlineMedium" | "headlineSmall"
  | "titleLarge" | "titleMedium" | "titleSmall"
  | "labelLarge" | "labelMedium" | "labelSmall"
  | "bodyLarge" | "bodyMedium" | "bodySmall";

declare module "@mui/material/styles" {
  /** The theme uses CSS variables (`cssVariables` in createTheme): enables `theme.vars` and the provider's props. */
  interface CssThemeVariables {
    enabled: true;
  }
  interface Palette {
    tertiary: Palette["primary"];
  }
  interface PaletteOptions {
    tertiary?: PaletteOptions["primary"];
  }
  interface TypographyVariants extends Record<Md3TypeScale, CSSProperties> {}
  interface TypographyVariantsOptions extends Partial<Record<Md3TypeScale, CSSProperties>> {}
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides extends Record<Md3TypeScale, true> {}
}

declare module "@mui/material/Button" {
  /** M3 common buttons: filled (= contained), tonal, elevated, outlined, text. */
  interface ButtonPropsVariantOverrides {
    filled: true;
    tonal: true;
    elevated: true;
  }
  interface ButtonPropsColorOverrides {
    tertiary: true;
  }
}

// IconButton and Chip forward unknown props to the DOM, so their M3 styles are selected by attributes instead of new
// props: `data-variant="filled|tonal|outlined"` on icon buttons (src/components/md3/IconButton.tsx), and
// `aria-pressed` for selected toggle icon buttons and filter chips.
declare module "@mui/material/IconButton" {
  interface IconButtonPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Paper" {
  interface PaperPropsVariantOverrides {
    filled: true;
    elevated: true;
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsVariantOverrides {
    /** M3 assist / suggestion chip: outlined, surface. */
    assist: true;
    /** M3 filter chip: outlined when off, secondary-container when selected (`aria-pressed`). */
    filter: true;
    /** M3 input chip. */
    input: true;
    /** Compact tonal tag (badges, statuses). */
    tonal: true;
  }
  interface ChipPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Fab" {
  interface FabPropsColorOverrides {
    tertiary: true;
    surface: true;
  }
}
