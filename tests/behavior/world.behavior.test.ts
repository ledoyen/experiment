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

  it("keeps prices and population metrics finite", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    for (let day = 0; day < 60; day++) {
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

  it("moves workers toward suddenly absent tool production", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      mobility: 1,
      priceSensitivity: 1
    });

    world.prices.outil = 10000;

    for (const agent of world.agents) {
      if (agent.job === "outillage") agent.job = "textile";
      agent.nextJobReviewMinute = 0;
    }

    const before = world.agents.filter(
      agent => agent.job === "outillage"
    ).length;
    expect(before).toBe(0);

    world.step(1440, 1440);

    const after = world.agents.filter(
      agent => agent.job === "outillage"
    ).length;

    expect(world.prices.outil).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it("routes a good purchase to the chosen seller and consumes the purchased food", () => {
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
      human.inventory = {};
      human.forSale = {};
      human.askPrices = {};
      human.money = human.id === buyer.id ? 1000 : 0;
    }

    sellerA.inventory.oeufs = 10;
    sellerA.forSale.oeufs = 10;
    sellerA.askPrices.oeufs = 1;

    sellerB.inventory.oeufs = 10;
    sellerB.forSale.oeufs = 10;
    sellerB.askPrices.oeufs = 2;

    const sellerABefore = sellerA.inventory.oeufs;
    const sellerBBefore = sellerB.inventory.oeufs;
    const moneyBefore = sellerA.money + sellerB.money + buyer.money;

    world.step(1440, 1440);

    expect(sellerA.inventory.oeufs).toBeLessThan(sellerABefore);
    expect(sellerA.forSale.oeufs).toBeLessThan(10);
    expect(sellerA.inventory.oeufs).toBeLessThan(sellerB.inventory.oeufs);

    const moneyAfter = world.getMetrics().moneySupply;
    expect(Math.abs(moneyAfter - moneyBefore)).toBeLessThan(1e-6);
  });

  it("makes a high-value scarce job economically attractive without requiring synchronized switching", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 10000,
      moneyEnabled: true,
      mobility: 1,
      priceSensitivity: 1
    });

    world.prices.outil = 10000;

    for (const agent of world.agents) {
      agent.nextJobReviewMinute = 0;
      if (agent.job === "outillage") agent.job = "textile";
    }

    world.step(1440, 1440);

    expect(world.prices.outil).toBeGreaterThan(0);
    expect(
      world.agents.filter(agent => agent.job === "outillage").length
    ).toBeGreaterThan(0);
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
