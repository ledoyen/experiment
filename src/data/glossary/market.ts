/**
 * MARCHE — glossaire
 *
 * All market functions are pure. Prices are updated by the simulation
 * at most once per simulation day.
 */

export const PRICE_MIN = 0.001;
export const PRICE_MAX = 100000;
export const PRICE_RESPONSE_CLAMP = 0.20;
export const JOB_SWITCH_PREMIUM = 0.05;
export const FINITE_FALLBACK_PRICE = 1;

export function boundedSupplyDemandRatio(
  demand: number,
  supply: number
): number {
  const safeDemand = Number.isFinite(demand) ? Math.max(0, demand) : 0;
  const safeSupply = Number.isFinite(supply) ? Math.max(0, supply) : 0;
  const ratio = safeDemand / Math.max(safeSupply, 1e-9);
  return Math.max(-PRICE_RESPONSE_CLAMP, Math.min(PRICE_RESPONSE_CLAMP, ratio - 1));
}

export function priceMultiplier(
  currentPrice: number,
  demand: number,
  supply: number,
  sensitivity: number
): number {
  const safeCurrentPrice =
    Number.isFinite(currentPrice) && currentPrice > 0
      ? currentPrice
      : FINITE_FALLBACK_PRICE;
  const safeSensitivity = Number.isFinite(sensitivity) ? Math.max(0, sensitivity) : 0;

  const nextPrice = safeCurrentPrice * Math.exp(
    safeSensitivity * boundedSupplyDemandRatio(demand, supply)
  );

  return Number.isFinite(nextPrice)
    ? Math.max(PRICE_MIN, Math.min(PRICE_MAX, nextPrice))
    : safeCurrentPrice;
}

export function shouldSwitchJob(
  currentIncome: number,
  alternativeIncome: number
): boolean {
  const current = Number.isFinite(currentIncome) ? Math.max(0, currentIncome) : 0;
  const alternative = Number.isFinite(alternativeIncome) ? Math.max(0, alternativeIncome) : 0;
  return alternative > current * (1 + JOB_SWITCH_PREMIUM);
}
