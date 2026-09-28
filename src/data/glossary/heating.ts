/**
 * CHAUFFAGE — glossaire
 *
 * Hypothèses de consommation du bois-énergie.
 * Le besoin annuel du XLS est converti en consommation uniquement pendant l'hiver.
 */

import { DAYS_PER_YEAR, isHeatingSeason } from "./calendar";

export const ANNUAL_HEATING_TONNES_PER_PERSON = 1;
export const MAX_HEATING_STOCK_TONNES_PER_PERSON = 1;

/**
 * Tonnes burned by one person on a day that belongs to winter.
 * Annual consumption remains exactly the configured annual amount.
 */
export const WINTER_HEATING_DAYS = 90;
export const DAILY_WINTER_HEATING_TONNES_PER_PERSON =
  ANNUAL_HEATING_TONNES_PER_PERSON / WINTER_HEATING_DAYS;

export function heatingConsumptionForDay(simulationDay: number): number {
  return isHeatingSeason(simulationDay)
    ? DAILY_WINTER_HEATING_TONNES_PER_PERSON
    : 0;
}

/**
 * Market demand is generated only when heating is actually consumed.
 * A household replenishes the stock consumed that day during winter.
 */
export function heatingPurchaseNeed(
  simulationDay: number,
  stockTonnes: number
): number {
  if (!isHeatingSeason(simulationDay)) return 0;
  return Math.min(
    heatingConsumptionForDay(simulationDay),
    Math.max(0, MAX_HEATING_STOCK_TONNES_PER_PERSON - stockTonnes)
  );
}

export const HEATING_SEASON_SHARE = WINTER_HEATING_DAYS / DAYS_PER_YEAR;
