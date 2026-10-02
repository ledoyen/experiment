export type Sex = "male" | "female";
export type PhysiologyState = "normal" | "pregnancy" | "lactation";

export type Good =
  | "ble" | "pomme_de_terre" | "legumineuses" | "legumes" | "fruits" | "huile_olive"
  | "lait" | "oeufs" | "volaille" | "porc" | "poisson" | "gibier" | "vetement"
  | "chauffage" | "outil" | "logement";

export type Job =
  | "agriculture_ble" | "agriculture_pomme_de_terre" | "agriculture_legumineuses"
  | "horticulture_legumes" | "arboriculture_fruits" | "oliviculture" | "élevage_lait"
  | "aviculture_oeufs" | "pêche" | "chasse" | "textile" | "construction"
  | "bois_chauffage" | "outillage" | "idle";

export interface Parameters {
  population: number; initialMoney: number; moneyEnabled: boolean; mobility: number;
  priceSensitivity: number; productivityVariance: number;
}

import type { NutritionId, NutritionReserves } from "./nutrition";

export interface ParameterChangeEvent {
  minute: number;
  parameter: keyof Parameters;
  previousValue: Parameters[keyof Parameters];
  newValue: Parameters[keyof Parameters];
}

export type AgentEvent =
  | {
      minute: number;
      type: "healthCritical";
      nutrient: NutritionId;
      ratio: number;
    }
  | {
      minute: number;
      type: "jobChange";
      previousJob: Job;
      newJob: Job;
      previousIncome: number;
      expectedIncome: number;
    };

export type HumanId = number;

export interface AvailableGood {
  name: Good;
  sellerId: HumanId;
  price: number;
  stock: number;
}

export interface PurchaseDecision {
  name: Good;
  sellerId: HumanId;
  price: number;
  quantity: number;
}

export interface Human {
  id: HumanId;
  x: number;
  y: number;
  job: Job;
  productivity: number;

  // An individual's complete economic/physiological state.
  reserves: NutritionReserves;
  sex: Sex;
  state: PhysiologyState;
  metabolicFactor: number;
  money: number;

  // Physical ownership is the source of truth. forSale is only the
  // quantity currently exposed to the market.
  inventory: Partial<Record<Good, number>>;
  forSale: Partial<Record<Good, number>>;
  askPrices: Partial<Record<Good, number>>;

  events: AgentEvent[];
  nextJobReviewMinute: number;
}

// Kept temporarily as a compatibility alias for rendering/UI code.
export type Agent = Human;


export interface Metrics {
  minute: number; population: number; medianWealth: number; gini: number; foodPrice: number;
  moneySupply: number; prices: Record<Good, number>; stocks: Record<Good, number>;
  wealthBins: number[];
  wealthBinSums: number[];
  wealthBinEdges: number[];
  wealthTotal: number;
  wealthMin: number;
  wealthMax: number;
  productivityBins: number[];
  productivityBinSums: number[];
  productivityBinEdges: number[];
  productivityMin: number;
  productivityMax: number;
  jobCounts: Record<Job, number>;
}
