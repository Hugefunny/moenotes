/**
 * The top app bar's breadcrumb trail (src/components/shell/TopAppBar.tsx), computed when the page is built: each crumb
 * with the sibling pages its menu offers. A group landing page (e.g. /database) is the current crumb, followed by a
 * "choose a page" menu listing the group's pages.
 */
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { buildBreadcrumbs } from "@/lib/route/breadcrumbs";
import { findRouteMatch, getNavChildren, getNavigationGroups } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail } from "@/types/route";

export interface HeaderCrumbOption {
  href: string;
  label: string;
  current: boolean;
}

export interface HeaderCrumb {
  id: string;
  label: string;
  href: string;
  current: boolean;
  /** The "choose a page" crumb of a group landing page: no link of its own, only the menu. */
  picker: boolean;
  /** Sibling pages, shown in the crumb's menu (empty: no menu). */
  options: HeaderCrumbOption[];
  /** The options are the navigation groups (the menu's accessible name differs). */
  groupMenu: boolean;
}

export function buildHeaderCrumbs(pathname: string, locale: AppLocale, detail?: BreadcrumbDetail): HeaderCrumb[] {
  const match = findRouteMatch(pathname);
  const groups = getNavigationGroups();
  const trail = buildBreadcrumbs(pathname, locale, detail).slice(1);

  const optionsFor = (id: string): AppRoute[] => {
    if (!match) return [];
    if (groups.some((group) => group.id === id)) return groups;
    const parent = groups.find((group) => getNavChildren(group).some((child) => child.id === id));
    return parent ? getNavChildren(parent) : [];
  };
  const toOptions = (routes: AppRoute[], currentId: string | null): HeaderCrumbOption[] =>
    routes.map((route) => ({ href: localizePath(route.path, locale), label: t(locale, route.labelKey), current: route.id === currentId }));

  const crumbs: HeaderCrumb[] = trail.map((crumb) => ({
    id: crumb.id,
    label: crumb.label,
    href: crumb.href,
    current: Boolean(crumb.current),
    picker: false,
    options: toOptions(optionsFor(crumb.id), crumb.id),
    groupMenu: groups.some((group) => group.id === crumb.id),
  }));

  // The group stays the current crumb (it is the page); the picker after it only opens the menu of its pages.
  if (match?.isGroupLanding) {
    const children = getNavChildren(match.item);
    if (children.length > 0) {
      crumbs.push({ id: "__picker__", label: "", href: "", current: false, picker: true, options: toOptions(children, null), groupMenu: false });
    }
  }
  return crumbs;
}
