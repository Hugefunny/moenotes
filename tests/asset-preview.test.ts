import { expect, test } from "bun:test";
import { getAssetBrowserPreview } from "../src/lib/assets/preview";

test("resolves image preview for AddressableResources path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Band/1/band_arena_background.png", "zh-CN");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("image");
  expect(result?.url).toBe("https://assets.bdon.moe/zh-Hans/Band/1/band_arena_background/band_arena_background.webp");
});

test("returns null for non-exported or unmapped path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Unknown/not_exist.bytes", "zh-CN");
  expect(result).toBeNull();
});

test("resolves audio preview for CRI sound cue sheet path with subdirectory", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Cri/Sound/Bgm/sound_bgm_mygo_offline.acb", "zh-CN");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("audio");
  expect(result?.url).toBe("https://assets.bdon.moe/zh-Hans/Cri/Sound/sound_bgm_mygo_offline/sound_bgm_mygo_offline.m4a");
});

test("resolves audio preview for CRI sound cue sheet path on specific server", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Cri/Sound/MusicScore/sound_bgm_1001.awb", "ja-JP", "jp");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("audio");
  expect(result?.url).toBe("https://assets.bdon.moe/jp/ja/Cri/Sound/sound_bgm_1001/sound_bgm_1001.m4a");
});
