import { parseRequest } from "./clock";
import { adaptData, type DeckData } from "./data";
import { adaptAccount, type AccountInput } from "./account";
import { adaptRequest, CAPABILITIES, HANEOKA_COMMIT, HANEOKA_PATCH_SHA, type RecommendationRequest } from "./request";
import { HaneokaWasm } from "./wasm";
let engine: HaneokaWasm | null = null;
export default async function init(options: { module_or_path: BufferSource }) {
  engine = await HaneokaWasm.create(options.module_or_path);
}
function orders(): number[][] {
  const result: number[][] = [];
  function visit(order: number[]) {
    if (order.length === 5) { result.push(order); return; }
    for (let i = 0; i < 5; i++) if (!order.includes(i)) visit([...order, i]);
  }
  visit([]); return result;
}
const ORDERS = orders();
function id(key: string): number { return Number(key.slice(1)); }
interface EngineHit { members: string[]; snaps: (string | null)[]; power: number; key: number; skipScore?: number; score?: { orders: number[]; mean?: number } | null; event?: { mean: number; rewardSum: number | string; orders: number }; levels?: { sum: string; terms: string[] }[] }
interface EngineResponse { results: { proven: boolean; bound: number | null }[]; overall: EngineHit[]; elapsedMs: number | null }
function answer(response: EngineResponse, request: RecommendationRequest, coversAllOwnedCards: boolean, final: boolean) {
  const rows = response.results ?? [];
  const proven = final && rows.length > 0 && rows.every(row => row.proven === true);
  const teams = (response.overall ?? []).map((hit, index) => {
    const members: number[] = hit.members.map(id), snaps: (number | null)[] = hit.snaps.map((key: string | null) => key === null ? null : id(key));
    const scores: number[] = hit.score?.orders ?? [];
    const ranked = scores.map((score, i) => ({ score, order: ORDERS[i]!.map(slot => members[slot]) })).sort((a, b) => a.score - b.score);
    const values = ranked.length === 120 ? { count: 120, min: ranked[0], median: {
      score: (ranked[59]!.score + ranked[60]!.score) / 2, order: ranked[59]!.score === ranked[60]!.score ? ranked[59]!.order : [],
    }, max: ranked[119] } : null;
    const reward = ["eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind ?? "");
    const combined = request.metric?.kind === "combined";
    const settlement = hit.event;
    if (reward && (!settlement || !(typeof settlement.rewardSum === "number" ? Number.isSafeInteger(settlement.rewardSum) : combined && /^-?\d+$/.test(settlement.rewardSum)) || !Number.isSafeInteger(settlement.orders) || settlement.orders < 1))
      throw new Error("haneoka-reward-certificate");
    const payoff = (sum: number | string) => ({ score: Number(sum) / settlement!.orders,
      exact: { numerator: String(sum), denominator: String(settlement!.orders) }, interval: null });
    const pair = (i: number) => ({ member: members[i], snap: snaps[i] });
    return {
      rank: index + 1, rankCertified: proven, leader: pair(0), others: [1, 2, 3, 4].map(pair),
      power: hit.power, value: { score: request.goal.kind === "skip" ? hit.skipScore! : reward ? hit.score!.mean! : hit.key, exact: null, interval: null,
        payoff: reward ? payoff(settlement!.rewardSum) : null }, orders: values,
      ...(combined ? { levels: hit.levels!.map(level => ({ value: payoff(level.sum), terms: level.terms.map(payoff) })) } : {}),
      bestOrder: values?.max ?? null,
      layout: { members: [members[1], members[2], members[0], members[3], members[4]],
        snaps: [snaps[1], snaps[2], snaps[0], snaps[3], snaps[4]] },
    };
  });
  const bound = rows.length === 1 && Number.isFinite(rows[0]!.bound) ? rows[0]!.bound : null;
  return JSON.stringify({
    format: "ournotes-deck.account-recommendation/1", status: "ok", final, missing: [], errors: [],
    engine: { name: "Haneoka", commit: HANEOKA_COMMIT, patchSha256: HANEOKA_PATCH_SHA, source: "https://github.com/haneoka-gakuen/ournotes-team-builder" },
    result: { phase: proven ? "done" : "search", elapsedMs: response.elapsedMs ?? null, teams,
      account: { cards: { coversAllOwnedCards } },
      optimality: { proven, lowerBound: teams[0]?.value.payoff?.score ?? teams[0]?.value.score ?? null, upperBound: bound, fraction: null },
      goal: request.goal, metric: request.metric ?? { kind: "power" }, aggregation: request.aggregation ?? "expected",
      exitReason: final && !proven ? "timeLimit" : proven ? "complete" : null },
  });
}
/** The existing Moenotes Worker supplies its already verified dataset hash alongside the unchanged dataset bytes. */
export class DeckSolver {
  readonly datasetId: string;
  private readonly data: DeckData;
  private readonly handle: number;
  constructor(bytes: Uint8Array, options: { datasetId: string }) {
    if (!engine) throw new Error("haneoka-not-initialized");
    this.datasetId = options.datasetId;
    this.data = JSON.parse(new TextDecoder().decode(bytes));
    this.handle = engine.invoke<{ handle: number }>({ op: "create", data: adaptData(this.data, this.datasetId) }).handle;
  }
  capabilities() { return JSON.stringify(CAPABILITIES); }
  recommend(accountJson: string, requestJson: string, progress?: (json: string) => void, intervalMs = 250): string {
    const started = performance.now();
    const account = JSON.parse(accountJson) as AccountInput;
    let request: RecommendationRequest;
    let converted: ReturnType<typeof adaptRequest>;
    try { request = parseRequest(requestJson); converted = adaptRequest(this.data, request); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("haneoka-")) throw error;
      return JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "invalid", missing: [],
        errors: [{ path: "request", code: "unsupported_request", message: error.message }], result: null });
    }
    const box = adaptAccount(this.data, account, request, this.datasetId);
    if (box.missing.length || box.errors.length) return JSON.stringify({
      format: "ournotes-deck.account-recommendation/1", final: true,
      status: box.errors.length ? "invalid" : "incomplete", missing: box.missing, errors: box.errors, result: null,
    });
    let last = -Infinity;
    const deadline = converted.timeLimitMs === null ? Infinity : performance.timeOrigin + started + converted.timeLimitMs;
    const warm: EngineHit[] = [];
    const mergeWarm = (hits: EngineHit[]) => {
      if (!warm.length) return hits;
      const rosters = new Map<string, EngineHit>();
      for (const hit of [...warm, ...hits]) {
        const key = [...hit.members].sort().join("|");
        if (!rosters.has(key) || hit.key > rosters.get(key)!.key) rosters.set(key, hit);
      }
      return [...rosters.values()].sort((a, b) => b.key - a.key).slice(0, converted.k);
    };
    engine!.onProgress = value => {
      const now = performance.now();
      if (!progress || now - last < intervalMs) return;
      last = now;
      const hits = mergeWarm((value.hits ?? []) as EngineHit[]);
      progress(answer({ overall: hits, results: [], elapsedMs: performance.now() - started }, request, box.coversAllOwnedCards, false));
    };
    try {
      const prepared: ReturnType<typeof adaptRequest> & { members: typeof box.members; snaps: typeof box.snaps; player: typeof box.player;
        unknownPolicy: string; deadline?: number; seeds?: EngineHit[] } = { ...converted, ...(Number.isFinite(deadline) ? { deadline } : {}),
        members: box.members, snaps: box.snaps, player: box.player, unknownPolicy: "min" };
      if (request.goal.kind === "freeLive" && request.metric?.kind === "combined"
        && performance.timeOrigin + performance.now() < deadline) {
        const proposals = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: converted.charts,
          request: { ...prepared, goal: { kind: "score", songs: converted.goal.songs, criterion: "max", play: converted.goal.play },
            deadline: Math.min(deadline, performance.timeOrigin + performance.now() + 100) } });
        prepared.seeds = proposals.overall.flatMap(team => converted.constraints.leader !== null ? [team]
          : team.members.map((_, leader) => {
            const order = [leader, ...[0, 1, 2, 3, 4].filter(slot => slot !== leader)];
            return { ...team, members: order.map(slot => team.members[slot]!), snaps: order.map(slot => team.snaps[slot]!) };
          }));
      }
      if (converted.goal.kind === "gekiso" && performance.timeOrigin + performance.now() < deadline) {
        const song = converted.charts[0]!.song;
        const proposals = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: converted.charts,
          request: { ...prepared, goal: { kind: "power", song, challengeEventId: null },
            deadline: Math.min(deadline, performance.timeOrigin + performance.now() + 100) } });
        for (const team of proposals.overall.slice(0, 1)) {
          if (performance.timeOrigin + performance.now() >= deadline) break;
          const preview = engine!.invoke<{ evaluations: { power: number; score: { mean: number; max: number; orders: number[] } }[] }>({
            op: "evaluateAll", handle: this.handle, charts: converted.charts, request: { ...prepared,
              team: { members: team.members, snaps: team.snaps, leader: team.members[0] }, songs: converted.goal.songs,
              gekiso: { accuracy: converted.goal.accuracy, rank: 1, seeds: 0 }, event: null } }).evaluations[0]!;
          warm.push({ ...team, power: preview.power, score: preview.score,
            key: converted.goal.criterion === "max" ? preview.score.max : preview.score.mean });
          if (progress && warm.length && performance.now() - last >= intervalMs) {
            last = performance.now();
            progress(answer({ results: [], overall: mergeWarm([]), elapsedMs: performance.now() - started }, request, box.coversAllOwnedCards, false));
          }
        }
        prepared.seeds = warm;
      }
      const response = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: converted.charts,
        request: prepared }, true);
      response.overall = mergeWarm(response.overall);
      response.elapsedMs = performance.now() - started;
      return answer(response, request, box.coversAllOwnedCards, true);
    } catch (error) {
      if (!(error instanceof Error) || !["combined-reward-levels", "combined-reward-range", "combined-item-lottery", "skip-score-nonmonotone"].includes(error.message)) throw error;
      return JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "invalid", missing: [],
        errors: [{ path: "request", code: "unsupported_request", message: error.message }], result: null });
    } finally { engine!.onProgress = null; }
  }
  free() { engine!.invoke({ op: "dispose", handle: this.handle }); }
}
