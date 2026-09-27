export type Job = "farmer" | "forester" | "fisher";
export type Good = "food" | "wood" | "fish";

export interface Parameters {
  population: number;
  initialMoney: number;
  moneyEnabled: boolean;
  mobility: number;
  priceSensitivity: number;
  productivityVariance: number;
}

export interface Agent {
  id: number;
  x: number;
  y: number;
  job: Job;
  productivity: number;
  money: number;
}

export interface Metrics {
  minute: number;
  population: number;
  medianWealth: number;
  gini: number;
  foodPrice: number;
  moneySupply: number;
  prices: Record<Good, number>;
  wealthBins: number[];
  wealthBinSums: number[];
  wealthTotal: number;
  wealthMin: number;
  wealthMax: number;
  productivityBins: number[];
  productivityMin: number;
  productivityMax: number;
}
