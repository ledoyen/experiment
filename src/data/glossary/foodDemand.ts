/**
 * DEMANDE ALIMENTAIRE — glossaire
 *
 * Individuals do not have a fixed food basket. They buy foods that best
 * reduce their current physiological deficits per unit of money.
 */
import { FOOD_NUTRITION, NUTRITION, foodToNutrition, targetFor, type NutritionReserves } from "../nutrition";
import type { Good, PhysiologyState, Sex } from "../types";

export const MAX_FOOD_PURCHASE_ROUNDS = 16;

function dailyIntakeNeed(
  nutrientId: (typeof NUTRITION)[number],
  reserve: NutritionReserves[(typeof NUTRITION)[number]["id"]],
  sex: Sex,
  state: PhysiologyState
): number {
  const target = targetFor(nutrientId, sex, state);
  // At least today's physiological requirement must be covered. When the
  // reserve is low, extra food is useful to rebuild the buffer.
  return Math.max(target, reserve.max - reserve.value);
}

export function planFoodDemand(
  reserves: NutritionReserves,
  sex: Sex,
  state: PhysiologyState,
  availableMoney: number,
  prices: Partial<Record<Good, number>>
): Record<Good, number> {
  const demand = {} as Record<Good, number>;
  for (const good of Object.keys(FOOD_NUTRITION) as Good[]) demand[good] = 0;

  let moneyLeft = Math.max(0, availableMoney);
  const needs = Object.fromEntries(
    NUTRITION.map(nutrient => [
      nutrient.id,
      dailyIntakeNeed(nutrient, reserves[nutrient.id], sex, state)
    ])
  ) as Record<(typeof NUTRITION)[number]["id"], number>;

  for (let round = 0; round < MAX_FOOD_PURCHASE_ROUNDS && moneyLeft > 1e-9; round++) {
    let bestGood: Good | null = null;
    let bestQuantity = 0;
    let bestScore = 0;

    for (const good of Object.keys(FOOD_NUTRITION) as Good[]) {
      const price = prices[good] ?? 0;
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
          benefit += Math.min(need, supplied) / Math.max(1e-9, targetFor(nutrient, sex, state));
          maxUsefulQuantity = Math.min(maxUsefulQuantity, need / supplied);
        }
      }

      if (!Number.isFinite(maxUsefulQuantity) || maxUsefulQuantity <= 0 || benefit <= 0) continue;

      const quantity = Math.min(maxUsefulQuantity, moneyLeft / price);
      const score = quantity > 0 ? benefit / price : 0;

      if (score > bestScore) {
        bestScore = score;
        bestGood = good;
        bestQuantity = quantity;
      }
    }

    if (!bestGood || bestQuantity <= 0) break;

    const price = prices[bestGood] ?? 0;
    demand[bestGood] += bestQuantity;
    moneyLeft -= bestQuantity * price;

    const contribution = foodToNutrition(FOOD_NUTRITION[bestGood]!, bestQuantity);
    for (const nutrient of NUTRITION) {
      needs[nutrient.id] = Math.max(
        0,
        needs[nutrient.id] - (contribution[nutrient.id] ?? 0)
      );
    }
  }

  return demand;
}
