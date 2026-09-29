/**
 * CHAUFFAGE — glossaire
 *
 * Wood is burned only in winter. Households nevertheless buy it all year:
 * the market anticipates winter and gradually builds the household stock.
 */

import { isHeatingSeason, seasonOfDay } from "./calendar";

export const ANNUAL_HEATING_TONNES_PER_PERSON = 1;
export const MAX_HEATING_STOCK_TONNES_PER_PERSON = 1;

export const WINTER_HEATING_DAYS = 92;
export const DAILY_WINTER_HEATING_TONNES_PER_PERSON =
  ANNUAL_HEATING_TONNES_PER_PERSON / WINTER_HEATING_DAYS;

export const HEATING_STOCKING_MULTIPLIERS = {
  spring: 0.75,
  summer: 0.75,
  autumn: 1.5,
  winter: 1
} as const;

export function heatingConsumptionForDay(simulationDay: number): number {
  return isHeatingSeason(simulationDay)
    ? DAILY_WINTER_HEATING_TONNES_PER_PERSON
    : 0;
}

export function heatingPurchaseNeed(
  simulationDay: number,
  stockTonnes: number
): number {
  const season = seasonOfDay(simulationDay);
  const dailyStocking =
    ANNUAL_HEATING_TONNES_PER_PERSON / 365 *
    HEATING_STOCKING_MULTIPLIERS[season];

  return Math.min(
    dailyStocking,
    Math.max(0, MAX_HEATING_STOCK_TONNES_PER_PERSON - stockTonnes)
  );
}
