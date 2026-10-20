export const storageKeys = {
  settings: "moenotes:settings",
  sidebarOpen: "moenotes:sidebar-open",
  filterDrawerOpen: "moenotes:filter-drawer-open",
  browserNoticeDismissed: "moenotes:browser-notice-dismissed",
  scrollPrefix: "moenotes:scroll:",
  assetCacheBypass: "moenotes:asset-cache-bypass",
  chartLiveSettings: "moenotes:chart-live-settings",
  storyPlayerVolumes: "moenotes:story-player-volumes",
  newsSeen: "moenotes:news-seen",
  homeLayout: "moenotes:home-layout:v1",
  accentPalette: "moenotes:accent-palette",
  audioDock: "moenotes:audio-dock:v1",
  /** Shared with the song title preference (src/lib/music/title-preference.ts): "1" / "0". */
  forceJapaneseTitles: "moenotes:force-ja-titles",
  /** Shared with spoiler content preference: "1" / "0". */
  showSpoiler: "moenotes:show-spoiler",
  /** Whether developer testing mode for spoiler content is unlocked via ?Spoiler=allow: "1" / "0". */
  spoilerUnlocked: "moenotes:spoiler-unlocked",
  /** Room Check's list of room codes and servers (src/lib/room-check/store.ts). */
  roomCheckRooms: "moenotes:room-check:v1",
} as const;
