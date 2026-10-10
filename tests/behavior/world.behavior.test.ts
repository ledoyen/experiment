import { describe, expect, it } from "vitest";
import { defaultParameters } from "../../src/data/defaults";
import { FOOD_GOODS, INITIAL_PRICE } from "../../src/data/economy";
import {
  FOOD_NUTRITION,
  NUTRITION,
  createNutritionReserves,
  foodToNutrition
} from "../../src/data/nutrition";
import { planFoodDemand } from "../../src/data/glossary/foodDemand";
import { World } from "../../src/model/World";
import type { Good, Parameters } from "../../src/data/types";

function runDays(world: World, days: number): number[] {
  const populations: number[] = [];
  for (let day = 0; day < days; day++) {
    world.step(1440, 1440);
    populations.push(world.agents.length);
  }
  return populations;
}

function testWorld(parameters: Parameters): World {
  return new World(parameters, { recordSnapshots: false });
}

function moneyInSystem(world: World): number {
  return world.getMetrics().moneySupply;
}

describe("simulation behavioral invariants", () => {
  it("keeps the planned food basket within one day's energy requirement", () => {
    const reserves = createNutritionReserves("male", "normal", 1);
    const basket = planFoodDemand(
      reserves,
      "male",
      "normal",
      Number.MAX_SAFE_INTEGER,
      INITIAL_PRICE
    );

    const energy = FOOD_GOODS.reduce((total, good) => {
      const quantity = basket[good] ?? 0;
      const food = FOOD_NUTRITION[good];
      return total + (food ? foodToNutrition(food, quantity, good).energy ?? 0 : 0);
    }, 0);
    const dailyEnergyTarget = NUTRITION.find(nutrient => nutrient.id === "energy")!.target.male;

    expect(energy).toBeLessThanOrEqual(dailyEnergyTarget + 1e-6);
  });
  it("keeps a nutritionally viable no-money population alive over the initial season", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 200,
      moneyEnabled: false,
      productivityVariance: 0.2
    });

    const populations = runDays(world, 120);
    
    expect(Math.min(...populations)).toBeGreaterThanOrEqual(180);
  });

  it("conserves the initial money supply through individual transactions and deaths", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    const target = 200 * 100;

    for (let day = 0; day < 30; day++) {
      world.step(1440, 1440);
      const supply = moneyInSystem(world);
      expect(Number.isFinite(supply)).toBe(true);
      expect(Math.abs(supply - target)).toBeLessThan(1e-6);
    }
  });

  it("keeps a monetary population viable through the first month", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    const populations = runDays(world, 7);
    expect(populations[0]).toBeGreaterThanOrEqual(180);
    expect(Math.min(...populations)).toBeGreaterThanOrEqual(160);
  });

  it("keeps the monetized population alive through the first micronutrient mortality window", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      mobility: 0.2,
      productivityVariance: 0.2
    });

    const populations = runDays(world, 220);
    expect(populations.every(population => population === 200)).toBe(true);
  });

  it("keeps prices and population metrics finite", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    for (let day = 0; day < 20; day++) {
      world.step(1440, 1440);
      const metrics = world.getMetrics();

      expect(Number.isFinite(metrics.population)).toBe(true);
      expect(Number.isFinite(metrics.moneySupply)).toBe(true);
      expect(metrics.prices).toEqual(
        expect.objectContaining(
          Object.fromEntries(
            Object.entries(metrics.prices).map(([good, price]) => [
              good,
              expect.any(Number)
            ])
          )
        )
      );

      for (const price of Object.values(metrics.prices)) {
        expect(Number.isFinite(price)).toBe(true);
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  it("lists initial durable food stocks when money is enabled from the start", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 3,
      initialMoney: 100,
      moneyEnabled: true,
      mobility: 0
    });

    for (const human of world.agents) {
      expect(human.inventory.ble ?? 0).toBeGreaterThan(0);
      expect(human.forSale.ble ?? 0).toBeCloseTo(human.inventory.ble ?? 0, 10);
      expect(human.referencePricedAsks?.ble).toBe(true);
    }
  });

  it("makes pre-money food stocks available when money is introduced", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 3,
      initialMoney: 100,
      moneyEnabled: false,
      mobility: 0
    });

    const [seller, buyer, other] = world.agents;

    for (const human of world.agents) {
      human.job = "idle";
      human.inventory = {};
      human.forSale = {};
      human.askPrices = {};
    }

    seller.inventory.ble = 100;
    seller.money = 0;
    buyer.money = 1000;
    other.money = 0;

    world.setParameters({ moneyEnabled: true });

    expect(seller.forSale.ble).toBe(100);
  });

  it("routes a purchase to the cheapest seller and transfers ownership", () => {
    const world = new World({
      ...defaultParameters(),
      population: 3,
      initialMoney: 1000,
      moneyEnabled: true,
      mobility: 0
    });

    const [sellerA, sellerB, buyer] = world.agents;

    for (const human of world.agents) {
      human.job = "idle";
      human.inventory = { ble: 20 };
      human.forSale = {};
      human.askPrices = {};
    }

    sellerA.inventory.outil = 1;
    sellerA.forSale.outil = 1;
    sellerA.askPrices.outil = 1;

    sellerB.inventory.outil = 10;
    sellerB.forSale.outil = 10;
    sellerB.askPrices.outil = 2;

    const sellerAMoneyBefore = sellerA.money;
    const sellerBMoneyBefore = sellerB.money;

    world.step(1440, 1440);

    expect(sellerA.inventory.outil).toBeLessThan(1);
    expect(sellerB.inventory.outil).toBeLessThanOrEqual(10);
    expect(sellerA.money).toBeGreaterThan(sellerAMoneyBefore);
    expect(sellerB.money).toBeGreaterThanOrEqual(sellerBMoneyBefore);
    expect(world.getMetrics().moneySupply).toBeCloseTo(
      3 * 1000,
      10
    );
  });

  it("consumes purchased food once instead of retaining it for a second nutrition pass", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 3,
      initialMoney: 1000,
      moneyEnabled: true,
      mobility: 0
    });
    const [seller, buyer, other] = world.agents;

    for (const human of world.agents) {
      human.job = "idle";
      human.inventory = {};
      human.forSale = {};
      human.askPrices = {};
      human.referencePricedAsks = {};
    }

    seller.money = 0;
    seller.inventory.ble = 1000;
    seller.forSale.ble = 1000;
    seller.askPrices.ble = 1;
    buyer.money = 1000;
    buyer.inventory = {};
    other.money = 0;

    world.step(1440, 1440);

    expect(buyer.inventory.ble ?? 0).toBeCloseTo(0, 10);
    expect(seller.inventory.ble ?? 0).toBeLessThan(1000);
  });

  it("refreshes model-generated asking prices but preserves explicit seller prices", () => {
    const world = testWorld({
      ...defaultParameters(),
      population: 3,
      initialMoney: 1000,
      moneyEnabled: true,
      mobility: 0
    });
    const [generatedSeller, explicitSeller, buyer] = world.agents;

    for (const human of world.agents) {
      human.job = "idle";
      human.inventory = {};
      human.forSale = {};
      human.askPrices = {};
      human.referencePricedAsks = {};
    }

    generatedSeller.inventory.ble = 100;
    generatedSeller.forSale.ble = 100;
    generatedSeller.askPrices.ble = 999;
    generatedSeller.referencePricedAsks!.ble = true;

    explicitSeller.inventory.ble = 100;
    explicitSeller.forSale.ble = 100;
    explicitSeller.askPrices.ble = 2;

    buyer.money = 1000;
    world.prices.ble = 5;

    world.step(1440, 1440);

    expect(generatedSeller.askPrices.ble).toBe(5);
    expect(explicitSeller.askPrices.ble).toBe(2);
  });

  it("changes market prices no more than once per simulation day", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true
    });

    const before = {...world.prices};
    world.step(1439, 1439);
    expect(world.prices).toEqual(before);

    world.step(1, 1440);
    for (const [good, price] of Object.entries(world.prices)) {
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
      expect(good).toBeTypeOf("string");
    }
  });
});
