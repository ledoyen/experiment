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


/**
 * Share of a marginal producer's output that can be sold at today's demand.
 * When supply is zero but demand is positive, a new producer can sell all
 * of a normal production day: scarcity is therefore an incentive to switch.
 */
export function marginalSaleFraction(
  demand: number,
  currentSupply: number,
  marginalOutput: number
): number {
  const safeDemand = Number.isFinite(demand) ? Math.max(0, demand) : 0;
  const safeSupply = Number.isFinite(currentSupply) ? Math.max(0, currentSupply) : 0;
  const safeOutput = Number.isFinite(marginalOutput) ? Math.max(0, marginalOutput) : 0;

  if (safeDemand <= 0 || safeOutput <= 0) return 0;
  return Math.min(1, safeDemand / Math.max(safeSupply + safeOutput, 1e-9));
}

/**
 * Expected revenue of one additional worker entering an activity.
 * Uses unmet demand, not only the fraction sold by workers already in place.
 */
export function expectedMarginalIncome(
  demand: number,
  currentSupply: number,
  marginalOutput: number,
  price: number
): number {
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  return marginalOutput * marginalSaleFraction(
    demand,
    currentSupply,
    marginalOutput
  ) * safePrice;
}


export function jobSwitchProbability(
  currentIncome: number,
  alternativeIncome: number,
  responsiveness: number
): number {
  const current = Number.isFinite(currentIncome) ? Math.max(0, currentIncome) : 0;
  const alternative = Number.isFinite(alternativeIncome) ? Math.max(0, alternativeIncome) : 0;
  const response = Number.isFinite(responsiveness)
    ? Math.max(0, responsiveness)
    : 0;

  if (alternative <= current || response <= 0) return 0;
  if (current <= 1e-9) return Math.min(1, 1 - Math.exp(-response * 5));

  const advantage = Math.max(0, alternative / current - 1);
  return Math.min(1, 1 - Math.exp(-response * advantage * 5));
}
