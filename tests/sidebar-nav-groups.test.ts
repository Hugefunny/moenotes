import { describe, expect, test } from "bun:test";
import { getNavigationGroupId } from "../src/lib/route/registry";
import {
  expandActiveGroup,
  parseCollapsedGroups,
  resolveNavGroupEntry,
  toggleCollapsedGroup,
} from "../src/lib/sidebar/nav-groups";

describe("navigation group membership", () => {
  test("groups come from the route tree, not the URL prefix", () => {
    const cases: Array<[string, string | undefined]> = [
      ["/database", "database"],
      ["/characters", "database"],
      ["/characters/123", "database"],
      ["/cards/abc", "database"],
      ["/support-cards/9", "database"],
      ["/items/9", "database"],
      ["/help/1", "database"],
      ["/musics", "musics"],
      ["/music", "musics"],
      ["/music/42", "musics"],
      ["/music/guess", "musics"],
      // A music page that lives under /tools still belongs to the music group, not the tools group.
      ["/tools/chart-data", "musics"],
      ["/tools/chart-preview", "musics"],
      ["/tools/music-ranking", "musics"],
      ["/tools", "tools"],
      ["/tools/live2d", "tools"],
      ["/tools/deck/guide", "tools"],
      ["/events", "events"],
      ["/events/list", "events"],
      ["/events/123", "events"],
      ["/calendar", "events"],
      ["/rewards/1", "events"],
      ["/gacha/2", "events"],
      ["/news/detail", "events"],
      ["/story", "story"],
      ["/story/main", "story"],
      ["/story/123", "story"],
      ["/about", "community"],
      ["/licenses", "community"],
      ["/", undefined],
      ["/search", undefined],
      ["/account", undefined],
      ["/account/box", undefined],
    ];
    for (const [pathname, groupId] of cases) expect([pathname, getNavigationGroupId(pathname)]).toEqual([pathname, groupId]);
  });

  test("locale prefixes and trailing slashes resolve to the same group", () => {
    expect(getNavigationGroupId("/ja/cards")).toBe("database");
    expect(getNavigationGroupId("/en/characters/1")).toBe("database");
    expect(getNavigationGroupId("/zh-tw/music/3")).toBe("musics");
    expect(getNavigationGroupId("/cards/")).toBe("database");
  });

  test("unmatched paths fall back to a group prefix", () => {
    expect(getNavigationGroupId("/database/unknown")).toBe("database");
    expect(getNavigationGroupId("/nowhere")).toBeUndefined();
  });
});

describe("navigation group folds", () => {
  test("stored folds are parsed defensively", () => {
    expect(parseCollapsedGroups(null)).toEqual({});
    expect(parseCollapsedGroups("")).toEqual({});
    expect(parseCollapsedGroups("not json")).toEqual({});
    expect(parseCollapsedGroups("[]")).toEqual({});
    expect(parseCollapsedGroups('"database"')).toEqual({});
    expect(parseCollapsedGroups('{"database":true,"musics":false}')).toEqual({ database: true, musics: false });
    expect(parseCollapsedGroups('{"database":"true","musics":1,"events":null}')).toEqual({});
    const parsed = parseCollapsedGroups('{"__proto__":true,"database":true}');
    expect(parsed).toEqual({ database: true });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  test("expanding leaves the other folds and the input untouched", () => {
    const saved = { musics: true, events: true };
    expect(expandActiveGroup(saved, "musics")).toEqual({ musics: false, events: true });
    expect(saved).toEqual({ musics: true, events: true });
    expect(expandActiveGroup(saved, "database")).toBe(saved);
    expect(expandActiveGroup(saved, undefined)).toBe(saved);
  });

  test("a toggle flips one group and starts unrecorded groups expanded", () => {
    const saved = { musics: true };
    expect(toggleCollapsedGroup(saved, "musics")).toEqual({ musics: false });
    expect(toggleCollapsedGroup(saved, "database")).toEqual({ musics: true, database: true });
    expect(saved).toEqual({ musics: true });
  });

  test("entering a group opens it once only from outside the group", () => {
    const saved = { database: true, musics: true };

    const fromOutside = resolveNavGroupEntry(saved, "database", null);
    expect(fromOutside).toEqual({ collapsed: { database: false, musics: true }, persist: true, nextPreviousGroupId: "database" });

    const fromAnotherGroup = resolveNavGroupEntry(saved, "database", "events");
    expect(fromAnotherGroup).toEqual({ collapsed: { database: false, musics: true }, persist: true, nextPreviousGroupId: "database" });

    const withinGroup = resolveNavGroupEntry(saved, "database", "database");
    expect(withinGroup).toEqual({ collapsed: saved, persist: false, nextPreviousGroupId: "database" });
    expect(withinGroup.collapsed).toBe(saved);

    const alreadyOpen = resolveNavGroupEntry({ musics: true }, "database", null);
    expect(alreadyOpen).toEqual({ collapsed: { musics: true }, persist: false, nextPreviousGroupId: "database" });

    const outsideAnyGroup = resolveNavGroupEntry(saved, undefined, "database");
    expect(outsideAnyGroup).toEqual({ collapsed: saved, persist: false, nextPreviousGroupId: null });
    expect(outsideAnyGroup.collapsed).toBe(saved);
  });
});
