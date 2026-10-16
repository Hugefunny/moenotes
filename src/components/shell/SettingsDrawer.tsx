import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { Icon } from "@/components/shared/icons";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES, flagIconSrc } from "@/config/locales";
import { flagIconSrc as serverFlagIconSrc } from "@/config/servers";
import { DEFAULT_ACCENT } from "@/config/settings";
import { switchLocalePath } from "@/i18n/routing";
import { t } from "@/i18n";
import {
  CACHE_CATEGORIES,
  clearAllCaches,
  clearCacheCategory,
  getCacheOverview,
  isBrowserCacheAvailable,
  type CacheCategory,
  type CacheOverview,
} from "@/lib/cache/usage";
import { formatBytes } from "@/lib/format/bytes";
import { defaultGameServer } from "@/lib/game-api/server";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { MD3_DEFAULT_SEED } from "@/lib/md3/scheme";
import { getForceJapaneseTitles, setForceJapaneseTitles, SONG_TITLE_PREFERENCE_EVENT } from "@/lib/music/title-preference";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { DENSITIES, GAME_SERVER_SETTINGS } from "@/lib/settings/schema";
import { useSettings } from "@/lib/settings/use-settings";
import { useSpoiler } from "@/lib/settings/spoiler";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
  /** Band colors the theme color choice offers (build time, src/lib/masterdata/build-settings.ts). */
  bands?: ThemeBandColor[];
}

type SettingsTab = "general" | "data";
const SETTINGS_TABS: readonly SettingsTab[] = ["general", "data"];

/** Settings as a Material 3 modal side sheet (bottom sheet on phones), with General and Data tabs. */
function SettingsDrawer({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const [tab, setTab] = useState<SettingsTab>("general");
  const id = useId();
  const titleId = `${id}-title`;
  const isTop = useOverlayLayer(`settings-${id}`, isOpen, close);

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={(_, reason) => {
        if (reason === "escapeKeyDown" && !isTop()) return;
        close();
      }}
      slotProps={{ paper: { role: "dialog", "aria-labelledby": titleId, sx: { width: "min(100vw, 26rem)", borderRadius: { xs: 0, sm: "var(--md-sys-shape-corner-large) 0 0 var(--md-sys-shape-corner-large)" } } } }}
    >
      <div className="flex shrink-0 items-center gap-2 py-3 pl-6 pr-3">
        <h2 id={titleId} className="min-w-0 flex-1 truncate font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "settings.title")}</h2>
        <IconButton aria-label={t(locale, "actions.close")} onClick={close}>
          <Icon name="close" />
        </IconButton>
      </div>
      <Tabs value={tab} onChange={(_, value: SettingsTab) => setTab(value)} variant="fullWidth" aria-label={t(locale, "settings.tabs.label")}>
        {SETTINGS_TABS.map((key) => (
          <Tab key={key} value={key} id={`${id}-${key}-tab`} aria-controls={`${id}-panel`} label={t(locale, `settings.tabs.${key}`)} />
        ))}
      </Tabs>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {tab === "general" ? <GeneralSettings locale={locale} pathname={pathname} bands={bands} /> : <DataSettings locale={locale} />}
      </div>
    </Drawer>
  );
}

