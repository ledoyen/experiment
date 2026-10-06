/**
 * DEMANDE ALIMENTAIRE — glossaire
 *
 * A Human does not choose a fixed basket. They evaluate actual market offers:
 * each seller can expose the same good at a different price and stock.
 *
 * This function is pure: it only returns the purchases the Human would try
 * to make. The transaction layer applies those purchases to inventories and money.
 */

import {
  FOOD_NUTRITION,
  NUTRITION,
  foodToNutrition,
  targetFor,
  applyNutritionDay,
  type NutritionReserves
} from "../nutrition";
import type {
  AvailableGood,
  Good,
  Human,
  PhysiologyState,
  PurchaseDecision,
  Sex
} from "../types";

function cheapestFoodOffers(
  market: readonly AvailableGood[],
  buyerId: number
): AvailableGood[] {
  const cheapest = new Map<Good, AvailableGood>();
  for (const offer of market) {
    if (offer.sellerId === buyerId || offer.stock <= 1e-12) continue;
    if (!FOOD_NUTRITION[offer.name] || !Number.isFinite(offer.price) || offer.price <= 0) continue;
    const current = cheapest.get(offer.name);
    if (!current || offer.price < current.price) cheapest.set(offer.name, offer);
  }
  return [...cheapest.values()];
}

// Macronutrients and micronutrients are solved before the final energy fill.
// This avoids consuming an energy-dense staple simply because it is the cheapest
// way to satisfy a later vitamin/mineral need. Energy balance is a separate
// physiological constraint. Reference: https://www.anses.fr/en/system/files/NUT2012SA0103Ra-1EN.pdf
// Technical convergence guard for the market matching loop; it is not an economic parameter.
export const MAX_FOOD_PURCHASE_ROUNDS = 16;

export const FOOD_PRIORITY_TIERS = [
  ["protein", "carbohydrate", "fat", "fiber"] as const,
  [
    "vitamin_A", "vitamin_B1", "vitamin_B2", "vitamin_B3",
    "vitamin_B6", "vitamin_B9", "vitamin_B12", "vitamin_C",
    "vitamin_E", "vitamin_K",
    "calcium", "iron", "magnesium", "zinc", "iodine", "selenium"
  ] as const,
  ["energy"] as const
] as const;

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

function initialNeeds(human: Human) {
  return Object.fromEntries(
    NUTRITION.map(nutrient => [
      nutrient.id,
      dailyIntakeNeed(
        nutrient,
        human.reserves[nutrient.id],
        human.sex,
        human.state,
        human.metabolicFactor
      )
    ])
  ) as Record<(typeof NUTRITION)[number]["id"], number>;
}

