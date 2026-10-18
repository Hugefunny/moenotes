import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Collapse from "@mui/material/Collapse";
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
 * Material 3 navigation drawer, as MoeSekai draws it. From `md` up it is a glass pane floating in its rail beside the
 * content (the top app bar's navigation button folds it away); below `md` it is a modal drawer of thick glass over a
 * scrim. Groups expand in place, the current page carries the seed's tint on the glass, and the account sits at the
 * foot.
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
        className="mn-desktop-sidebar glass fixed bottom-3 top-[calc(var(--md-app-bar-height,64px)+0.75rem)] z-30 hidden w-[calc(17rem-1.5rem)] overflow-hidden rounded-shape-xl md:block"
        data-open={desktopOpen}
        data-ready={ready}
        inert={!desktopOpen}
        aria-hidden={!desktopOpen}
        style={{ left: "calc(max(0px, (100vw - var(--mn-layout-max-width, 120rem)) / 2) + 0.75rem)" }}
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
        slotProps={{ paper: { className: "glass-thick", sx: { width: "min(22.5rem, calc(100vw - 56px))", borderRadius: "0 28px 28px 0" }, "aria-label": t(locale, "shell.navigation") } }}
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
    <nav ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" aria-label={t(locale, "shell.navigation")}>
      <NavItem href={localizePath("/", locale)} active={home} onNavigate={onNavigate} icon={<RouteGlyph icon="home" className="h-5 w-5" />}>
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
  // Paths nest (`/music` holds `/music/guess` and song details), so only the longest matching item is current.
  const activeItemId = children.filter((item) => isCurrentRoute(current, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.id;
  return (
    <div className="mt-1 border-t border-outline-variant pt-1">
      {/* The group's name opens its hub page; the chevron beside it folds the group. */}
      <div className="relative">
        <a
          href={localizePath(group.path, locale)}
          onClick={onNavigate}
          aria-current={headerActive ? "page" : undefined}
          className={`md3-state flex h-12 items-center rounded-full px-3 text-title-small lg:h-9 ${children.length > 0 ? "pr-12" : ""} ${
            headerActive ? "glass-selected text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="min-w-0 truncate">{t(locale, group.labelKey)}</span>
        </a>
        {children.length > 0 && (
          <IconButton
            size="small"
            className="!absolute right-1 top-1/2 -translate-y-1/2"
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={t(locale, group.labelKey)}
            onClick={onToggle}
          >
            <Icon name="chevronDown" className={`h-5 w-5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
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
                active={item.id === activeItemId}
                onNavigate={onNavigate}
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

/** One drawer destination: a compact pill (48dp, 40dp with a fine pointer); the current page in the seed's glass tint. */
function NavItem({ href, active, onNavigate, icon, children }: { href: string; active: boolean; onNavigate?: (() => void) | undefined; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`md3-state mn-nav-layer flex h-12 items-center gap-3 rounded-full px-3 text-label-large lg:h-10 ${
        active ? "glass-selected text-on-surface" : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

export default withMd3(Sidebar);
