/**
 * BUDGET DES MENAGES — glossaire
 *
 * L'argent disponible est alloué par priorité.
 * Les besoins de santé passent avant le confort.
 *
 * Cette fonction est pure : elle ne modifie ni l'agent ni le marché.
 */

export const HOUSEHOLD_PURCHASE_PRIORITY = [
  "food",
  "heating",
  "clothing",
  "tools",
  "housing"
] as const;

export type HouseholdPurchaseCategory =
  typeof HOUSEHOLD_PURCHASE_PRIORITY[number];

export interface BudgetAllocation {
  foodSpending: number;
  remainderAfterFood: number;
}

/**
 * Food is the first mandatory expense.
 *
 * - If the household can afford the whole food basket, it buys the whole basket.
 * - Otherwise every available monetary unit goes to food.
 * - Nothing assigned to lower-priority categories can reduce food spending.
 */
export function comfortPurchaseAllowed(foodFulfillment: number): boolean {
  return foodFulfillment >= 1;
}

export function allocateFoodBeforeComfort(
  availableMoney: number,
  foodBasketCost: number
): BudgetAllocation {
  const money = Math.max(0, availableMoney);
  const cost = Math.max(0, foodBasketCost);

  if (cost === 0) {
    return { foodSpending: 0, remainderAfterFood: money };
  }

  const foodSpending = Math.min(money, cost);

  return {
    foodSpending,
    remainderAfterFood: money - foodSpending
  };
}
