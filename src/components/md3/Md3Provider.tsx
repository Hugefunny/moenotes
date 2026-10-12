/**
 * Material 3 context for one Astro island: Emotion cache (layered, src/lib/md3/emotion-cache.ts) + the MUI theme.
 *
 * Every hydrated island is its own React root, so each needs the provider; wrap the island's default export with
 * `withMd3`. The provider renders no stylesheet: MUI's CSS variables are emitted once per page by
 * src/components/md3/Md3ThemeVars.astro, and `data-theme` on <html> belongs to the settings pipeline.
 */
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { getMd3EmotionCache } from "@/lib/md3/emotion-cache";
import { buildMd3Theme, type Md3Density } from "@/lib/md3/mui-theme";
import { getSettings, subscribeSettings } from "@/lib/settings/store";
import { defaultSettings } from "@/config/settings";

const themes: Partial<Record<Md3Density, ReturnType<typeof buildMd3Theme>>> = {};
function themeFor(density: Md3Density) {
  return (themes[density] ??= buildMd3Theme(density));
}

const subscribeDensity = (onChange: () => void) => subscribeSettings(onChange);
const getDensity = (): Md3Density => getSettings().density;
const getServerDensity = (): Md3Density => defaultSettings.density;

export function Md3Provider({ children }: { children: ReactNode }) {
  const density = useSyncExternalStore(subscribeDensity, getDensity, getServerDensity);
  return (
    <CacheProvider value={getMd3EmotionCache()}>
      <ThemeProvider theme={themeFor(density)} disableStyleSheetGeneration storageManager={null} colorSchemeNode={null} disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}

/** An island component rendered inside Md3Provider. */
export function withMd3<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Md3Island(props: P) {
    return (
      <Md3Provider>
        <Component {...props} />
      </Md3Provider>
    );
  }
  Md3Island.displayName = `withMd3(${Component.displayName ?? Component.name ?? "Island"})`;
  return Md3Island;
}

/** The MUI CSS variables of the theme (both color schemes), as CSS text for one `<style>` in the page head. */
export function md3ThemeVariablesCss(): string {
  const theme = themeFor("comfortable") as unknown as { generateStyleSheets: () => Array<Record<string, Record<string, string>>> };
  const blocks: string[] = [];
  for (const sheet of theme.generateStyleSheets()) {
    for (const [selector, declarations] of Object.entries(sheet)) {
      const body = Object.entries(declarations).map(([name, value]) => `${name}:${value}`).join(";");
      blocks.push(`${selector}{${body}}`);
    }
  }
  return blocks.join("\n");
}
