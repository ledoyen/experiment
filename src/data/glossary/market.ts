/**
 * MARCHE — glossaire
 *
 * Paramètres de formation des prix et de mobilité professionnelle.
 * Les fonctions de calcul sont pures : elles ne modifient jamais la simulation.
 */

export const PRICE_MIN = 0.001;
export const PRICE_MAX = 100000;
export const PRICE_RESPONSE_CLAMP = 0.20;
export const JOB_SWITCH_PREMIUM = 0.05;

export function boundedSupplyDemandRatio(
  demand: number,
  supply: number
): number {
  const ratio = demand / Math.max(supply, 1e-9);
  return Math.max(-PRICE_RESPONSE_CLAMP, Math.min(PRICE_RESPONSE_CLAMP, ratio - 1));
}

export function priceMultiplier(
  currentPrice: number,
  demand: number,
  supply: number,
  sensitivity: number
): number {
  return Math.max(
    PRICE_MIN,
    Math.min(
      PRICE_MAX,
      currentPrice * Math.exp(
        sensitivity * boundedSupplyDemandRatio(demand, supply)
      )
    )
  );
}

export function shouldSwitchJob(
  currentIncome: number,
  alternativeIncome: number
): boolean {
  return alternativeIncome > currentIncome * (1 + JOB_SWITCH_PREMIUM);
}
