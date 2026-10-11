import { normalizeAnswer } from "./answer";
import { createRandom } from "./random";
import type { GuessSong } from "./songs";

/** Seconds skipped at the start of a track: the full tracks start almost at once, but a clip should not open on a breath. */
export const CLIP_LEAD_IN_SECONDS = 1;
/** Seconds kept clear at the end of the track, so a clip never runs into the fade-out. */
export const CLIP_TAIL_PADDING_SECONDS = 3;

export interface RoundSpec {
  index: number;
  musicId: number;
  /** Where the clip starts within the playable range, 0..1; resolved once the duration is known. */
  startFraction: number;
  /** Choice mode: the shuffled options, answer included. Empty for typing modes. */
  optionIds: number[];
}

export interface BuildRoundsOptions {
  seed: string;
  rounds: number;
  /** Options per question for choice mode; 0 for the typing modes. */
  optionsCount: number;
}

export function requiredPoolSize(rounds: number, optionsCount: number): number {
  return Math.max(rounds, optionsCount);
}

/**
 * The questions of a game, fully determined by the seed and the pool. Songs and clip positions do not depend on the
 * answer mode or clip length, so the same seed plays the same songs at every difficulty.
 */
export function buildRounds(pool: readonly GuessSong[], { seed, rounds, optionsCount }: BuildRoundsOptions): RoundSpec[] {
  if (pool.length < requiredPoolSize(rounds, optionsCount)) return [];
  const picked = createRandom(`${seed}|songs`).sample(pool, rounds);
  const titleKey = (song: GuessSong) => normalizeAnswer(song.titleJa || song.title) || `#${song.id}`;

  return picked.map((song, index) => {
    const startFraction = createRandom(`${seed}|round|${index}|${song.id}`).next();
    let optionIds: number[] = [];
    if (optionsCount > 1) {
      const optionRandom = createRandom(`${seed}|options|${index}|${song.id}`);
      const answerTitle = titleKey(song);
      // Re-releases share a title; one of them as a distractor would be a second right answer.
      const candidates = pool.filter((other) => other.id !== song.id && titleKey(other) !== answerTitle);
      const distractors = optionRandom.sample(candidates, optionsCount - 1);
      optionIds = optionRandom.shuffle([...distractors, song]).map((option) => option.id);
    }
    return { index, musicId: song.id, startFraction, optionIds };
  });
}

/**
 * The clip start in seconds: inside [leadIn, duration - clipSeconds - padding], past the lead-in and clear of the
 * ending. Short tracks fall back to the latest start that still fits the clip.
 */
export function resolveClipStart(
  startFraction: number,
  leadIn: number,
  duration: number,
  clipSeconds: number,
  tailPadding: number = CLIP_TAIL_PADDING_SECONDS,
): number {
  const earliest = Math.max(0, Number.isFinite(leadIn) ? leadIn : 0);
  if (!Number.isFinite(duration) || duration <= 0) return round2(earliest);
  const latest = duration - clipSeconds - tailPadding;
  if (latest <= earliest) return round2(Math.max(0, Math.min(earliest, duration - clipSeconds)));
  const fraction = Math.min(1, Math.max(0, Number.isFinite(startFraction) ? startFraction : 0));
  return round2(earliest + fraction * (latest - earliest));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** mm:ss, e.g. 83.4 -> "01:23". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
