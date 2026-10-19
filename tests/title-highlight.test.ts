import { describe, expect, test } from "bun:test";
import { getMessages } from "../src/i18n";
import { splitTitleHighlight, titleHighlightId } from "../src/lib/format/title-highlight";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;
// Page headings titled outside `seo` (PageLayout's other title keys).
const OTHER_TITLE_KEYS = ["account.title", "player.title", "notFound.title", "openPlatform.title", "openPlatform.docs.title", "deckWorkspace.deckGuide.title"];

const at = (tree: unknown, path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

describe("splitTitleHighlight", () => {
  test("marks the locale's choice where the title contains it", () => {
    expect(splitTitleHighlight("Our Notes 乐曲与音乐资料库", "资料库")).toEqual({ before: "Our Notes 乐曲与音乐", mark: "资料库", after: "" });
    expect(splitTitleHighlight("Moenotes について", "Moenotes")).toEqual({ before: "", mark: "Moenotes", after: " について" });
  });

  test("without a usable choice, marks the last word, or the whole title when it has no space", () => {
    expect(splitTitleHighlight("Kartenkompendium der Welt", "Compendium")).toEqual({ before: "Kartenkompendium der ", mark: "Welt", after: "" });
    expect(splitTitleHighlight("角色图鉴", "")).toEqual({ before: "", mark: "角色图鉴", after: "" });
  });

  test("ids follow the title key", () => {
    expect(titleHighlightId("seo.cards.title")).toBe("cards");
    expect(titleHighlightId("openPlatform.docs.title")).toBe("openPlatformDocs");
    expect(titleHighlightId("deckWorkspace.deckGuide.title")).toBe("deckWorkspaceDeckGuide");
  });
});

describe("pageTitleHighlights", () => {
  for (const locale of CORE_LOCALES) {
    test(`${locale}: every highlight is part of its title`, () => {
      const messages = getMessages(locale);
      const highlights = at(messages, "pageTitleHighlights") as Record<string, string>;
      const seo = at(messages, "seo") as Record<string, { title?: string }>;
      const titleKeys = [...Object.keys(seo).filter((key) => typeof seo[key]?.title === "string").map((key) => `seo.${key}.title`), ...OTHER_TITLE_KEYS];
      const reached = new Set<string>();
      for (const titleKey of titleKeys) {
        const id = titleHighlightId(titleKey);
        const highlight = highlights[id];
        if (highlight === undefined) continue;
        reached.add(id);
        expect(at(messages, titleKey) as string).toContain(highlight);
      }
      expect(Object.keys(highlights).filter((id) => !reached.has(id))).toEqual([]);
    });
  }
});
