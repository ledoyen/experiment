/**
 * NUTRITIONAL PRICE CALIBRATION — glossary
 *
 * There is no fixed food basket in the simulation.
 * The monetary numeraire is calibrated so a nutritionally complete daily
 * diet is affordable to an individual starting with INITIAL_MONEY.
 *
 * This is only a price-unit calibration; it does not constrain choices.
 */
import { FOOD_NUTRITION, NUTRITION, createNutritionReserves, foodToNutrition, targetFor } from "../nutrition";
import type { Good, PhysiologyState, Sex } from "../types";

export const INITIAL_MONEY_NUMERAIRE = 100;
export const NUTRITION_PRICE_CALIBRATION_ROUNDS = 256;

export function costOfNutritionallyCompleteDiet(
  sex: Sex,
  state: PhysiologyState,
  rawPrices: Partial<Record<Good, number>>
): number {
  const reserves = createNutritionReserves(sex, state);
  const needs = Object.fromEntries(
    NUTRITION.map(nutrient => [
      nutrient.id,
      targetFor(nutrient, sex, state)
    ])
  ) as Record<(typeof NUTRITION)[number]["id"], number>;

  let cost = 0;

  for (
    let round = 0;
    round < NUTRITION_PRICE_CALIBRATION_ROUNDS;
    round++
  ) {
    let bestGood: Good | null = null;
    let bestScore = 0;
    let bestQuantity = 0;

    for (const good of Object.keys(FOOD_NUTRITION) as Good[]) {
      const price = rawPrices[good] ?? 0;
      const food = FOOD_NUTRITION[good];
      if (!food || !Number.isFinite(price) || price <= 0) continue;

      const contribution = foodToNutrition(food, 1);
      let benefit = 0;
      let maxUsefulQuantity = Number.POSITIVE_INFINITY;

      for (const nutrient of NUTRITION) {
        const need = needs[nutrient.id];
        if (need <= 1e-9) continue;
        const supplied = contribution[nutrient.id] ?? 0;

        if (supplied > 0) {
          benefit += Math.min(need, supplied) /
            Math.max(1e-9, targetFor(nutrient, sex, state));
          maxUsefulQuantity = Math.min(maxUsefulQuantity, need / supplied);
        }
      }

      if (!Number.isFinite(maxUsefulQuantity) || maxUsefulQuantity <= 0 || benefit <= 0) continue;

      const score = benefit / price;
      if (score > bestScore) {
        bestScore = score;
        bestGood = good;
        bestQuantity = maxUsefulQuantity;
      }
    }

    if (!bestGood || bestQuantity <= 0) break;

    const price = rawPrices[bestGood] ?? 0;
    cost += bestQuantity * price;

    const contribution = foodToNutrition(FOOD_NUTRITION[bestGood]!, bestQuantity);
    for (const nutrient of NUTRITION) {
      needs[nutrient.id] = Math.max(
        0,
        needs[nutrient.id] - (contribution[nutrient.id] ?? 0)
      );
    }
  }

  return cost;
}

export function initialPriceScale(
  rawPrices: Partial<Record<Good, number>>
): number {
  const male = costOfNutritionallyCompleteDiet("male", "normal", rawPrices);
  const female = costOfNutritionallyCompleteDiet("female", "normal", rawPrices);
  const referenceCost = Math.max(male, female, 1e-9);
  return INITIAL_MONEY_NUMERAIRE / referenceCost;
}
