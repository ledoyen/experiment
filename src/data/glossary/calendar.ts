/**
 * CALENDRIER — glossaire
 *
 * Toutes les hypothèses calendaires de la simulation sont ici.
 * Modifier ces constantes change les saisons sans modifier le moteur.
 */

export const DAYS_PER_YEAR = 365;

export const SEASON_DAY_RANGES = {
  winter: { start: 1, end: 59 },
  spring: { start: 60, end: 151 },
  summer: { start: 152, end: 243 },
  autumn: { start: 244, end: 334 },
  winterLate: { start: 335, end: 365 }
} as const;

export type Season = "winter" | "spring" | "summer" | "autumn";

/** Converts an absolute simulation day to a 1..365 day-of-year. */
export function dayOfYear(simulationDay: number): number {
  const zeroBased = Math.max(0, Math.floor(simulationDay) - 1);
  return (zeroBased % DAYS_PER_YEAR) + 1;
}

export function seasonOfDay(simulationDay: number): Season {
  const day = dayOfYear(simulationDay);

  if (day <= SEASON_DAY_RANGES.winter.end || day >= SEASON_DAY_RANGES.winterLate.start) {
    return "winter";
  }
  if (day <= SEASON_DAY_RANGES.spring.end) return "spring";
  if (day <= SEASON_DAY_RANGES.summer.end) return "summer";
  return "autumn";
}

export function isHeatingSeason(simulationDay: number): boolean {
  return seasonOfDay(simulationDay) === "winter";
}
