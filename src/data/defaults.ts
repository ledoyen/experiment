import type { Parameters } from "./types";

// Legacy job labels retained for parameter compatibility; the active production jobs are defined in economy.ts.
export const JOBS = ["farmer", "forester", "fisher", "builder"] as const;

export function defaultParameters(): Parameters {
  return {
    // 200 is a small village-scale population: large enough for markets and distributions, small enough to inspect in the browser.
    population: 200,
    // 100 monetary units is only an initial experimental condition; it has no real-world currency meaning.
    initialMoney: 100,
    // The baseline experiment starts before money is introduced, matching the research question.
    moneyEnabled: false,
    // 0.2 is a deliberately moderate probability scale for job mobility; it is a model parameter, not an empirical estimate.
    mobility: 0.2,
    // 0.15 makes prices react gradually to daily supply/demand imbalance instead of jumping instantly.
    priceSensitivity: 0.15,
    // 0.2 is a log-normal productivity dispersion chosen to create visible heterogeneity without making a few agents dominate the village.
    productivityVariance: 0.2
  };
}
