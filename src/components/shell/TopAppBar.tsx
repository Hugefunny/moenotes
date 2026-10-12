import { useEffect, useId, useState } from "react";
import AppBar from "@mui/material/AppBar";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import useScrollTrigger from "@mui/material/useScrollTrigger";
import useMediaQuery from "@mui/material/useMediaQuery";
import BrandLogo from "@/components/shared/BrandLogo";
import { Icon } from "@/components/shared/icons";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { toggleOverlay } from "@/lib/overlay/overlay-store";
import { useOverlay } from "@/lib/overlay/use-overlay";
import type { HeaderCrumb } from "@/lib/route/header-crumbs";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";

interface Props {
  locale: AppLocale;
  homeHref: string;
  crumbs: HeaderCrumb[];
}

/**
 * Material 3 small top app bar: navigation icon, the brand signature, the breadcrumb trail (each crumb with a menu of
 * its sibling pages) and the search / settings actions. Flat on the page surface; on scroll it takes the
 * surface-container tone (M3 "on scroll" elevation). Publishes its height as --md-app-bar-height for the shell.
 */
function TopAppBar({ locale, homeHref, crumbs }: Props) {
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  const { isOpen: mobileOpen, toggle: toggleMobile } = useOverlay("mobile-sidebar");
  const [desktopOpen, toggleDesktop] = useSidebarState();
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);

  const desktop = useMediaQuery("(min-width: 768px)");
  const toggleNav = () => {
    if (desktop) toggleDesktop();
    else toggleMobile();
  };
  // The drawer this viewport uses: docked from md, modal below (its own state, closed until opened).
  const navOpen = desktop ? desktopOpen : mobileOpen;

  return (
    <AppBar
      position="fixed"
      component="header"
      className="mn-top-app-bar"
      data-scrolled={scrolled ? "" : undefined}
      sx={{ backgroundColor: scrolled ? "var(--md-sys-color-surface-container)" : "var(--md-sys-color-surface)" }}
    >
      <Toolbar className="mx-auto w-full max-w-[var(--mn-layout-max-width,120rem)] gap-1 !px-2 sm:!px-4">
        <Tooltip title={t(locale, navOpen ? "shell.closeSidebar" : "shell.openSidebar")}>
          <IconButton
            edge="start"
            aria-label={t(locale, navOpen ? "shell.closeSidebar" : "shell.openSidebar")}
            aria-expanded={navOpen}
            onClick={toggleNav}
            sx={{ color: "var(--md-sys-color-on-surface)" }}
          >
            <Icon name={mobileOpen ? "close" : "menu"} />
          </IconButton>
        </Tooltip>
        <a href={homeHref} className="md3-state mx-1 flex shrink-0 items-center rounded-full px-2 py-1 text-on-surface" aria-label={t(locale, "nav.home")}>
          <BrandLogo className="mn-brand-shell" />
        </a>
        <Breadcrumbs locale={locale} crumbs={crumbs} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ButtonBase
            onClick={() => toggleOverlay("command")}
            aria-label={t(locale, "shell.openCommandPalette")}
            className="md3-state !hidden h-12 w-[min(22rem,32vw)] items-center gap-3 !rounded-full !bg-surface-container-high !px-4 !text-on-surface-variant sm:!flex"
          >
            <Icon name="search" />
            <span className="min-w-0 flex-1 truncate text-left text-body-large">{t(locale, "shell.searchPlaceholder")}</span>
            <kbd className="rounded-shape-xs border border-outline-variant px-1.5 font-sans text-label-small">{shortcut}</kbd>
          </ButtonBase>
          <Tooltip title={t(locale, "shell.openCommandPalette")}>
            <IconButton className="sm:!hidden" aria-label={t(locale, "shell.openCommandPalette")} onClick={() => toggleOverlay("command")}>
              <Icon name="search" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t(locale, "shell.openSettings")}>
            <IconButton edge="end" aria-label={t(locale, "shell.openSettings")} onClick={() => toggleOverlay("settings")}>
              <Icon name="settings" />
            </IconButton>
          </Tooltip>
        </div>
      </Toolbar>
    </AppBar>
  );
}

function Breadcrumbs({ locale, crumbs }: { locale: AppLocale; crumbs: HeaderCrumb[] }) {
  if (crumbs.length === 0) return null;
  // Narrow screens keep the last two crumbs; the trail scrolls sideways if it still does not fit.
  return (
    <nav aria-label={t(locale, "shell.breadcrumb")} className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-0.5 text-body-medium text-on-surface-variant">
        {crumbs.map((crumb, index) => (
          <li key={crumb.id} className={`flex items-center gap-0.5 ${index < crumbs.length - 2 ? "max-md:hidden" : ""}`}>
            <span aria-hidden="true" className="px-0.5 text-outline">/</span>
            <Crumb locale={locale} crumb={crumb} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Crumb({ locale, crumb }: { locale: AppLocale; crumb: HeaderCrumb }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchor);
  const menuLabel = crumb.picker ? t(locale, "shell.breadcrumbSelectPage") : t(locale, crumb.groupMenu ? "shell.breadcrumbExpandGroup" : "shell.breadcrumbExpandItems");
  const chip = crumb.current
    ? "bg-secondary-container text-on-secondary-container"
    : "text-on-surface-variant";

  return (
    <>
      {crumb.picker ? (
        <ButtonBase
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          className={`md3-state h-8 gap-1 !rounded-shape-sm !px-3 text-label-large ${chip}`}
        >
          <Icon name="more" className="h-[18px] w-[18px]" />
          <Icon name="chevronDown" className="h-[18px] w-[18px]" />
        </ButtonBase>
      ) : (
        <span className={`flex h-8 items-center overflow-hidden rounded-shape-sm ${chip}`}>
          <a href={crumb.href} aria-current={crumb.current ? "page" : undefined} className="md3-state flex h-full max-w-[14rem] items-center truncate px-3 text-label-large">
            <span className="truncate">{crumb.label}</span>
          </a>
          {crumb.options.length > 0 && (
            <ButtonBase
              aria-label={menuLabel}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={(event) => setAnchor(event.currentTarget)}
              className="md3-state h-full !rounded-none !px-1.5"
            >
              <Icon name="chevronDown" className={`h-[18px] w-[18px] transition-transform ${open ? "rotate-180" : ""}`} />
            </ButtonBase>
          )}
        </span>
      )}
      {crumb.options.length > 0 && (
        <Menu id={menuId} anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ list: { "aria-label": menuLabel, dense: true } }}>
          {crumb.options.map((option) => (
            <MenuItem key={option.href} component="a" href={option.href} selected={option.current} aria-current={option.current ? "page" : undefined}>
              {option.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}

export default withMd3(TopAppBar);
