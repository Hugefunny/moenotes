import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import Sidebar from "../src/components/shell/Sidebar";
import CommandPalette from "../src/components/shell/CommandPalette";
import KeyboardShortcutsHelp from "../src/components/shell/KeyboardShortcutsHelp";
import SettingsDrawer from "../src/components/shell/SettingsDrawer";
import TopAppBar from "../src/components/shell/TopAppBar";
import { buildHeaderCrumbs } from "../src/lib/route/header-crumbs";

describe("material 3 shell", () => {
  test("breadcrumbs offer sibling pages, and a group landing ends with a page picker", () => {
    const cards = buildHeaderCrumbs("/cards", "en-US");
    expect(cards.map((crumb) => crumb.id)).toEqual(["database", "cards"]);
    expect(cards[0]!.groupMenu).toBe(true);
    expect(cards[1]!.current).toBe(true);
    expect(cards[1]!.options.find((option) => option.current)?.label).toBe("Cards");

    const landing = buildHeaderCrumbs("/database", "en-US");
    expect(landing.at(-1)!.picker).toBe(true);
    expect(landing.at(-1)!.options.length).toBeGreaterThan(0);
    expect(landing.at(-2)!.current).toBe(false);
  });

  test("the top app bar renders the trail, localized labels and the actions", () => {
    const html = renderToString(<TopAppBar locale="ja-JP" homeHref="/ja" crumbs={buildHeaderCrumbs("/cards", "ja-JP")} />);
    expect(html).toContain("mn-top-app-bar");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="パンくずリスト"');
    expect(html).toContain("Moenotes を検索");
    expect(html).not.toContain("Select subpage");
  });

  test("the navigation drawer marks the current page with the active indicator", () => {
    const html = renderToString(<Sidebar locale="en-US" pathname="/cards" />);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current.length).toBe(1);
    expect(current[0]).toContain("bg-secondary-container");
    expect(html).toContain('aria-label="Main navigation"');
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
