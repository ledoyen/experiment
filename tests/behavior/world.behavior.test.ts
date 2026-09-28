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

  it("does not wipe out the whole monetary population in the first ten days", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    const populations = runDays(world, 10);

    expect(Math.min(...populations)).toBeGreaterThanOrEqual(160);
  });

  it("does not make every death happen on exactly the same day", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      productivityVariance: 0.2
    });

    const deathDays: number[] = [];
    let previous = world.agents.length;

    for (let day = 1; day <= 60; day++) {
      world.step(1440, 1440);
      const current = world.agents.length;
      if (current < previous) deathDays.push(day);
      previous = current;
      if (current === 0) break;
    }

    if (deathDays.length > 0) {
      expect(new Set(deathDays).size).toBeGreaterThan(1);
    }
  });

  it("conserves the initial money supply through purchases and deaths", () => {
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

    for (let day = 0; day < 120; day++) {
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

  it("moves workers toward a suddenly absent production", () => {
    const world = new World({
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: true,
      mobility: 1,
      priceSensitivity: 1
    });

    const targetJob = "agriculture_ble" as const;
    for (const agent of world.agents) {
      if (agent.job === targetJob) agent.job = "agriculture_pomme_de_terre";
    }

    const before = world.agents.filter(agent => agent.job === targetJob).length;
    expect(before).toBe(0);

    world.step(1440, 1440);

    const after = world.agents.filter(agent => agent.job === targetJob).length;
    expect(after).toBeGreaterThan(0);
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
