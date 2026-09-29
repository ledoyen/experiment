/**
 * DEMANDE ALIMENTAIRE — glossaire
 *
 * Individuals do not have a fixed food basket.
 * They first protect short-horizon survival needs, then balance macronutrients,
 * then restore micronutrient reserves.
 */

import { FOOD_NUTRITION, NUTRITION, foodToNutrition, targetFor, type NutritionReserves } from "../nutrition";
import type { Good, PhysiologyState, Sex } from "../types";

export const MAX_FOOD_PURCHASE_ROUNDS = 256;

export const FOOD_PRIORITY_TIERS = [
  ["energy"] as const,
  ["protein", "carbohydrate", "fat", "fiber"] as const,
  [
    "vitamin_A", "vitamin_B1", "vitamin_B2", "vitamin_B3", "vitamin_B6",
    "vitamin_B9", "vitamin_B12", "vitamin_C", "vitamin_E", "vitamin_K",
    "calcium", "iron", "magnesium", "zinc", "iodine", "selenium"
  ] as const
];

type TierId = typeof FOOD_PRIORITY_TIERS[number][number];

function dailyIntakeNeed(
  nutrientId: (typeof NUTRITION)[number],
  reserve: NutritionReserves[(typeof NUTRITION)[number]["id"]],
  sex: Sex,
  state: PhysiologyState,
  requirementFactor: number
): number {
  const target = targetFor(nutrientId, sex, state) * requirementFactor;
  return Math.max(target, reserve.max - reserve.value);
}

function tierNeeds(
  reserves: NutritionReserves,
  sex: Sex,
  state: PhysiologyState,
  requirementFactor: number
) {
  return Object.fromEntries(
    NUTRITION.map(nutrient => [
      nutrient.id,
      dailyIntakeNeed(
        nutrient,
        reserves[nutrient.id],
        sex,
        state,
        requirementFactor
      )
    ])
  ) as Record<(typeof NUTRITION)[number]["id"], number>;
}

export function planFoodDemand(
  reserves: NutritionReserves,
  sex: Sex,
  state: PhysiologyState,
  availableMoney: number,
  prices: Partial<Record<Good, number>>,
  allocationCaps?: Partial<Record<Good, number>>,
  requirementFactor = 1
): Record<Good, number> {
  const demand = {} as Record<Good, number>;
  for (const good of Object.keys(FOOD_NUTRITION) as Good[]) demand[good] = 0;

  let moneyLeft = Math.max(0, availableMoney);
  const needs = tierNeeds(reserves, sex, state, requirementFactor);

  for (const tier of FOOD_PRIORITY_TIERS) {
    for (
      let round = 0;
      round < MAX_FOOD_PURCHASE_ROUNDS && moneyLeft > 1e-9;
      round++
    ) {
      let bestGood: Good | null = null;
      let bestQuantity = 0;
      let bestScore = 0;

      const tierHasNeed = tier.some(
        nutrientId => needs[nutrientId as TierId] > 1e-9
      );
      if (!tierHasNeed) break;

      for (const good of Object.keys(FOOD_NUTRITION) as Good[]) {
        const price = prices[good] ?? 0;
        const food = FOOD_NUTRITION[good];
        if (!food || !Number.isFinite(price) || price <= 0) continue;

        const contribution = foodToNutrition(food, 1);
        let benefit = 0;
        let maxUsefulQuantity = Number.POSITIVE_INFINITY;

        for (const nutrientId of tier) {
          const need = needs[nutrientId as TierId];
          if (need <= 1e-9) continue;

          const supplied = contribution[nutrientId] ?? 0;
          if (supplied > 0) {
            const nutrient = NUTRITION.find(item => item.id === nutrientId);
            if (!nutrient) continue;

            benefit += Math.min(need, supplied) /
              Math.max(1e-9, targetFor(nutrient, sex, state) * requirementFactor);
            maxUsefulQuantity = Math.min(maxUsefulQuantity, need / supplied);
          }
        }

        if (
          !Number.isFinite(maxUsefulQuantity) ||
          maxUsefulQuantity <= 0 ||
          benefit <= 0
        ) {
          continue;
        }

        const physicalLimit =
          allocationCaps?.[good] === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(0, allocationCaps[good]! - (demand[good] ?? 0));

        const quantity = Math.min(
          maxUsefulQuantity,
          moneyLeft / price,
          physicalLimit
        );
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

      const contribution = foodToNutrition(
        FOOD_NUTRITION[bestGood]!,
        bestQuantity
      );

      for (const nutrientId of tier) {
        needs[nutrientId as TierId] = Math.max(
          0,
          needs[nutrientId as TierId] - (contribution[nutrientId] ?? 0)
        );
      }
    }

    if (moneyLeft <= 1e-9) break;
  }

  return demand;
}
