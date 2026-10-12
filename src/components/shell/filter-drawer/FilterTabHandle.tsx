import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { FILTER_DOCK_LEFT, FILTER_DRAWER_ID, FILTER_SHEET_WIDTH } from "./FilterDrawer";

interface FilterTabHandleProps {
  locale: AppLocale;
}

/**
 * Opens and closes the filter sheet: an extended FAB ("Filter") at the start of the content column. While the docked
 * sheet is open the button rides its outer edge as a small FAB that folds it away.
 */
export default function FilterTabHandle({ locale }: FilterTabHandleProps) {
  const { hasFilters, isOpen, isDocked, toggle, filterTitle } = useQuickFilterState();
  const visible = Boolean(hasFilters && (!isOpen || isDocked));
  const label = filterTitle || t(locale, "filter.title");
  const dockedOpen = isDocked && isOpen;

  const left = isDocked ? `calc(${FILTER_DOCK_LEFT} + ${dockedOpen ? FILTER_SHEET_WIDTH : "0rem"} + 1rem)` : "1rem";

  return (
    <Zoom in={visible} unmountOnExit>
      <Fab
        variant={dockedOpen ? "circular" : "extended"}
        size={dockedOpen ? "small" : "medium"}
        color={dockedOpen ? "surface" : "secondary"}
        onClick={toggle}
        aria-controls={FILTER_DRAWER_ID}
        aria-expanded={isOpen}
        aria-label={dockedOpen ? t(locale, "filter.collapse") : label}
        title={t(locale, "filter.openQuickFilter")}
        className="!fixed bottom-6 z-30 transition-[left] duration-300 ease-[var(--md-sys-motion-easing-emphasized)] lg:bottom-auto lg:top-[calc(var(--md-app-bar-height,64px)+1rem)]"
        style={{ left }}
      >
        <Icon name={dockedOpen ? "chevronLeft" : "filter"} />
        {!dockedOpen && <span className="max-w-[10rem] truncate">{label}</span>}
      </Fab>
    </Zoom>
  );
}
