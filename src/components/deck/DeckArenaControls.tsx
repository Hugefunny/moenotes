import { useId } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  ARENA_BAND_IDS,
  ARENA_MISSION_TYPES,
  ARENA_MUSIC_TYPES,
  effectiveArenaSongRule,
  type DeckArenaCatalog,
  type DeckArenaMissions,
  type DeckArenaMode,
  type DeckArenaPeriod,
  type DeckArenaRule,
  type DeckArenaRuleSource,
} from "@/lib/deck/arena";
import type { MusicViewModel } from "@/lib/music/data";
import { MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";

export interface DeckArenaSongEntry {
  musicId: number;
  difficulty: MusicDifficulty;
}

export interface DeckArenaControlsProps {
  locale: AppLocale;
  catalog: DeckArenaCatalog;
  period: DeckArenaPeriod;
  rule: DeckArenaRule | null;
  ruleSource: DeckArenaRuleSource;
  leagueId: number;
  customBandId: number;
  customMusicType: number;
  customMissions: DeckArenaMissions;
  mode: DeckArenaMode;
  canChooseMode: boolean;
  allSongs: boolean;
  entries: readonly DeckArenaSongEntry[];
  eligibleSongs: readonly MusicViewModel[];
  bandNames: ReadonlyMap<number, string>;
  formatEnd: (endAt: string) => string;
  onRuleSourceChange: (source: DeckArenaRuleSource) => void;
  onLeagueChange: (leagueId: number) => void;
  onCustomBandChange: (bandId: number) => void;
  onCustomMusicTypeChange: (musicType: number) => void;
  onCustomMissionChange: (index: 0 | 1 | 2, mission: number) => void;
  onModeChange: (mode: DeckArenaMode) => void;
  onEntriesChange: (entries: DeckArenaSongEntry[]) => void;
  onOpenSongPicker: () => void;
}

export default function DeckArenaControls(props: DeckArenaControlsProps) {
  const { locale, catalog, period, rule, ruleSource, mode, entries, eligibleSongs, bandNames } = props;
  const sourceGroup = useId();
  const modeGroup = useId();
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.arena.${key}`, values);
  const bandLabel = (bandId: number) => bandNames.get(bandId) ?? tr("bandFallback", { id: bandId });
  const attributeLabel = (musicType: number) => {
    if (musicType === 0) return tr("musicTypeSongDefault");
    if (musicType === 99) return tr("musicTypeNone");
    return t(locale, `cards.attributes.${musicType}`);
  };
  const missionLabel = (mission: number) => {
    if (mission === 1) return tr("missionCombo");
    if (mission === 2) return tr("missionLuck");
    if (mission === 3) return tr("missionAccuracy");
    return tr("missionSongDefault");
  };
  const maxPool = mode === "shared" ? 5 : 20;

  function fillPool() {
    const chosen = new Set(entries.map((entry) => entry.musicId));
    const next = [...entries];
    for (const song of eligibleSongs) {
      if (next.length >= 5) break;
      if (chosen.has(song.id)) continue;
      const diff: MusicDifficulty = song.difficulties.some((d) => d.difficulty === "expert")
        ? "expert"
        : (song.difficulties.at(-1)?.difficulty ?? "expert");
      next.push({ musicId: song.id, difficulty: diff });
    }
    props.onEntriesChange(next);
  }

  return (
    <div className="dc-arena">
      <fieldset className="dc-objective">
        <legend>{tr("ruleSourceLabel")}</legend>
        <div className="dc-objective-options">
          {(["auto", "custom"] as const).map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name={sourceGroup}
                value={choice}
                checked={ruleSource === choice}
                onChange={() => props.onRuleSourceChange(choice)}
              />
              <span>{tr(choice === "auto" ? "ruleAuto" : "ruleCustom")}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {ruleSource === "auto" ? (
        <>
          <label className="dc-field">
            {tr("leagueLabel")}
            <select
              aria-label={tr("leagueLabel")}
              value={props.leagueId}
              onChange={(event) => props.onLeagueChange(Number(event.target.value))}
            >
              {catalog.leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {tr("leagueOption", { id: league.id, band: bandLabel(league.bandId) })}
                </option>
              ))}
            </select>
          </label>
          {period.season && period.regulation && rule ? (
            <div className="dc-arena-summary" role="status">
              <div className="dc-arena-summary-head">
                <strong>{tr("activeSummary", { season: period.season.name || `#${period.season.id}`, band: bandLabel(rule.bandId) })}</strong>
                <small>{tr("endsAt", { end: props.formatEnd(period.regulation.endAt) })}</small>
              </div>
              <p>
                {attributeLabel(rule.musicType)} · {rule.missions.every((m) => m === 0) ? tr("missionsSongDefault") : rule.missions.map(missionLabel).join(" / ")}
              </p>
            </div>
          ) : (
            <div className="dc-arena-summary is-inactive" role="status">
              <p>{tr("noActiveSeason")}</p>
              <Button variant="text" size="small" onClick={() => props.onRuleSourceChange("custom")}>
                {tr("useCustomAction")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="dc-arena-custom">
          <div className="dc-field-pair">
            <label className="dc-field">
              {tr("bandLabel")}
              <select
                aria-label={tr("bandLabel")}
                value={props.customBandId}
                onChange={(event) => props.onCustomBandChange(Number(event.target.value))}
              >
                {ARENA_BAND_IDS.map((bandId) => (
                  <option key={bandId} value={bandId}>
                    {bandLabel(bandId)}
                  </option>
                ))}
              </select>
            </label>
            <label className="dc-field">
              {tr("musicTypeLabel")}
              <select
                aria-label={tr("musicTypeLabel")}
                value={props.customMusicType}
                onChange={(event) => props.onCustomMusicTypeChange(Number(event.target.value))}
              >
                {ARENA_MUSIC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {attributeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dc-arena-missions">
            {([0, 1, 2] as const).map((index) => (
              <label key={index} className="dc-field">
                {tr("missionSlotLabel", { n: index + 1 })}
                <select
                  aria-label={tr("missionSlotLabel", { n: index + 1 })}
                  value={props.customMissions[index]}
                  onChange={(event) => props.onCustomMissionChange(index, Number(event.target.value))}
                >
                  {ARENA_MISSION_TYPES.map((mission) => (
                    <option key={mission} value={mission}>
                      {missionLabel(mission)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {props.canChooseMode && (
        <fieldset className="dc-objective">
          <legend>{tr("modeLabel")}</legend>
          <div className="dc-objective-options">
            {(["shared", "individual"] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name={modeGroup}
                  value={choice}
                  checked={mode === choice}
                  onChange={() => props.onModeChange(choice)}
                />
                <span>{tr(choice === "shared" ? "modeShared" : "modeIndividual")}</span>
              </label>
            ))}
          </div>
          <p>{tr(mode === "shared" ? "modeSharedNote" : "modeIndividualNote")}</p>
        </fieldset>
      )}

      {!props.allSongs && (
        <div className="dc-arena-pool">
          <div className="dc-arena-pool-head">
            <span>{tr(mode === "shared" ? "poolCountShared" : "poolCountIndividual", { n: entries.length })}</span>
            <div className="dc-arena-pool-actions">
              {entries.length < 5 && eligibleSongs.length > entries.length && (
                <Button variant="text" size="small" onClick={fillPool}>
                  {tr("fillFive")}
                </Button>
              )}
              {entries.length > 0 && (
                <Button variant="text" size="small" onClick={() => props.onEntriesChange([])}>
                  {tr("clearSongs")}
                </Button>
              )}
              <Button
                variant="tonal"
                size="small"
                disabled={!rule || entries.length >= maxPool || eligibleSongs.length === 0}
                onClick={props.onOpenSongPicker}
              >
                {tr("addSong")}
              </Button>
            </div>
          </div>

          {entries.length > 0 ? (
            <ul className="dc-arena-songs">
              {entries.map((entry, idx) => {
                const song = eligibleSongs.find((item) => item.id === entry.musicId);
                const effective = song && rule ? effectiveArenaSongRule(song, rule) : null;
                return (
                  <li key={`${entry.musicId}:${entry.difficulty}`} className="dc-arena-song">
                    {song ? (
                      <img className="dc-song-cover" src={song.jacketUrl} alt="" />
                    ) : (
                      <span className="dc-song-cover" aria-hidden="true" />
                    )}
                    <div className="dc-song-summary">
                      <strong>{song?.title ?? entry.musicId}</strong>
                      {effective && (
                        <small>
                          {attributeLabel(effective.musicType)} · {effective.missions.map(missionLabel).join(" / ")}
                        </small>
                      )}
                    </div>
                    <select
                      className="dc-arena-diff"
                      aria-label={`${song?.title ?? entry.musicId} ${t(locale, "deckWorkspace.difficulty")}`}
                      value={entry.difficulty}
                      onChange={(event) => {
                        const nextDiff = event.target.value as MusicDifficulty;
                        const duplicate = entries.some(
                          (other, otherIdx) => otherIdx !== idx && other.musicId === entry.musicId && other.difficulty === nextDiff,
                        );
                        if (duplicate) return;
                        props.onEntriesChange(
                          entries.map((other, otherIdx) => (otherIdx === idx ? { ...other, difficulty: nextDiff } : other)),
                        );
                      }}
                    >
                      {MUSIC_DIFFICULTIES.filter(
                        (diff) => !song || song.difficulties.some((d) => d.difficulty === diff),
                      ).map((diff) => (
                        <option key={diff} value={diff}>
                          {diff.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="dc-arena-remove"
                      aria-label={tr("removeSong")}
                      onClick={() => props.onEntriesChange(entries.filter((_, otherIdx) => otherIdx !== idx))}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dw-muted">{tr("emptyPoolHint", { band: bandLabel(rule?.bandId ?? 1) })}</p>
          )}
        </div>
      )}
    </div>
  );
}
