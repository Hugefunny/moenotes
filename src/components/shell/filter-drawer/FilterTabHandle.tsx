import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { FILTER_DOCK_LEFT, FILTER_DRAWER_ID } from "./FilterDrawer";

interface FilterTabHandleProps {
  locale: AppLocale;
}

/**
 * Opens the filter sheet: an extended FAB ("Filter") at the bottom of the content column, shown while the sheet is
 * closed. An open sheet closes from its own header (docked) or its scrim (modal), so the FAB never covers the page.
 */
export default function FilterTabHandle({ locale }: FilterTabHandleProps) {
  const { hasFilters, isOpen, isDocked, toggle, filterTitle } = useQuickFilterState();
  const visible = Boolean(hasFilters && !isOpen);
  const label = filterTitle || t(locale, "filter.title");
  const left = isDocked ? `calc(${FILTER_DOCK_LEFT} + 1.5rem)` : "1rem";

  return (
    <Zoom in={visible} unmountOnExit>
      <Fab
        variant="extended"
        color="primary"
        onClick={toggle}
        aria-controls={FILTER_DRAWER_ID}
        aria-expanded={isOpen}
        title={t(locale, "filter.openQuickFilter")}
        className="mn-filter-fab !fixed bottom-6 z-30"
        style={{ left }}
      >
        <Icon name="filter" />
        <span className="max-w-[10rem] truncate">{label}</span>
      </Fab>
    </Zoom>
  );
}
