/**
 * CALENDRIER — glossaire
 *
 * The simulation year starts in spring. This gives the initial world a growing
 * season before its first winter, allowing seasonal inventories to emerge.
 */
export const DAYS_PER_YEAR = 365;

export const SEASON_DAY_RANGES = {
  spring: { start: 1, end: 91 },
  summer: { start: 92, end: 182 },
  autumn: { start: 183, end: 273 },
  winter: { start: 274, end: 365 }
} as const;

export type Season = "spring" | "summer" | "autumn" | "winter";

export function dayOfYear(simulationDay: number): number {
  const zeroBased = Math.max(0, Math.floor(simulationDay) - 1);
  return (zeroBased % DAYS_PER_YEAR) + 1;
}

export function seasonOfDay(simulationDay: number): Season {
  const day = dayOfYear(simulationDay);
  if (day <= SEASON_DAY_RANGES.spring.end) return "spring";
  if (day <= SEASON_DAY_RANGES.summer.end) return "summer";
  if (day <= SEASON_DAY_RANGES.autumn.end) return "autumn";
  return "winter";
}

export function isHeatingSeason(simulationDay: number): boolean {
  return seasonOfDay(simulationDay) === "winter";
}
