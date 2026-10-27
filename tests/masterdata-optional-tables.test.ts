import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptData, optionalTable, type ColumnarTable, type DeckData } from "../src/lib/deck/haneoka/data";
import { adaptRequest } from "../src/lib/deck/haneoka/request";
import { state as buildCoreState } from "../src/lib/masterdata/build-core";
import { gachaDetailsOn, getBuildDeckArenas } from "../src/lib/masterdata/build-data";

const REQUIRED_GACHA_TABLES = [
  "MasterBand.json",
  "MasterCharacter.json",
  "MasterDegree.json",
  "MasterGacha.json",
  "MasterGachaBonus.json",
  "MasterGachaBonusLot.json",
  "MasterGachaGimmick.json",
  "MasterGachaLot.json",
  "MasterGachaPrize.json",
  "MasterGachaProduct.json",
  "MasterGachaStepUp.json",
  "MasterGachaView.json",
  "MasterHomeSpot.json",
  "MasterItem.json",
  "MasterLiveMusic.json",
  "MasterLiveMusicCategory.json",
  "MasterLiveMusicScore.json",
  "MasterLiveMusicTag.json",
  "MasterMemberCard.json",
  "MasterSound.json",
  "MasterSoundCueSheet.json",
  "MasterStamp.json",
  "MasterSupportCard.json",
  "MasterText.json",
] as const;

const HANEOKA_TABLES: Record<string, string[]> = {
  MasterCharacter: ["_id", "_bandID", "_isNonPlayable"],
  MasterMemberCard: ["_id", "_characterID", "_memberCardLevelGroup", "_memberCardAwakeGroup", "_memberCardRankGroup",
    "_leaderSkillID", "_liveSkillID", "_gekisouSkillID", "_performancePowerMax", "_technicPowerMax", "_visualPowerMax"],
  MasterSupportCard: ["_id", "_characterIDs", "_supportCardLevelGroup", "_supportCardRankGroup",
    "_supportSkillId01", "_supportSkillId02", "_gekisouSupportSkillId01", "_gekisouSupportSkillId02"],
  MasterLeaderSkillEffect: ["_leaderSkillID"],
  MasterLiveSkill: [],
  MasterLiveSkillEffect: ["_liveSkillID"],
  MasterSupportSkill: [],
  MasterSupportSkillEffect: ["_supportSkillID"],
  MasterGekisouSkill: [],
  MasterGekisouSkillEffect: ["_gekisouSkillID"],
  MasterGekisouSupportSkill: [],
  MasterGekisouSupportSkillEffect: ["_gekisouSupportSkillID"],
  MasterLiveMusicScore: ["_id", "_musicScoreLevel", "_fullComboCount"],
  MasterLiveMusic: ["_id", "_musicType", "_bestMusicTagIDs", "_liveScoreRankGroup"],
  MasterEventEffect: ["_eventId"],
  MasterLiveEventPoint: [],
  MasterChallengeLiveEventPoint: [],
  MasterLiveEventReward: [],
  MasterChallengeLiveEventReward: [],
  MasterEvent: [],
  MasterMemberCardLevel: [],
  MasterMemberCardAwake: [],
  MasterMemberCardRank: [],
  MasterMemberCardLevelLimit: [],
  MasterSupportCardLevel: [],
  MasterSupportCardRank: [],
  MasterCharacterRank: [],
  MasterCharacterTotalRank: [],
  MasterSkillTarget: [],
  MasterSkillCondition: [],
  MasterSkillConditionSet: [],
  MasterSkillCumulativeCondition: [],
  MasterSkillEffectSetting: [],
  MasterLiveSettings: [],
  MasterLiveScoreRank: [],
  MasterLiveNoteParameter: [],
  MasterLiveJudgementParameter: [],
  MasterLiveJudgementTiming: [],
  MasterLiveComboScoreBonus: [],
  MasterLiveMusicBoostBonus: [],
  MasterChallengeMusicBoostBonus: [],
  MasterLiveGekisouRankingScoreBonus: [],
  MasterLiveGekisouLuckBasePoint: [],
  MasterLiveGekisouLuckBonusLot: [],
  MasterParameter: [],
  MasterVip: [],
  MasterVipRankBonus: [],
  MasterMemoryMemberLevel: [],
  MasterMemorySupportLevel: [],
  MasterMemoryMusic: [],
  MasterMemoryMusicBonus: [],
  MasterMemoryMusicGroup: [],
  MasterBandItemSkillEffect: ["_bandItemId", "_level"],
  MasterBandItem: [],
  MasterChallengeMusic: [],
  MasterLiveChallengePoint: [],
};

