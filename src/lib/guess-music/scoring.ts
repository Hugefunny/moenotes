/**
 * Scoring for guess-the-song. The difficulty dimensions stack:
 *
 *   score = 1000 x time factor x clip x answer mode x vocal removal x combo
 *
 * The time factor is the share of the round time left (at least 0.1). Each question allows 3 tries, each miss halves
 * the time left, and only first-try answers build the combo.
 */

export type AnswerMode = "choice" | "suggest" | "type";
export type ClipSeconds = 30 | 15 | 5 | 2;

export const BASE_SCORE = 1000;
export const MAX_STRIKES = 3;
export const MIN_TIME_FACTOR = 0.1;
export const CLIP_LENGTHS: readonly ClipSeconds[] = [30, 15, 5, 2];
export const ANSWER_MODES: readonly AnswerMode[] = ["choice", "suggest", "type"];

export const CLIP_MULTIPLIERS: Record<ClipSeconds, number> = { 30: 1.0, 15: 1.3, 5: 1.7, 2: 2.2 };
export const ANSWER_MULTIPLIERS: Record<AnswerMode, number> = { choice: 1.0, suggest: 1.3, type: 1.8 };
export const VOCAL_REMOVAL_MULTIPLIER = 1.5;
export const COMBO_STEP = 0.5;

export interface DifficultyFactors {
  clipSeconds: ClipSeconds;
  answerMode: AnswerMode;
  /** The clips play without vocals. */
  vocalRemoval?: boolean | undefined;
}

export function difficultyMultiplier({ clipSeconds, answerMode, vocalRemoval }: DifficultyFactors): number {
  return CLIP_MULTIPLIERS[clipSeconds] * ANSWER_MULTIPLIERS[answerMode] * (vocalRemoval ? VOCAL_REMOVAL_MULTIPLIER : 1);
}

export function timeFactor(timeLeft: number, timeLimit: number): number {
  if (!(timeLimit > 0)) return MIN_TIME_FACTOR;
  return Math.min(1, Math.max(MIN_TIME_FACTOR, timeLeft / timeLimit));
}

/** Combo streak after a question: first-try answers extend it, anything else breaks it. */
export function nextCombo(combo: number, strikes: number, correct: boolean): number {
  return correct && strikes === 0 ? combo + 1 : 0;
}

/** Multiplier for a streak that includes the current answer: x1 for the first, +0.5 per answer after it. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.max(0, combo - 1) * COMBO_STEP;
}

export interface RoundScoreInput extends DifficultyFactors {
  timeLeft: number;
  timeLimit: number;
  /** Streak including this answer (see nextCombo). */
  combo: number;
}

export function scoreRound(input: RoundScoreInput): number {
  const raw = BASE_SCORE * timeFactor(input.timeLeft, input.timeLimit) * difficultyMultiplier(input) * comboMultiplier(input.combo);
  // The epsilon keeps products like 1000 x 1.3 x 1.3 from flooring to 1689.
  return Math.floor(raw + 1e-6);
}

/** A wrong guess halves the time left. */
export function timeAfterWrongGuess(timeLeft: number): number {
  return Math.max(0, timeLeft) / 2;
}

/** "1.5", "2.0", "1.25": one decimal unless the multiplier needs two. */
export function formatMultiplier(multiplier: number): string {
  return multiplier.toFixed(Number.isInteger(Math.round(multiplier * 100) / 10) ? 1 : 2);
}
