import type { RecommendationRequest } from "./request";

/** Keep the page's Int64 JSON tick tokens exact before they reach event-window comparisons. */
export function parseRequest(text: string): RecommendationRequest {
  const request = JSON.parse(text) as RecommendationRequest;
  const clock = request.eventContext?.resultClock;
  if (clock && typeof clock.serverNowJstTicks !== "number") throw new Error("haneoka-reward-clock");
  return JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token => /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token)) as RecommendationRequest;
}

const EPOCH_TICKS = 621355968000000000n;
/** The reference model reads canonical no-offset Master dates as JST wall-clock DateTime values. */
export function masterTicks(value: unknown): bigint | null {
  if (value === undefined || value === null || value === "" || value === "null") return null;
  if (typeof value !== "string") throw new Error("haneoka-event-date");
  const m = /^(\d{4})([-/])(\d{2})\2(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?)?$/.exec(value);
  if (!m || m[1] === "0000") throw new Error("haneoka-event-date");
  const iso = `${m[1]}-${m[3]}-${m[4]}T${m[5] ?? "00"}:${m[6] ?? "00"}:${m[7] ?? "00"}`;
  const ms = Date.parse(iso + "Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== iso) throw new Error("haneoka-event-date");
  return BigInt(ms) * 10000n + EPOCH_TICKS + BigInt((m[8] ?? "").padEnd(7, "0"));
}

export function rewardActive(start: unknown, end: unknown, raw: number | string): boolean {
  if (!/^\d+$/.test(String(raw))) throw new Error("haneoka-reward-clock");
  const now = BigInt(raw), first = masterTicks(start) ?? 0n, last = masterTicks(end);
  if (now < 0n || now > 3155378975999999999n) throw new Error("haneoka-reward-clock");
  return now >= first && (last === null || now < last);
}
