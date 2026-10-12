import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import BrandLogo from "@/components/shared/BrandLogo";
import { Icon } from "@/components/shared/icons";
import RouteGlyph from "@/components/shared/RouteGlyph";
import { withMd3 } from "@/components/md3/Md3Provider";
import SidebarAccount from "@/components/shell/SidebarAccount";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath, normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { getNavChildren, getNavigationGroups, isCurrentRoute } from "@/lib/route/registry";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { safeGetLocalStorage, safeGetSessionStorage, safeSetLocalStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import type { AppRoute, RouteIcon } from "@/types/route";

const groupStorageKey = "moenotes:nav-groups";
const scrollStorageKey = "moenotes:sidebar-scroll";

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
  activePath?: string | undefined;
}

/**
 * Material 3 navigation drawer. From `md` up it is a standard drawer docked beside the content (the top app bar's
 * navigation button folds it away); below `md` it is a modal drawer over a scrim. Groups expand in place, the current
 * page carries the active indicator (secondary-container), and the account pane sits at the foot.
 */
function Sidebar({ locale, pathname, activePath }: SidebarProps) {
  const [desktopOpen] = useSidebarState();
  const [ready, setReady] = useState(false);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  const groups = useMemo(() => getNavigationGroups(), []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <aside
        className="mn-desktop-sidebar fixed bottom-0 top-[var(--md-app-bar-height,64px)] z-30 hidden w-[17rem] md:block"
        data-open={desktopOpen}
        data-ready={ready}
        inert={!desktopOpen}
        aria-hidden={!desktopOpen}
        style={{ left: "max(0px, (100vw - var(--mn-layout-max-width, 120rem)) / 2)" }}
      >
        <div className="flex h-full flex-col">
          <DrawerNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} />
          <SidebarAccount locale={locale} pathname={pathname} />
        </div>
      </aside>

      <Drawer
        open={mobileOpen}
        onClose={closeMobile}
        anchor="left"
        className="md:hidden"
        slotProps={{ paper: { sx: { width: "min(22.5rem, calc(100vw - 56px))" }, "aria-label": t(locale, "shell.navigation") } }}
        ModalProps={{ keepMounted: false }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <a href={localizePath("/", locale)} onClick={closeMobile} className="md3-state rounded-full px-2 py-1 text-on-surface" aria-label={t(locale, "nav.home")}>
            <BrandLogo className="mn-brand-shell" />
          </a>
          <IconButton aria-label={t(locale, "shell.closeSidebar")} onClick={closeMobile}>
            <Icon name="close" />
          </IconButton>
        </div>
        <DrawerNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} onNavigate={closeMobile} />
        <SidebarAccount locale={locale} pathname={pathname} />
      </Drawer>
    </>
  );
}

function DrawerNav({ locale, pathname, activePath, groups, onNavigate }: { locale: AppLocale; pathname: string; activePath?: string | undefined; groups: AppRoute[]; onNavigate?: () => void }) {
  const scrollRef = useRef<HTMLElement>(null);
  const current = activePath || pathname;
  const activeGroupIds = useMemo(() => groups.filter((group) => isCurrentRoute(current, group.path)).map((group) => group.id), [groups, current]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Keep the drawer's scroll position across page loads.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number.parseInt(safeGetSessionStorage(scrollStorageKey) ?? "", 10);
    if (Number.isFinite(saved)) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = saved; });
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) safeSetSessionStorage(scrollStorageKey, String(scrollRef.current.scrollTop));
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(safeGetLocalStorage(groupStorageKey) ?? "null");
      if (saved && typeof saved === "object") setCollapsed(saved as Record<string, boolean>);
    } catch {
      setCollapsed({});
    }
  }, []);

  const toggleGroup = (id: string) => {
    setCollapsed((state) => {
      const next = { ...state, [id]: !state[id] };
      safeSetLocalStorage(groupStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const home = stripLocaleFromPathname(current) === "/";
  return (
    <nav ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t(locale, "shell.navigation")}>
      <NavItem href={localizePath("/", locale)} active={home} onNavigate={onNavigate} icon={<RouteGlyph icon="home" className="h-6 w-6" />}>
        {t(locale, "nav.home")}
      </NavItem>
      {groups.map((group) => (
        <NavGroup
          key={group.id}
          group={group}
          locale={locale}
          current={current}
          collapsed={Boolean(collapsed[group.id]) && !activeGroupIds.includes(group.id)}
          onToggle={() => toggleGroup(group.id)}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function NavGroup({ group, locale, current, collapsed, onToggle, onNavigate }: { group: AppRoute; locale: AppLocale; current: string; collapsed: boolean; onToggle: () => void; onNavigate?: (() => void) | undefined }) {
  const children = getNavChildren(group);
  const headerActive = stripLocaleFromPathname(current) === normalizePathname(group.path);
  const listId = `nav-group-${group.id}`;
  return (
    <div className="pt-1">
      <Divider className="!my-2 !mx-4" />
      <div className="relative">
        <NavItem
          href={localizePath(group.path, locale)}
          active={headerActive}
          onNavigate={onNavigate}
          icon={<RouteGlyph icon={(group.nav && group.nav.icon ? group.nav.icon : "sparkles") as RouteIcon} routeId={group.id} className="h-6 w-6" />}
          trailingSpace={children.length > 0}
        >
          {t(locale, group.labelKey)}
        </NavItem>
        {children.length > 0 && (
          <IconButton
            size="small"
            className="!absolute right-2 top-1/2 -translate-y-1/2"
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={t(locale, group.labelKey)}
            onClick={onToggle}
          >
            <Icon name="chevronDown" className={`h-5 w-5 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
          </IconButton>
        )}
      </div>
      {children.length > 0 && (
        <Collapse in={!collapsed} timeout="auto">
          <div id={listId} className="pb-1">
            {children.map((item) => (
              <NavItem
                key={item.id}
                href={localizePath(item.path, locale)}
                active={isCurrentRoute(current, item.path)}
                onNavigate={onNavigate}
                nested
                icon={<RouteGlyph icon={(item.nav && item.nav.icon ? item.nav.icon : "sparkles") as RouteIcon} routeId={item.id} className="h-5 w-5" />}
              >
                {t(locale, item.labelKey)}
              </NavItem>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
}

/** One drawer destination: 56dp (48dp nested) pill, active indicator in secondary-container. */
function NavItem({ href, active, onNavigate, icon, nested = false, trailingSpace = false, children }: { href: string; active: boolean; onNavigate?: (() => void) | undefined; icon: ReactNode; nested?: boolean; trailingSpace?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`md3-state mn-nav-layer flex items-center gap-3 rounded-full ${nested ? "h-12 pl-10 pr-4 text-body-medium" : "h-14 px-4 text-label-large"} ${trailingSpace ? "pr-12" : ""} ${
        active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

export default withMd3(Sidebar);
