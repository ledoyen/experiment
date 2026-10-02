/**
 * MARCHÉ INDIVIDUEL — transactions
 *
 * Inventory is the source of truth. A market offer is only a temporary view
 * of a quantity a Human has explicitly put up for sale.
 */

import type { AvailableGood, Good, Human, HumanId, PurchaseDecision } from "../data/types";
import { PRICE_MIN } from "../data/glossary/market";

export function buildAvailableGoods(
  humans: readonly Human[],
  referencePrices: Partial<Record<Good, number>>
): AvailableGood[] {
  const offers: AvailableGood[] = [];

  for (const human of humans) {
    for (const [goodName, listedValue] of Object.entries(human.forSale)) {
      const good = goodName as Good;
      const inventory = Math.max(0, human.inventory[good] ?? 0);
      const stock = Math.min(Math.max(0, listedValue ?? 0), inventory);
      if (stock <= 1e-12) continue;

      const explicitPrice = human.askPrices[good];
      const referencePrice = referencePrices[good] ?? PRICE_MIN;
      const price =
        Number.isFinite(explicitPrice) && explicitPrice! > 0
          ? explicitPrice!
          : referencePrice;

      if (!Number.isFinite(price) || price <= 0) continue;

      offers.push({
        name: good,
        sellerId: human.id,
        price,
        stock
      });
    }
  }

  return offers;
}

export function executePurchase(
  buyer: Human,
  seller: Human,
  offer: AvailableGood,
  requestedQuantity: number
): number {
  if (buyer.id === seller.id) return 0;
  if (offer.sellerId !== seller.id) return 0;
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return 0;
  if (!Number.isFinite(offer.price) || offer.price <= 0) return 0;

  const sellerInventory = Math.max(0, seller.inventory[offer.name] ?? 0);
  const sellerListed = Math.max(0, seller.forSale[offer.name] ?? 0);
  const marketStock = Math.max(0, offer.stock);
  const affordable = Math.max(0, buyer.money) / offer.price;

  const quantity = Math.min(
    requestedQuantity,
    sellerInventory,
    sellerListed,
    marketStock,
    affordable
  );

  if (quantity <= 1e-12) return 0;

  const total = quantity * offer.price;

  seller.inventory[offer.name] = sellerInventory - quantity;
  seller.forSale[offer.name] = sellerListed - quantity;
  buyer.inventory[offer.name] =
    (buyer.inventory[offer.name] ?? 0) + quantity;

  buyer.money -= total;
  seller.money += total;
  offer.stock -= quantity;

  return quantity;
}

export function listForSale(
  human: Human,
  good: Good,
  quantity: number,
  price: number
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(price) || price < PRICE_MIN) return 0;

  const inventory = Math.max(0, human.inventory[good] ?? 0);
  const currentListed = Math.max(0, human.forSale[good] ?? 0);
  const availableToList = Math.max(0, inventory - currentListed);
  const listed = Math.min(quantity, availableToList);

  if (listed <= 1e-12) return 0;

  human.forSale[good] = currentListed + listed;
  human.askPrices[good] = price;
  return listed;
}

export function unlistFromSale(
  human: Human,
  good: Good,
  quantity: number
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const listed = Math.max(0, human.forSale[good] ?? 0);
  const removed = Math.min(quantity, listed);
  human.forSale[good] = listed - removed;

  return removed;
}

export function findHuman(
  humans: readonly Human[],
  id: HumanId
): Human | undefined {
  return humans.find(human => human.id === id);
}


export function decideCheapestPurchases(
  human: Human,
  market: readonly AvailableGood[],
  name: Good,
  desiredQuantity: number
): PurchaseDecision[] {
  let remaining = Math.max(0, desiredQuantity);
  let moneyLeft = Math.max(0, human.money);
  const decisions: PurchaseDecision[] = [];

  const offers = market
    .filter(
      offer =>
        offer.name === name &&
        offer.sellerId !== human.id &&
        offer.stock > 1e-12 &&
        Number.isFinite(offer.price) &&
        offer.price > 0
    )
    .sort((a, b) => a.price - b.price);

  for (const offer of offers) {
    if (remaining <= 1e-12 || moneyLeft <= 1e-12) break;

    const quantity = Math.min(
      remaining,
      offer.stock,
      moneyLeft / offer.price
    );

    if (quantity <= 1e-12) continue;

    decisions.push({
      name: offer.name,
      sellerId: offer.sellerId,
      price: offer.price,
      quantity
    });

    remaining -= quantity;
    moneyLeft -= quantity * offer.price;
  }

  return decisions;
}
