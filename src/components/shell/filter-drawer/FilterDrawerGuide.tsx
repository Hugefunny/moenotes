import { useCallback, useEffect, useSyncExternalStore } from "react";
import Button from "@mui/material/Button";
import Grow from "@mui/material/Grow";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { FILTER_DOCK_LEFT, FILTER_SHEET_WIDTH } from "./FilterDrawer";

const HINT_CHANGE_EVENT = "moenotes:filter-drawer-hint-change";

function readHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return safeGetLocalStorage(storageKeys.filterDrawerHintSeen) === "true";
}

function subscribeHint(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKeys.filterDrawerHintSeen) callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(HINT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HINT_CHANGE_EVENT, callback);
  };
}

function writeHintSeen() {
  safeSetLocalStorage(storageKeys.filterDrawerHintSeen, "true");
  window.dispatchEvent(new Event(HINT_CHANGE_EVENT));
}

/** A one-time M3 rich tooltip next to the filter button, explaining where the filters went. */
export default function FilterDrawerGuide({ locale }: { locale: AppLocale }) {
  const { hasFilters, isOpen, isDocked } = useQuickFilterState();
  const hasSeenHint = useSyncExternalStore(subscribeHint, readHintSeen, () => true);
  const dismiss = useCallback(() => writeHintSeen(), []);
  const visible = Boolean(hasFilters && !hasSeenHint);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, dismiss]);

  const left = isDocked ? `calc(${FILTER_DOCK_LEFT} + ${isDocked && isOpen ? FILTER_SHEET_WIDTH : "0rem"} + 1rem)` : "1rem";

  return (
    <Grow in={visible} unmountOnExit style={{ transformOrigin: "0 0" }}>
      <aside
        aria-label={t(locale, "filter.drawerHintTitle")}
        style={{ left }}
        className="fixed bottom-24 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-shape-md bg-surface-container p-4 shadow-elevation-2 lg:bottom-auto lg:top-[calc(var(--md-app-bar-height,64px)+5.5rem)]"
      >
        <h3 className="text-title-small text-on-surface-variant">{t(locale, "filter.drawerHintTitle")}</h3>
        <p className="mt-1 text-body-medium text-on-surface-variant">{t(locale, "filter.drawerHintBody")}</p>
        <div className="mt-3 flex justify-end">
          <Button variant="text" onClick={dismiss}>{t(locale, "filter.drawerHintDismiss")}</Button>
        </div>
      </aside>
    </Grow>
  );
}
