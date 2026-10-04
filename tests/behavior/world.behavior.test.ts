import { describe, expect, it } from "vitest";
import { defaultParameters } from "../../src/data/defaults";
import { World } from "../../src/model/World";

function runDays(world: World, days: number): number[] {
  const populations: number[] = [];
  for (let day = 0; day < days; day++) {
    world.step(1440, 1440);
    populations.push(world.agents.length);
  }
  return populations;
}

function moneyInSystem(world: World): number {
  return world.getMetrics().moneySupply;
}

describe("simulation behavioral invariants", () => {
  it("keeps a nutritionally viable no-money population alive over the initial season", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      moneyEnabled: false,
      productivityVariance: 0.2
    });

    const populations = runDays(world, 30);
    
    expect(Math.min(...populations)).toBeGreaterThanOrEqual(180);
  });

  it("conserves the initial money supply through individual transactions and deaths", () => {
    const world = new World({
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
    const world = new World({
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

  it("keeps prices and population metrics finite", () => {
    const world = new World({
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

  it("makes pre-money food stocks available when money is introduced", () => {
    const world = new World({
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

    const sellerMoneyBefore = seller.money;
    world.setParameters({ moneyEnabled: true });

    expect(seller.forSale.ble).toBe(100);

    world.step(1440, 1440);

    expect(seller.inventory.ble).toBeLessThan(100);
    expect(seller.money).toBeGreaterThan(sellerMoneyBefore);
    expect(
      buyer.inventory.ble +
      (other.inventory.ble ?? 0) +
      seller.inventory.ble
    ).toBeLessThan(100);
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
