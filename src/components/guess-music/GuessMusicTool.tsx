import { useCallback, useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { SETTINGS_PARAMS, hasSettingsParams } from "@/lib/guess-music/settings";
import type { GuessSong } from "@/lib/guess-music/songs";
import type { ServerFaceted } from "@/lib/servers/facets";
import DailyChallenge from "./DailyChallenge";
import FreePlayTool from "./FreePlayTool";
import GuessIcon from "./GuessIcon";

export interface GuessMusicToolProps {
  locale: AppLocale;
  songs: ServerFaceted<GuessSong>[];
  servers: GameServer[];
}

type Tab = "daily" | "free";
const TABS: Array<{ id: Tab; icon: "calendar" | "tune" }> = [
  { id: "daily", icon: "calendar" },
  { id: "free", icon: "tune" },
];

/**
 * Guess the song: the daily challenge (questions, clips and leaderboards from starmoe-api) and free play (all in the
 * browser). `?tab=free`, or a free-play share link, opens free play; the daily challenge is the default.
 */
export default function GuessMusicTool({ locale, songs, servers }: GuessMusicToolProps) {
  const tr = (key: string) => t(locale, `guessMusic.${key}`);
  // The static HTML knows no address: it shows the default tab, and the address picks once mounted.
  const [tab, setTab] = useState<Tab>("daily");
  // A run or a game is on screen: the tabs hide, so nothing keeps playing behind another tab.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "free" || hasSettingsParams(params)) setTab("free");
  }, []);

  const choose = useCallback((next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "free") url.searchParams.set("tab", "free");
    else {
      url.searchParams.delete("tab");
      for (const name of SETTINGS_PARAMS) url.searchParams.delete(name);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  return (
    <div className="gm-root">
      {!playing && (
        <div className="mn-segmented gm-segmented gm-tabs" role="tablist" aria-label={tr("tabs.label")}>
          {TABS.map(({ id, icon }) => (
            <button key={id} type="button" role="tab" id={`gm-tab-${id}`} aria-selected={tab === id} aria-controls="gm-tab-panel" className="mn-focus" onClick={() => choose(id)}>
              <GuessIcon name={icon} size={16} />
              {tr(`tabs.${id}`)}
            </button>
          ))}
        </div>
      )}
      <div id="gm-tab-panel" role="tabpanel" aria-labelledby={`gm-tab-${tab}`} className="gm-stack" style={{ gap: 16 }}>
        {tab === "daily" ? (
          <DailyChallenge locale={locale} songs={songs} onPlayingChange={setPlaying} onPlayFree={() => choose("free")} />
        ) : (
          <FreePlayTool locale={locale} songs={songs} servers={servers} onPlayingChange={setPlaying} />
        )}
      </div>
    </div>
  );
}