function GeneralSettings({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { settings, updateSettings } = useSettings();
  const update = (patch: Partial<AppSettings>) => updateSettings(patch);
  const flag = (src: string) => <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-5 w-5 shrink-0 rounded-full" />;
  const serverFlag = (value: AppSettings["gameServer"]) => flag(serverFlagIconSrc(value === "auto" ? defaultGameServer(locale) : value));
  const serverLabel = (value: AppSettings["gameServer"]) =>
    value === "auto"
      ? t(locale, "settings.gameServerAuto", { server: t(locale, `gameServer.names.${defaultGameServer(locale)}`) })
      : t(locale, `gameServer.names.${value}`);

  return (
    <div className="space-y-7">
      <Section title={t(locale, "settings.language")}>
        <TextField
          select
          fullWidth
          value={locale}
          onChange={(event) => {
            const next = event.target.value as AppLocale;
            if (next !== locale) window.location.href = switchLocalePath(pathname, next);
          }}
          slotProps={{ select: { renderValue: (value) => <span className="flex items-center gap-3">{flag(flagIconSrc(value as AppLocale))}{LOCALE_LABELS[value as AppLocale]}</span> }, htmlInput: { "aria-label": t(locale, "settings.language") } }}
        >
          {SUPPORTED_LOCALES.map((item) => (
            <MenuItem key={item} value={item} lang={item}>
              <ListItemIcon>{flag(flagIconSrc(item))}</ListItemIcon>
              {LOCALE_LABELS[item]}
            </MenuItem>
          ))}
        </TextField>
        <p className="mt-2 text-body-small text-on-surface-variant">{t(locale, "settings.machineTranslationNotice")}</p>
      </Section>

      <Section title={t(locale, "settings.colorScheme")}>
        <Segmented
          label={t(locale, "settings.colorScheme")}
          value={settings.colorScheme}
          options={["system", "light", "dark"]}
          optionLabel={(value) => t(locale, `settings.options.${value}`)}
          onChange={(value) => update({ colorScheme: value as AppSettings["colorScheme"] })}
        />
      </Section>

      <Section title={t(locale, "settings.accent.title")}>
        <AccentPicker locale={locale} bands={bands} value={settings.accentColor} onChange={(accentColor) => update({ accentColor })} />
      </Section>

      <Section title={t(locale, "settings.density.title")}>
        <Segmented
          label={t(locale, "settings.density.title")}
          value={settings.density}
          options={[...DENSITIES]}
          optionLabel={(value) => t(locale, `settings.density.${value}`)}
          onChange={(value) => update({ density: value as AppSettings["density"] })}
        />
      </Section>

      <Section title={t(locale, "settings.songTitles.title")}>
        <JapaneseTitlesToggle locale={locale} />
      </Section>

      <Section title={t(locale, "settings.spoiler.title")}>
        <SpoilerToggle locale={locale} />
      </Section>

      <Section title={t(locale, "settings.gameServer")}>
        <TextField
          select
          fullWidth
          value={settings.gameServer}
          onChange={(event) => update({ gameServer: event.target.value as AppSettings["gameServer"] })}
          slotProps={{ select: { renderValue: (value) => <span className="flex items-center gap-3">{serverFlag(value as AppSettings["gameServer"])}{serverLabel(value as AppSettings["gameServer"])}</span> }, htmlInput: { "aria-label": t(locale, "settings.gameServer") } }}
        >
          {GAME_SERVER_SETTINGS.map((item) => (
            <MenuItem key={item} value={item}>
              <ListItemIcon>{serverFlag(item)}</ListItemIcon>
              {serverLabel(item)}
            </MenuItem>
          ))}
        </TextField>
      </Section>
    </div>
  );
}

/** What the browser keeps for the site, by what the files are, each kind clearable. */
function DataSettings({ locale }: { locale: AppLocale }) {
  const [available] = useState(isBrowserCacheAvailable);
  const [overview, setOverview] = useState<CacheOverview | null>(null);
  const [busy, setBusy] = useState<CacheCategory | "all" | null>(null);
  // The category under the pointer, on the bar or in the list: its segment and its row stand out together.
  const [active, setActive] = useState<CacheCategory | null>(null);

  const refresh = useCallback(() => getCacheOverview().then(setOverview), []);
  useEffect(() => {
    if (available) void refresh();
  }, [available, refresh]);

  const clear = async (target: CacheCategory | "all") => {
    setBusy(target);
    try {
      await (target === "all" ? clearAllCaches() : clearCacheCategory(target));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const files = (count: number) => t(locale, "settings.data.fileCount", { count: count.toLocaleString(locale) });

  return (
    <div className="space-y-6">
      <Section title={t(locale, "settings.data.cacheTitle")}>
        {!available ? (
          <p className="text-body-medium text-on-surface-variant">{t(locale, "settings.data.unavailable")}</p>
        ) : !overview ? (
          <p className="text-body-medium text-on-surface-variant">{t(locale, "settings.data.calculating")}</p>
        ) : (
          <>
            <div className="rounded-shape-md bg-surface-container-highest p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-label-large text-on-surface-variant">{t(locale, "settings.data.total")}</span>
                <span className="text-label-medium text-on-surface-variant">{files(overview.total.entries)}</span>
              </div>
              <p className="mt-1 font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{formatBytes(overview.total.bytes)}</p>
              <CacheBreakdown locale={locale} overview={overview} active={active} onActive={setActive} />
            </div>

            <ul className="mt-3 divide-y divide-outline-variant overflow-hidden rounded-shape-md border border-outline-variant">
              {CACHE_CATEGORIES.map((category) => {
                const usage = overview.categories[category];
                return (
                  <li
                    key={category}
                    onMouseEnter={() => setActive(category)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${active === category ? "bg-surface-container-high" : ""}`}
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(--mn-cache-${category})` }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-title-small text-on-surface">{t(locale, `settings.data.categories.${category}`)}</p>
                      <p className="truncate text-body-small text-on-surface-variant">{t(locale, `settings.data.categoryHints.${category}`)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-label-large text-on-surface">{formatBytes(usage.bytes)}</p>
                      <p className="text-label-small text-on-surface-variant">{files(usage.entries)}</p>
                    </div>
                    <Button variant="text" size="small" disabled={busy !== null || usage.entries === 0} onClick={() => void clear(category)}>
                      {t(locale, busy === category ? "settings.data.clearing" : "settings.data.clear")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      {available && overview && (
        <Button variant="tonal" color="error" fullWidth disabled={busy !== null || overview.total.entries === 0} onClick={() => void clear("all")}>
          {t(locale, busy === "all" ? "settings.data.clearing" : "settings.data.clearAll")}
        </Button>
      )}
    </div>
  );
}

/**
 * The total split by category: one segment per category that keeps anything, in the list's order and colors, 2px apart.
 * The list below names every category with its size, so the bar itself is left out of the accessibility tree.
 */
function CacheBreakdown({ locale, overview, active, onActive }: {
  locale: AppLocale;
  overview: CacheOverview;
  active: CacheCategory | null;
  onActive: (category: CacheCategory | null) => void;
}) {
  const total = overview.total.bytes;
  const parts = CACHE_CATEGORIES.filter((category) => overview.categories[category].bytes > 0);
  if (total === 0 || parts.length === 0) return <div aria-hidden="true" className="mt-3 h-2.5 rounded-full bg-surface-container" />;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <div aria-hidden="true" className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full" onMouseLeave={() => onActive(null)}>
      {parts.map((category) => {
        const bytes = overview.categories[category].bytes;
        return (
          <span
            key={category}
            title={`${t(locale, `settings.data.categories.${category}`)} · ${formatBytes(bytes)} · ${percent.format(bytes / total)}`}
            onMouseEnter={() => onActive(category)}
            className="h-full min-w-[3px] transition-opacity"
            style={{ flex: `${bytes} 1 0px`, background: `var(--mn-cache-${category})`, opacity: active && active !== category ? 0.35 : 1 }}
          />
        );
      })}
    </div>
  );
}

/** Theme color: the site's default blue or a band's color, as M3 filter chips with a swatch. */
function AccentPicker({ locale, bands, value, onChange }: { locale: AppLocale; bands: ThemeBandColor[]; value: string; onChange: (value: string) => void }) {
  const options = [{ key: DEFAULT_ACCENT, label: t(locale, "settings.accent.default"), color: MD3_DEFAULT_SEED }, ...bands.map((band) => ({ key: band.color, label: band.name, color: band.color }))];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(locale, "settings.accent.title")}>
      {options.map((option) => {
        const selected = value.toUpperCase() === option.key.toUpperCase();
        return (
          <Chip
            key={option.key}
            variant="filter"
            role="radio"
            aria-checked={selected}
            title={option.label}
            onClick={() => onChange(option.key)}
            icon={
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full" style={{ background: option.color }} aria-hidden="true">
                {selected && <Icon name="check" className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
            }
            label={<span className="block max-w-[9rem] truncate">{option.label}</span>}
          />
        );
      })}
    </div>
  );
}

/** Always show songs under their Japanese titles (shared with the music pages' preference). */
function JapaneseTitlesToggle({ locale }: { locale: AppLocale }) {
  const [on, setOn] = useState(false);
  const id = useId();
  useEffect(() => {
    setOn(getForceJapaneseTitles());
    const sync = () => setOn(getForceJapaneseTitles());
    window.addEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-body-large text-on-surface">{t(locale, "settings.songTitles.forceJapanese")}</span>
        <span className="mt-0.5 block text-body-medium text-on-surface-variant">{t(locale, "settings.songTitles.hint")}</span>
      </label>
      <Switch
        id={id}
        checked={on}
        className="-my-3 shrink-0"
        onChange={(event) => {
          setOn(event.target.checked);
          setForceJapaneseTitles(event.target.checked);
        }}
      />
    </div>
  );
}

/** Filter unreleased / datamined content under Bilibili EULA, unlockable via backdoor ?Spoiler=allow */
function SpoilerToggle({ locale }: { locale: AppLocale }) {
  const { isUnlocked, showSpoiler, setShowSpoiler } = useSpoiler();
  const id = useId();

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={id} className={`min-w-0 ${isUnlocked ? "cursor-pointer" : "cursor-not-allowed"}`}>
          <span className="block text-body-large text-on-surface">{t(locale, "settings.spoiler.showLabel")}</span>
          <span className="mt-0.5 block text-body-medium text-on-surface-variant">
            {t(locale, "settings.spoiler.eulaNotice")}
          </span>
        </label>
        <Switch
          id={id}
          checked={showSpoiler}
          disabled={!isUnlocked}
          className="-my-3 shrink-0"
          onChange={(event) => {
            if (isUnlocked) setShowSpoiler(event.target.checked);
          }}
        />
      </div>
      {isUnlocked && (
        <div className="inline-flex items-center gap-1.5 rounded-shape-xs bg-surface-container-high px-2 py-1 text-label-small text-on-surface-variant">
          <Icon name="info" className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t(locale, "settings.spoiler.devOnly")}</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-title-small text-on-surface-variant">{title}</h3>
      {children}
      <Divider className="!mt-7 [section:last-child_&]:hidden" />
    </section>
  );
}

/** M3 single-select segmented buttons spanning the sheet's width. */
function Segmented({ label, value, options, optionLabel, onChange }: { label: string; value: string; options: string[]; optionLabel: (value: string) => string; onChange: (value: string) => void }) {
  return (
    <ToggleButtonGroup exclusive fullWidth value={value} onChange={(_, next: string | null) => next && onChange(next)} aria-label={label}>
      {options.map((option) => (
        <ToggleButton key={option} value={option}>
          {value === option && <Icon name="check" className="h-[18px] w-[18px]" />}
          {optionLabel(option)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default withMd3(SettingsDrawer);
