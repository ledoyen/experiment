import { describe, expect, it } from "vitest";
import { defaultParameters } from "../../src/data/defaults";
import { World } from "../../src/model/World";
import type { Parameters } from "../../src/data/types";

function runDays(world: World, days: number): number[] {
  const populations: number[] = [];
  for (let day = 0; day < days; day++) {
    world.step(1440, 1440);
    populations.push(world.agents.length);
  }
  return populations;
}

describe("collective nutrition stability", () => {
  it("keeps the no-money population at 200 through the first vitamin C mortality window", () => {
    const parameters: Parameters = {
      ...defaultParameters(),
      population: 200,
      initialMoney: 100,
      moneyEnabled: false,
      mobility: 0.2,
      productivityVariance: 0.2
    };
    const world = new World(parameters, { recordSnapshots: false });

    const populations = runDays(world, 400);
    expect(populations.every(population => population === 200)).toBe(true);
  }, 120_000);
});
