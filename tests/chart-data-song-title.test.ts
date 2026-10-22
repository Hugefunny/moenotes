import { expect, test } from "bun:test";
import { localizeDataSongTitle } from "../src/lib/chart-data/text";

test("chart meta titles follow Japanese preference and restore localized names when disabled", () => {
  const title = { ja: "春日影", "zh-Hans": "春日之影", en: "Haruhikage" };
  expect(localizeDataSongTitle(title, "zh-CN", true)).toBe("春日影");
  expect(localizeDataSongTitle(title, "zh-CN", false)).toBe("春日之影");
  expect(localizeDataSongTitle(title, "en-US", true)).toBe("春日影");
  expect(localizeDataSongTitle(title, "en-US", false)).toBe("Haruhikage");
});
test("absent or untranslated Japanese titles keep the locale fallback", () => {
  expect(localizeDataSongTitle({ ja: "", "zh-Hans": "本地歌名", en: "English" }, "zh-CN", true)).toBe("本地歌名");
  expect(localizeDataSongTitle({ ja: "Music_Tilte_33", "zh-Hans": "本地歌名" }, "zh-CN", true)).toBe("本地歌名");
  expect(localizeDataSongTitle(null, "zh-CN", true)).toBe("");
});
