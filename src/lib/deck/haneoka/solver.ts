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
interface EngineHit { members: string[]; snaps: (string | null)[]; power: number; key: number; skipScore?: number; score?: { orders: number[]; mean?: number } | null; event?: { mean: number; rewardSum: number; orders: number } }
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
    const reward = ["eventPoints", "eventItems", "challengePoints"].includes(request.metric?.kind ?? "");
    const settlement = hit.event;
    if (reward && (!settlement || !Number.isSafeInteger(settlement.rewardSum) || !Number.isSafeInteger(settlement.orders) || settlement.orders < 1))
      throw new Error("haneoka-reward-certificate");
    const pair = (i: number) => ({ member: members[i], snap: snaps[i] });
    return {
      rank: index + 1, rankCertified: proven, leader: pair(0), others: [1, 2, 3, 4].map(pair),
      power: hit.power, value: { score: request.goal.kind === "skip" ? hit.skipScore! : reward ? hit.score!.mean! : hit.key, exact: null, interval: null,
        payoff: reward ? { score: settlement!.mean, exact: { numerator: String(settlement!.rewardSum), denominator: String(settlement!.orders) }, interval: null } : null }, orders: values,
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
    engine!.onProgress = value => {
      const now = performance.now();
      if (!progress || now - last < intervalMs) return;
      last = now;
      const hits = (value.hits ?? []) as EngineHit[];
      progress(answer({ overall: hits, results: [], elapsedMs: performance.now() - started }, request, box.coversAllOwnedCards, false));
    };
    try {
      const response = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: converted.charts,
        request: { ...converted, ...(converted.timeLimitMs === null ? {} : { deadline: performance.timeOrigin + started + converted.timeLimitMs }), members: box.members, snaps: box.snaps, player: box.player, unknownPolicy: "min" } }, true);
      response.elapsedMs = performance.now() - started;
      return answer(response, request, box.coversAllOwnedCards, true);
    } finally { engine!.onProgress = null; }
  }
  free() { engine!.invoke({ op: "dispose", handle: this.handle }); }
}