function minimalDeckData(extraMaster: Record<string, ColumnarTable> = {}): DeckData {
  const master = Object.fromEntries(
    Object.entries(HANEOKA_TABLES).map(([name, columns]) => [name, { columns, rows: [] }]),
  );
  return {
    format: "nnnotes.deck-data/1",
    provenance: { region: "tw", deck: { commit: "0123abcd" }, replay: { musicLengthsMs: {} } },
    master: { ...master, ...extraMaster },
    charts: [],
  };
}

describe("retired 1.1.0.100 MasterData tables", () => {
  test("build gacha details and deck arenas fall back to empty lists without MasterGachaViewLabel or MasterArenaMusic", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moenotes-md-110-"));
    const regionDir = join(dir, "hk-tw-mo");
    mkdirSync(regionDir, { recursive: true });
    for (const file of REQUIRED_GACHA_TABLES) {
      writeFileSync(join(regionDir, file), JSON.stringify({ _allData: [] }));
    }
    writeFileSync(join(regionDir, "MasterGacha.json"), JSON.stringify({
      _allData: [{
        _id: 1, _nameTextId: "", _descriptionTextId: "", _lotGroupId: 1, _startAt: "", _endAt: "",
        _priority: 1, _isLimited: false, _bannerAssetName: "", _logoAssetName: "", _viewLabelId: 3,
      }],
    }));

    const prevDir = process.env.MOENOTES_MASTERDATA_DIR;
    const prevServers = process.env.MOENOTES_SERVERS;
    const snapshotKey = Symbol.for("moenotes.masterdata.build-snapshot");
    const serversKey = Symbol.for("moenotes.masterdata.build-servers");
    const globals = globalThis as Record<symbol, unknown>;
    const snapshotState = globals[snapshotKey] as { manifest?: unknown; index?: unknown; tables: Map<string, unknown> } | undefined;
    const prevBuildServers = globals[serversKey];
    const clearCaches = () => {
      if (snapshotState) {
        delete snapshotState.manifest;
        delete snapshotState.index;
        snapshotState.tables.clear();
      }
      buildCoreState.tables.clear();
      buildCoreState.selectors.clear();
    };

    try {
      process.env.MOENOTES_MASTERDATA_DIR = dir;
      process.env.MOENOTES_SERVERS = "tw";
      delete globals[serversKey];
      clearCaches();

      const gachas = await gachaDetailsOn("tw", "en-US");
      expect(gachas).toHaveLength(1);
      expect(gachas[0]?.viewLabel).toBe("");

      const arenas = await getBuildDeckArenas();
      expect(arenas).toEqual([{ server: "tw", songs: [] }]);
    } finally {
      if (prevDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
      else process.env.MOENOTES_MASTERDATA_DIR = prevDir;
      if (prevServers === undefined) delete process.env.MOENOTES_SERVERS;
      else process.env.MOENOTES_SERVERS = prevServers;
      globals[serversKey] = prevBuildServers;
      clearCaches();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Haneoka adapter treats an absent MasterArenaMusic table as empty while still validating present tables", () => {
    const data = minimalDeckData();
    expect("MasterArenaMusic" in data.master).toBe(false);
    expect(optionalTable(data, "MasterArenaMusic")).toEqual([]);

    const adapted = adaptData(data, "a".repeat(64));
    expect(adapted.songs).toEqual({});

    expect(() => adaptRequest(data, {
      format: "ournotes-deck.recommendation-request/2",
      goal: { kind: "arenaLive", arenaMusicId: 7, difficulty: "expert" },
      k: 1,
    })).toThrow("haneoka-arena-song");

    const malformed = minimalDeckData({ MasterArenaMusic: { columns: ["_id", "_id"], rows: [] } });
    expect(() => optionalTable(malformed, "MasterArenaMusic")).toThrow("haneoka-table:MasterArenaMusic");
  });
});
