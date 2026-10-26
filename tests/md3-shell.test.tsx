import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import Sidebar from "../src/components/shell/Sidebar";
import CommandPalette from "../src/components/shell/CommandPalette";
import KeyboardShortcutsHelp from "../src/components/shell/KeyboardShortcutsHelp";
import SettingsDrawer from "../src/components/shell/SettingsDrawer";
import TopAppBar from "../src/components/shell/TopAppBar";
import RouteGlyph from "../src/components/shared/RouteGlyph";
import { buildHeaderCrumbs } from "../src/lib/route/header-crumbs";
import { getNavChildren, getNavigationGroups } from "../src/lib/route/registry";
import type { AppRoute } from "../src/types/route";

describe("material 3 shell", () => {
  test("breadcrumbs offer sibling pages, and a group landing ends with a page picker", () => {
    const cards = buildHeaderCrumbs("/cards", "en-US");
    expect(cards.map((crumb) => crumb.id)).toEqual(["database", "cards"]);
    expect(cards[0]!.groupMenu).toBe(true);
    expect(cards[1]!.current).toBe(true);
    expect(cards[1]!.options.find((option) => option.current)?.label).toBe("Cards");

    const landing = buildHeaderCrumbs("/database", "en-US");
    expect(landing.at(-1)!.picker).toBe(true);
    expect(landing.at(-1)!.current).toBe(false);
    expect(landing.at(-1)!.options.length).toBeGreaterThan(0);
    expect(landing.at(-2)!.current).toBe(true);
    // The picker is named by its visible text, not an icon.
    expect(renderToString(<TopAppBar locale="en-US" homeHref="/en" crumbs={landing} />)).toContain(">Choose a page<");
  });

  test("the top app bar renders the trail, localized labels and the actions", () => {
    const html = renderToString(<TopAppBar locale="ja-JP" homeHref="/ja" crumbs={buildHeaderCrumbs("/cards", "ja-JP")} />);
    expect(html).toContain("mn-top-app-bar");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="パンくずリスト"');
    expect(html).toContain("Moenotes を検索");
    expect(html).not.toContain("Select subpage");
    // Server render (no viewport): the modal drawer's state, closed — never "Close sidebar" on first paint.
    expect(html).toContain('aria-label="サイドバーを開く"');
    // Narrow screens get the trail on its own row under the bar (the inline one is hidden below md).
    expect(html).toContain("mn-app-bar-trail");
    expect(renderToString(<TopAppBar locale="en-US" homeHref="/en" crumbs={[]} />)).not.toContain("mn-app-bar-trail");
  });

  test("the navigation drawer marks the current page with the active indicator", () => {
    const html = renderToString(<Sidebar locale="en-US" pathname="/cards" />);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current.length).toBe(1);
    expect(current[0]).toContain("glass-selected");
    expect(html).toContain('aria-label="Main navigation"');
  });

  test("the server renders every group expanded so the drawer works without JavaScript", () => {
    const html = renderToString(<Sidebar locale="en-US" pathname="/cards" />);
    expect(html).toContain('data-ready="false"');
    expect(html).not.toContain('aria-expanded="false"');
    const groups = getNavigationGroups().filter((group) => getNavChildren(group).length > 0);
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(groups.length);
    for (const group of groups) {
      expect(html).toContain(`aria-controls="nav-group-${group.id}"`);
      expect(html).toContain(`id="nav-group-${group.id}"`);
      // The pre-paint stylesheet points these chevrons down for the groups the reader folded.
      expect(html).toContain(`data-nav-chevron="${group.id}"`);
    }
  });

  test("every navigation destination draws its own icon", () => {
    const glyph = (route: AppRoute) => renderToString(<RouteGlyph icon={route.nav && route.nav.icon ? route.nav.icon : "sparkles"} routeId={route.id} />);
    const seen = new Map<string, string>([[renderToString(<RouteGlyph icon="home" />), "home"]]);
    for (const route of getNavigationGroups().flatMap((group) => [group, ...getNavChildren(group)])) {
      const markup = glyph(route);
      expect(`${route.id} shares its icon with ${seen.get(markup) ?? "nothing"}`).toBe(`${route.id} shares its icon with nothing`);
      seen.set(markup, route.id);
    }
  });

  test("closed overlays (settings, command palette, shortcuts) render nothing on the server", () => {
    for (const element of [
      <SettingsDrawer locale="en-US" pathname="/cards" bands={[]} />,
      <CommandPalette locale="en-US" />,
      <KeyboardShortcutsHelp locale="en-US" />,
    ]) {
      expect(() => renderToString(element)).not.toThrow();
      expect(renderToString(element)).not.toContain('role="dialog"');
    }
  });
});
