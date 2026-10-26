import { rewardActive } from "./clock";
import { chartSource, integer, table, type DeckData } from "./data";
export interface RewardTermInput { kind: string; eventId?: number; resourceType?: number; resourceId?: number; weight: number }
export interface RecommendationRequest {
  format: string;
  goal: { kind: string; rank?: number; eventParameter?: boolean; musicId?: number; difficulty?: string; challengeMusicId?: number;
    play?: { kind?: string; greatFraction?: number; justFraction?: number; missEvery?: number };
    accuracy?: { greatFraction?: number; justFraction?: number } };
  metric?: { kind: string; eventId?: number; consumption?: number; resourceType?: number; resourceId?: number; secondaryPriority?: string; levels?: RewardTermInput[][] };
  eventContext?: { rewardProjection?: boolean; resultClock?: { kind?: string; liveStartJstTicks?: number | null; serverNowJstTicks?: number | string } };
  aggregation?: "expected" | "maximum";
  eventIds?: number[];
  constraints?: { leader?: number | null; includeMembers?: (number | string)[]; excludeMembers?: (number | string)[];
    excludeSnaps?: (number | string)[]; noSnaps?: boolean };
  k: number;
  limits?: { timeLimitMs: number | null };
}
export const HANEOKA_COMMIT = "c91e6459a5ed43d55dc2b75e6a9d4f55b3edc62a";
export const HANEOKA_PATCH_SHA = "60260764a11f928f303b679e1af3d2b8b8c68c4da75f538785da81a1b180c5ee";
export const CAPABILITIES = {
  goals: ["power", "freeLive", "challengeLive", "battleLive", "missionLive", "skip"],
  metrics: { freeLive: ["score", "eventPoints", "eventItems", "challengePoints"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score"], missionLive: ["score"], skip: ["score", "eventPoints", "eventItems", "challengePoints"] },
  aggregations: {
    expected: { freeLive: ["score", "eventPoints", "eventItems", "challengePoints"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score"], missionLive: ["score"], skip: ["score", "eventPoints", "eventItems", "challengePoints"] },
    maximum: { freeLive: ["score", "eventPoints", "eventItems"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score"], missionLive: ["score"], skip: ["score", "eventPoints", "eventItems", "challengePoints", "combined"] },
  },
  combinedMetric: { kind: "combined", objective: "lexicographicWeightedExpectedSums", weights: "integer", maxLevels: 3, maxTerms: 9, maxWeight: 1_000_000_000 },
  eventItemRewards: { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 },
  accuracy: { great: true, just: true }, patternPlay: true, luckMissions: true, luckGreatConversions: true,
};
export function adaptRequest(data: DeckData, request: RecommendationRequest) {
  if (request.format !== "ournotes-deck.recommendation-request/2" || !CAPABILITIES.goals.includes(request.goal?.kind)
    || ![undefined, "score", "eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind) || ![undefined, "expected", "maximum"].includes(request.aggregation))
    throw new Error("haneoka-unsupported-request");
  const timeLimitMs = request.limits?.timeLimitMs ?? null;
  if (timeLimitMs !== null && (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0)) throw new Error("haneoka-budget");
  const kind: string = request.goal.kind;
  const rewards = ["eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind ?? "");
  const skip = kind === "skip";
  if (rewards && (!["freeLive", "challengeLive", "skip"].includes(kind) || request.aggregation === "maximum" && !skip && !["eventPoints", "eventItems"].includes(request.metric!.kind)))
    throw new Error("haneoka-unsupported-reward-scene");
  const gekiso = ["battleLive", "missionLive"].includes(kind);
  if (gekiso && request.goal.rank !== undefined && request.goal.rank !== 1) throw new Error("haneoka-unsupported-rank");
  const parameterEvents = kind === "power" && request.goal.eventParameter ? request.eventIds ?? [] : [];
  if (parameterEvents.length > 1 || parameterEvents.some(id => !table(data, "MasterEvent").some(event => event.id === id)))
    throw new Error("haneoka-power-event");
  const difficulty = ["easy", "normal", "hard", "expert"].indexOf(request.goal.difficulty ?? "");
  let musicId: unknown = request.goal.musicId, challengeEventId: number | null = null;
  if (kind === "challengeLive" || skip && request.goal.challengeMusicId !== undefined) {
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
  const scoreGoal = kind === "power" || skip && !rewards ? { kind: skip ? "skip-score" as const : "power" as const, song, challengeEventId,
    ...(parameterEvents.length ? { parameterEventId: parameterEvents[0] }
      : skip && challengeEventId !== null && request.eventIds?.includes(challengeEventId) ? { parameterEventId: challengeEventId } : {}) }
    : gekiso ? { kind: "gekiso" as const, songs: [song], criterion, rank: 1, seeds: 0, accuracy: {
      great, just: great === 1 ? 0 : just / (1 - great), missEvery: play.missEvery ?? 0,
    } }
      : { kind: "score" as const, songs: [song], criterion, challengeEventId, play: {
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
  // Projection keeps the reference event window and excludes persisted balances.
  const skip = request.goal.kind === "skip";
  if (context?.rewardProjection !== true || context.resultClock?.kind !== (skip ? "skip" : "played")
    || !skip && context.resultClock.liveStartJstTicks !== null || context.resultClock.serverNowJstTicks === undefined || metric.secondaryPriority !== undefined)
    throw new Error("haneoka-reward-context");
  const combined = metric.kind === "combined", levels = combined ? metric.levels : null;
  if (combined && (!Array.isArray(levels) || levels.length < 1 || levels.length > 3 || levels.flat().length > 9
    || levels.some(level => !Array.isArray(level) || !level.length || level.some(term => !term
      || !["eventPoints", "eventItems", "challengePoints"].includes(term.kind)
      || !Number.isSafeInteger(term.weight) || term.weight < 1 || term.weight > 1_000_000_000))))
    throw new Error("haneoka-combined-levels");
  if (combined && (metric.eventId !== undefined || metric.resourceType !== undefined || metric.resourceId !== undefined))
    throw new Error("haneoka-combined-fields");
  const terms = levels ? levels.flat() : [metric];
  const eventId = integer(terms[0]!.eventId, "eventId");
  if (terms.some(term => term.eventId !== eventId)) throw new Error("haneoka-combined-events");
  const event = table(data, "MasterEvent").find(row => row.id === eventId);
  if (!event || request.eventIds?.length !== 1 || request.eventIds[0] !== eventId
    || challengeEventId !== null && challengeEventId !== eventId) throw new Error("haneoka-reward-event");
  const consumption = integer(metric.consumption, "consumption"), challenge = challengeEventId !== null;
  if (!(challenge ? [200, 400, 800, 1600] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).includes(consumption))
    throw new Error("haneoka-unsupported-reward-consumption");
  const costField = challenge ? "consumedChallengePointCount" : "consumedLiveBoostCount";
  const boosts = table(data, challenge ? "MasterChallengeMusicBoostBonus" : "MasterLiveMusicBoostBonus",
    [costField, "eventPointRate", "liveMusicRewardRate"]).filter(row => row[costField] === consumption);
  if (consumption > 0 && boosts.length !== 1) throw new Error("haneoka-reward-boost-data");
  let skipRank: number | null = null;
  if (skip) {
    const parameter = table(data, "MasterParameter").find(row => row.id === "live_skip_result_score_rank");
    if (parameter?.type !== "String" || typeof parameter.value !== "string") throw new Error("haneoka-unsupported-skip-rank");
    const trim = (value: string) => value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
    const value = trim(parameter.value), names = ["None", "E", "D", "C", "B", "A", "S", "SS"];
    if (/^[+-]?\d+$/.test(value)) {
      const parsed = Number(value);
      skipRank = Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : 0;
    } else {
      const ranks = value.split(",").map(name => names.indexOf(trim(name)));
      skipRank = ranks.includes(-1) ? 0 : ranks.reduce((rank, next) => rank | next, 0);
    }
  }
  if (terms.some(term => term.kind === "challengePoints")) {
    if (challenge) throw new Error("haneoka-challenge-spends-cp");
    const rows = table(data, "MasterLiveChallengePoint", ["scoreRank", "value"]);
    if (!rows.length || new Set(rows.map(row => row.scoreRank)).size !== rows.length
      || skipRank !== null && !rows.some(row => row.scoreRank === skipRank)) throw new Error("haneoka-reward-cp-table");
  }
  if (terms.some(term => term.kind === "eventPoints")) {
    const rows = table(data, challenge ? "MasterChallengeLiveEventPoint" : "MasterLiveEventPoint", ["group", "scoreRank", "value"])
      .filter(row => row.group === event[challenge ? "challengeLiveEventPointGroup" : "liveEventPointGroup"]);
    if (!rows.length || new Set(rows.map(row => row.scoreRank)).size !== rows.length
      || skipRank !== null && !rows.some(row => row.scoreRank === skipRank)) throw new Error("haneoka-reward-point-table");
  }
  const items = terms.filter(term => term.kind === "eventItems");
  if (items.length) {
    if (items.some(term => term.resourceType !== 1 || term.resourceId !== event.eventItemId || !term.resourceId))
      throw new Error("haneoka-reward-item");
    const group = event[challenge ? "challengeLiveEventRewardGroup" : "liveEventRewardGroup"];
    const rows = table(data, challenge ? "MasterChallengeLiveEventReward" : "MasterLiveEventReward",
      ["eventGroup", "scoreRank", "probability", "resourceType", "resourceId", "resourceCount"])
      .filter(row => row.eventGroup === group);
    const grades = new Set(rows.map(row => row.scoreRank));
    if (!rows.length || grades.size !== rows.length || skipRank !== null && !grades.has(skipRank) || rows.some(row => row.probability !== 10000
      || row.resourceType !== 1 || row.resourceId !== event.eventItemId)) throw new Error("haneoka-reward-item-table");
  }
  return { kind: "event" as const, route: skip ? "skip" : challenge ? "challenge" : "live", eventId, consumption, songs: [song],
    measure: combined ? "combined" : metric.kind === "eventItems" ? "items" : metric.kind === "challengePoints" ? "challenge-points" : "points",
    levels: levels?.map(level => level.map(term => ({ kind: ["eventPoints", "eventItems", "challengePoints"].indexOf(term.kind), weight: term.weight }))),
    criterion: request.aggregation === "maximum" ? "max" : "mean",
    rewardSemantics: "moenotes-v1", rewardActive: rewardActive(event.startAt, event.endAt, context.resultClock!.serverNowJstTicks!), challengeEventId, play };
}