export function decidePurchases(
  human: Human,
  market: readonly AvailableGood[]
): PurchaseDecision[] {
  const decisions: PurchaseDecision[] = [];
  const needs = initialNeeds(human);
  let moneyLeft = Math.max(0, human.money);

  for (const tier of FOOD_PRIORITY_TIERS) {
    while (moneyLeft > 1e-9) {
      if (!tier.some(nutrientId => needs[nutrientId as TierId] > 1e-9)) {
        break;
      }

      let bestOffer: AvailableGood | null = null;
      let bestQuantity = 0;
      let bestScore = 0;

      for (const offer of cheapestFoodOffers(market, human.id)) {
        if (
          offer.sellerId === human.id ||
          offer.stock <= 1e-12 ||
          !Number.isFinite(offer.price) ||
          offer.price <= 0
        ) {
          continue;
        }

        const food = FOOD_NUTRITION[offer.name];
        if (!food) continue;

        const contribution = foodToNutrition(food, 1, offer.name);
        let benefit = 0;
        let maxUsefulQuantity = Number.POSITIVE_INFINITY;

        for (const nutrientId of tier) {
          const need = needs[nutrientId as TierId];
          if (need <= 1e-9) continue;
          const supplied = contribution[nutrientId] ?? 0;
          if (supplied <= 0) continue;
          const nutrient = NUTRITION.find(item => item.id === nutrientId);
          if (!nutrient) continue;

          benefit +=
            Math.min(need, supplied) /
            Math.max(
              1e-9,
              targetFor(nutrient, human.sex, human.state) *
                human.metabolicFactor
            );
        }

        for (const nutrient of NUTRITION) {
          const need = needs[nutrient.id];
          const supplied = contribution[nutrient.id] ?? 0;
          if (need > 1e-9 && supplied > 0) {
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

        const quantity = Math.min(
          maxUsefulQuantity,
          offer.stock,
          moneyLeft / offer.price
        );

        const score = quantity > 0
          ? benefit / offer.price
          : 0;
        if (score > bestScore) {
          bestScore = score;
          bestOffer = offer;
          bestQuantity = quantity;
        }
      }

      if (!bestOffer || bestQuantity <= 0) break;

      decisions.push({
        name: bestOffer.name,
        sellerId: bestOffer.sellerId,
        price: bestOffer.price,
        quantity: bestQuantity
      });

      moneyLeft -= bestQuantity * bestOffer.price;

      const contribution = foodToNutrition(
        FOOD_NUTRITION[bestOffer.name]!,
        bestQuantity,
        bestOffer.name
      );

      for (const nutrient of NUTRITION) {
        needs[nutrient.id] = Math.max(
          0,
          needs[nutrient.id] - (contribution[nutrient.id] ?? 0)
        );
      }
    }

    if (moneyLeft <= 1e-9) break;
  }

  return decisions;
}

/**
 * Compatibility helper for calibration code.
 * It deliberately uses one synthetic seller per good.
 */
export function planFoodDemand(
  reserves: NutritionReserves,
  sex: Sex,
  state: PhysiologyState,
  availableMoney: number,
  prices: Partial<Record<Good, number>>,
  allocationCaps?: Partial<Record<Good, number>>,
  requirementFactor = 1
): Record<Good, number> {
  const human: Human = {
    id: -1,
    x: 0,
    y: 0,
    job: "idle",
    productivity: 1,
    reserves,
    sex,
    state,
    metabolicFactor: requirementFactor,
    money: availableMoney,
    inventory: {},
    forSale: {},
    askPrices: {}
  } as Human;

  const market: AvailableGood[] = Object.keys(FOOD_NUTRITION)
    .map(name => {
      const good = name as Good;
      const price = prices[good] ?? 0;
      return {
        name: good,
        sellerId: -100,
        price,
        stock:
          allocationCaps?.[good] === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(0, allocationCaps[good]!)
      };
    })
    .filter(offer => Number.isFinite(offer.price) && offer.price > 0);

  const decisions = decidePurchases(human, market);
  const demand = {} as Record<Good, number>;
  for (const decision of decisions) {
    demand[decision.name] =
      (demand[decision.name] ?? 0) + decision.quantity;
  }

  return demand;
}

export function estimateFoodAutonomyDays(
  reserves: NutritionReserves,
  sex: Sex,
  state: PhysiologyState,
  inventory: Partial<Record<Good, number>>,
  prices: Partial<Record<Good, number>>,
  requirementFactor = 1,
  maxDays = 365
): number | null {
  let current = reserves;
  let stock = { ...inventory };
  for (let day = 0; day < maxDays; day++) {
    const demand = planFoodDemand(current, sex, state, Number.POSITIVE_INFINITY, prices, stock, requirementFactor);
    if (!Object.keys(demand).length) return day;
    const result = consumeAutonomyFood(current, stock, demand, sex, state, requirementFactor);
    current = result.reserves;
    stock = result.stock;
    if (current.energy.value <= 0) return day + 1;
  }
  return null;
}

function consumeAutonomyFood(
  reserves: NutritionReserves,
  stock: Partial<Record<Good, number>>,
  demand: Record<Good, number>,
  sex: Sex,
  state: PhysiologyState,
  requirementFactor: number
) {
  const intake = {} as Partial<Record<typeof NUTRITION[number]["id"], number>>;
  for (const [good, quantity] of Object.entries(demand) as Array<[Good, number]>) {
    stock[good] = Math.max(0, (stock[good] ?? 0) - quantity);
    const contribution = foodToNutrition(FOOD_NUTRITION[good]!, quantity, good);
    for (const nutrient of NUTRITION) intake[nutrient.id] = (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
  }
  return { reserves: applyNutritionDay(reserves, intake, sex, state, requirementFactor), stock };
}
