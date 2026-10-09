/**
 * NUTRITIONAL PRICE CALIBRATION — glossary
 *
 * There is no fixed food basket in the simulation.
 * The monetary numeraire is calibrated so a nutritionally complete daily
 * diet is affordable to an individual starting with INITIAL_MONEY.
 *
 * This is only a price-unit calibration; it does not constrain choices.
 */
import {
  INITIAL_RESERVE_MIN_RATIO,
  NUTRITION,
  createNutritionReserves
} from "../nutrition";
import { planFoodDemand } from "./foodDemand";
import type { Good, PhysiologyState, Sex } from "../types";

export const INITIAL_MONEY_NUMERAIRE = 100;
export const NUTRITION_PRICE_CALIBRATION_ROUNDS = 256;

export function costOfNutritionallyCompleteDiet(
  sex: Sex,
  state: PhysiologyState,
  rawPrices: Partial<Record<Good, number>>
): number {
  // Calibrate for the lowest reserve ratio used at initialization, since
  // the daily demand planner includes gradual replenishment of depleted stores.
  const reserves = createNutritionReserves(
    sex,
    state,
    INITIAL_RESERVE_MIN_RATIO
  );
  const prices = Object.fromEntries(
    Object.entries(rawPrices).filter(([, price]) =>
      Number.isFinite(price) && price > 0
    )
  ) as Partial<Record<Good, number>>;
  const demand = planFoodDemand(
    reserves,
    sex,
    state,
    Number.POSITIVE_INFINITY,
    prices
  );

  return Object.entries(demand).reduce(
    (sum, [good, quantity]) =>
      sum + quantity * (prices[good as Good] ?? 0),
    0
  );
}

export function initialPriceScale(
  rawPrices: Partial<Record<Good, number>>
): number {
  const male = costOfNutritionallyCompleteDiet("male", "normal", rawPrices);
  const female = costOfNutritionallyCompleteDiet("female", "normal", rawPrices);
  const referenceCost = Math.max(male, female, 1e-9);
  return INITIAL_MONEY_NUMERAIRE / referenceCost;
}
