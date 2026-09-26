import type { Parameters } from "./types";

export const JOBS = ["farmer", "forester", "fisher", "builder"] as const;

export function defaultParameters(): Parameters {
  return {
    population: 200,
    initialMoney: 100,
    moneyEnabled: false,
    mobility: 0.2,
    priceSensitivity: 0.15,
    productivityVariance: 0.2
  };
}
