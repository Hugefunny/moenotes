import { chartSource, integer, table, type DeckData } from "./data";
export interface RecommendationRequest {
  format: string;
  goal: { kind: string; rank?: number; eventParameter?: boolean; musicId?: number; difficulty?: string; challengeMusicId?: number;
    play?: { kind?: string; greatFraction?: number; justFraction?: number; missEvery?: number };
    accuracy?: { greatFraction?: number; justFraction?: number } };
  metric?: { kind: string };
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
  metrics: { freeLive: ["score"], challengeLive: ["score"], battleLive: ["score"], missionLive: ["score"] },
  aggregations: {
    expected: { freeLive: ["score"], challengeLive: ["score"], battleLive: ["score"], missionLive: ["score"] },
    maximum: { freeLive: ["score"], challengeLive: ["score"], battleLive: ["score"], missionLive: ["score"] },
  },
  accuracy: { great: true, just: true }, patternPlay: true, luckMissions: true, luckGreatConversions: true,
};
export function adaptRequest(data: DeckData, request: RecommendationRequest) {
  if (request.format !== "ournotes-deck.recommendation-request/2" || !CAPABILITIES.goals.includes(request.goal?.kind)
    || request.metric && request.metric.kind !== "score" || ![undefined, "expected", "maximum"].includes(request.aggregation))
    throw new Error("haneoka-unsupported-request");
  const timeLimitMs = request.limits?.timeLimitMs ?? null;
  if (timeLimitMs !== null && (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0)) throw new Error("haneoka-budget");
  const kind: string = request.goal.kind;
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
  const goal = kind === "power" ? { kind: "power", song, challengeEventId: null }
    : gekiso ? { kind: "gekiso", songs: [song], criterion, rank: 1, seeds: 0, accuracy: {
      great, just: great === 1 ? 0 : just / (1 - great), missEvery: play.missEvery ?? 0,
    } }
      : { kind: "score", songs: [song], criterion, challengeEventId, play: {
        kind: "custom", great, good: 0, bad: 0, miss: 0, missEvery: play.missEvery ?? 0,
      } };
  const key = (id: unknown, prefix: string) => prefix + integer(typeof id === "string" ? Number(id) : id, "constraint");
  const c = request.constraints ?? {};
  return {
    goal, charts,
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
