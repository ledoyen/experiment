/**
 * INDIVIDUAL EVENTS / CAREER FRICTION — glossary
 *
 * These rules intentionally contain no simulation state.
 * The engine records events; these pure functions decide when an event occurs
 * and how frequently an individual reviews a possible career change.
 */

import type { AgentEvent, Job } from "../types";
import type { NutritionId, NutritionReserves } from "../nutrition";

export const HEALTH_CRITICAL_THRESHOLD = 0.20;

/**
 * A person is "critically unhealthy" when at least one physiological reserve
 * falls below this fraction of its individual maximum.
 */
export function criticalNutrition(
  reserves: NutritionReserves
): { nutrient: NutritionId; ratio: number } | null {
  let lowest: { nutrient: NutritionId; ratio: number } | null = null;

  for (const [nutrient, reserve] of Object.entries(reserves) as Array<
    [NutritionId, NutritionReserves[NutritionId]]
  >) {
    const ratio = reserve.max > 0
      ? Math.max(0, Math.min(1, reserve.value / reserve.max))
      : 0;

    if (!lowest || ratio < lowest.ratio) {
      lowest = { nutrient, ratio };
    }
  }

  return lowest && lowest.ratio < HEALTH_CRITICAL_THRESHOLD
    ? lowest
    : null;
}

export function descendingIntoCritical(
  previous: NutritionReserves,
  next: NutritionReserves
): { nutrient: NutritionId; ratio: number } | null {
  const before = criticalNutrition(previous);
  const after = criticalNutrition(next);

  if (!after || before) return null;
  return after;
}

export const CAREER_REVIEW_MIN_DAYS = 7;
export const CAREER_REVIEW_MAX_DAYS = 30;
export const EMERGENCY_CAREER_REVIEW_RUNWAY_DAYS = 1.25;
export const EMERGENCY_CAREER_ENERGY_RATIO = 0.45;

export function careerReviewIsUrgent(
  money: number,
  plannedFoodSpend: number,
  energyRatio: number
): boolean {
  const runway = Math.max(0, plannedFoodSpend) *
    EMERGENCY_CAREER_REVIEW_RUNWAY_DAYS;
  return (
    Number.isFinite(money) &&
    money <= runway ||
    Number.isFinite(energyRatio) &&
    energyRatio <= EMERGENCY_CAREER_ENERGY_RATIO
  );
}

export function careerReviewDelayMinutes(random01: number): number {
  const u = Math.max(0, Math.min(1, Number.isFinite(random01) ? random01 : 0));
  const days =
    CAREER_REVIEW_MIN_DAYS +
    u * (CAREER_REVIEW_MAX_DAYS - CAREER_REVIEW_MIN_DAYS);
  return Math.round(days * 1440);
}

export function createJobChangeEvent(
  minute: number,
  previousJob: Job,
  newJob: Job,
  previousIncome: number,
  expectedIncome: number
): AgentEvent {
  return {
    minute,
    type: "jobChange",
    previousJob,
    newJob,
    previousIncome: Number.isFinite(previousIncome) ? Math.max(0, previousIncome) : 0,
    expectedIncome: Number.isFinite(expectedIncome) ? Math.max(0, expectedIncome) : 0
  };
}
