import { chartSource, integer, table, type DeckData } from "./data";
export interface RecommendationRequest {
  format: string;
  goal: { kind: string; rank?: number; eventParameter?: boolean; musicId?: number; difficulty?: string; challengeMusicId?: number;
    play?: { kind?: string; greatFraction?: number; justFraction?: number; missEvery?: number };
    accuracy?: { greatFraction?: number; justFraction?: number } };
  metric?: { kind: string; eventId?: number; consumption?: number; resourceType?: number; resourceId?: number; secondaryPriority?: string };
  eventContext?: { rewardProjection?: boolean; resultClock?: { kind?: string; liveStartJstTicks?: string | null; serverNowJstTicks?: string } };
  aggregation?: "expected" | "maximum";
  eventIds?: number[];
  constraints?: { leader?: number | null; includeMembers?: (number | string)[]; excludeMembers?: (number | string)[];
    excludeSnaps?: (number | string)[]; noSnaps?: boolean };
  k: number;
  limits?: { timeLimitMs: number | null };
}
export const HANEOKA_COMMIT = "c91e6459a5ed43d55dc2b75e6a9d4f55b3edc62a";
export const CAPABILITIES = {
  goals: ["power", "freeLive", "challengeLive", "battleLive", "missionLive"],
  metrics: { freeLive: ["score", "eventPoints", "eventItems"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score"], missionLive: ["score"] },
  aggregations: {
    expected: { freeLive: ["score", "eventPoints", "eventItems"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score"], missionLive: ["score"] },
    maximum: { freeLive: ["score"], challengeLive: ["score"], battleLive: ["score"], missionLive: ["score"] },
  },
  eventItemRewards: { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 },
  accuracy: { great: true, just: true }, patternPlay: true, luckMissions: true, luckGreatConversions: true,
};
export function adaptRequest(data: DeckData, request: RecommendationRequest) {
  if (request.format !== "ournotes-deck.recommendation-request/2" || !CAPABILITIES.goals.includes(request.goal?.kind)
    || ![undefined, "score", "eventPoints", "eventItems"].includes(request.metric?.kind) || ![undefined, "expected", "maximum"].includes(request.aggregation))
    throw new Error("haneoka-unsupported-request");
  const timeLimitMs = request.limits?.timeLimitMs ?? null;
  if (timeLimitMs !== null && (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0)) throw new Error("haneoka-budget");
  const kind: string = request.goal.kind;
  const rewards = request.metric?.kind === "eventPoints" || request.metric?.kind === "eventItems";
  if (rewards && (!["freeLive", "challengeLive"].includes(kind) || request.aggregation === "maximum"))
    throw new Error("haneoka-unsupported-reward-scene");
  const gekiso = ["battleLive", "missionLive"].includes(kind);
  if (gekiso && request.goal.rank !== undefined && request.goal.rank !== 1) throw new Error("haneoka-unsupported-rank");
  // The power API's challenge context also selects challenge-song typing. Event-only parameter goals are not equivalent.
  if (kind === "power" && request.goal.eventParameter && request.eventIds?.length) throw new Error("haneoka-unsupported-event-power");
  const difficulty = ["easy", "normal", "hard", "expert"].indexOf(request.goal.difficulty ?? "");
  let musicId: unknown = request.goal.musicId, challengeEventId: number | null = null;
  if (kind === "challengeLive") {
    const challenge = table(data, "MasterChallengeMusic").find(row => row.id === request.goal.challengeMusicId);
    if (!challenge) throw new Error("haneoka-challenge-song");
    musicId = challenge.liveMusicId; challengeEventId = integer(challenge.eventId, "eventId");
  }
  const song = musicId == null ? null : { songId: integer(musicId, "musicId"), difficulty: Math.max(0, difficulty) };
  const charts: { song: unknown; source: unknown }[] = [];
  if (kind !== "power") {
    if (!song || difficulty < 0) throw new Error("haneoka-song");
    const music = table(data, "MasterLiveMusic").find(row => row.id === musicId);
    if (!music) throw new Error("haneoka-song");
    const scoreId = integer(music[["easyID", "normalID", "hardID", "expertID"][difficulty]!], "scoreId");
    charts.push({ song, source: chartSource(data, scoreId) });
  }
  const play: { greatFraction?: number; justFraction?: number; missEvery?: number } = request.goal.play ?? request.goal.accuracy ?? {};
  const great = play.greatFraction ?? 0;
  const just = play.justFraction ?? 1;
  if (![great, just].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
    || gekiso && great + just > 1) throw new Error("haneoka-accuracy");
  const criterion = request.aggregation === "maximum" ? "max" : "mean";
  const scoreGoal = kind === "power" ? { kind: "power", song, challengeEventId: null }
    : gekiso ? { kind: "gekiso", songs: [song], criterion, rank: 1, seeds: 0, accuracy: {
      great, just: great === 1 ? 0 : just / (1 - great), missEvery: play.missEvery ?? 0,
    } }
      : { kind: "score", songs: [song], criterion, challengeEventId, play: {
        kind: "custom", great, good: 0, bad: 0, miss: 0, missEvery: play.missEvery ?? 0,
      } };
  const key = (id: unknown, prefix: string) => prefix + integer(typeof id === "string" ? Number(id) : id, "constraint");
  const c = request.constraints ?? {};
  return {
    goal: rewards ? eventGoal(data, request, song!, challengeEventId, "play" in scoreGoal ? scoreGoal.play : null) : scoreGoal, charts,
    constraints: {
      requiredMembers: (c.includeMembers ?? []).map((id: unknown) => key(id, "m")),
      excludedMembers: (c.excludeMembers ?? []).map((id: unknown) => key(id, "m")),
      requiredSnaps: [], excludedSnaps: (c.excludeSnaps ?? []).map((id: unknown) => key(id, "s")),
      leader: c.leader == null ? null : key(c.leader, "m"),
      noSnaps: c.noSnaps === true, bindings: [], minBonusPercent: null,
    },
    k: integer(request.k, "k"), timeLimitMs,
  };
}

function eventGoal(data: DeckData, request: RecommendationRequest, song: { songId: number; difficulty: number },
  challengeEventId: number | null, play: unknown) {
  const metric = request.metric!, context = request.eventContext;
  // Moenotes requests a projection of the selected event, not a time-gated game settlement.
  if (context?.rewardProjection !== true || context.resultClock?.kind !== "played"
    || context.resultClock.liveStartJstTicks !== null || typeof context.resultClock.serverNowJstTicks !== "string"
    || !/^\d+$/.test(context.resultClock.serverNowJstTicks) || metric.secondaryPriority !== undefined)
    throw new Error("haneoka-reward-context");
  const eventId = integer(metric.eventId, "eventId");
  const event = table(data, "MasterEvent").find(row => row.id === eventId);
  if (!event || request.eventIds?.length !== 1 || request.eventIds[0] !== eventId
    || challengeEventId !== null && challengeEventId !== eventId) throw new Error("haneoka-reward-event");
  const consumption = integer(metric.consumption, "consumption"), challenge = challengeEventId !== null;
  if (!(challenge ? [200, 400, 800, 1600] : [0, 1, 2, 3, 4, 5, 10]).includes(consumption))
    throw new Error("haneoka-unsupported-reward-consumption");
  const costField = challenge ? "consumedChallengePointCount" : "consumedLiveBoostCount";
  const boosts = table(data, challenge ? "MasterChallengeMusicBoostBonus" : "MasterLiveMusicBoostBonus",
    [costField, "eventPointRate", "liveMusicRewardRate"]).filter(row => row[costField] === consumption);
  if (consumption > 0 && boosts.length !== 1) throw new Error("haneoka-reward-boost-data");
  if (metric.kind === "eventPoints") {
    const rows = table(data, challenge ? "MasterChallengeLiveEventPoint" : "MasterLiveEventPoint", ["group", "scoreRank", "value"])
      .filter(row => row.group === event[challenge ? "challengeLiveEventPointGroup" : "liveEventPointGroup"]);
    if (!rows.length || new Set(rows.map(row => row.scoreRank)).size !== rows.length) throw new Error("haneoka-reward-point-table");
  }
  if (metric.kind === "eventItems") {
    if (metric.resourceType !== 1 || metric.resourceId !== event.eventItemId || !metric.resourceId)
      throw new Error("haneoka-reward-item");
    const group = event[challenge ? "challengeLiveEventRewardGroup" : "liveEventRewardGroup"];
    const rows = table(data, challenge ? "MasterChallengeLiveEventReward" : "MasterLiveEventReward",
      ["eventGroup", "scoreRank", "probability", "resourceType", "resourceId", "resourceCount"])
      .filter(row => row.eventGroup === group);
    const grades = new Set(rows.map(row => row.scoreRank));
    if (!rows.length || grades.size !== rows.length || rows.some(row => row.probability !== 10000
      || row.resourceType !== 1 || row.resourceId !== metric.resourceId)) throw new Error("haneoka-reward-item-table");
  }
  return { kind: "event", route: challenge ? "challenge" : "live", eventId, consumption, songs: [song],
    measure: metric.kind === "eventItems" ? "items" : "points", play };
}
