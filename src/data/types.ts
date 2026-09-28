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

import type { NutritionReserves } from "./nutrition";

export interface Agent {
  id: number; x: number; y: number; job: Job; productivity: number; money: number;
  sex: Sex; physiologyState: PhysiologyState; nutrition: NutritionReserves;
  heatingStock: number;
}

export interface Metrics {
  minute: number; population: number; medianWealth: number; gini: number; foodPrice: number;
  moneySupply: number; prices: Record<Good, number>;
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
}
