import type { Good, Job } from "./types";
import { initialPriceScale } from "./glossary/nutritionCost";

export interface ActivityDefinition {
  job: Exclude<Job, "idle">;
  labelKey: string;
  output: Good;
  referenceEtp: number;
  annualOutputFor1000: number;
  competence: string;
  dormant?: boolean;
}

export const GOODS: Good[] = [
  "ble", "pomme_de_terre", "legumineuses", "legumes", "fruits",
  "huile_olive", "lait", "oeufs", "volaille", "porc", "poisson", "gibier",
  "vetement", "chauffage", "outil", "logement"
];

export const CONSUMED_GOODS: Good[] = [
  "ble", "pomme_de_terre", "legumineuses", "legumes", "fruits",
  "huile_olive", "lait", "oeufs", "poisson", "vetement", "chauffage", "outil"
];

export const DAILY_NEED: Record<Good, number> = {
  ble: 0.300, pomme_de_terre: 0.300, legumineuses: 0.100, legumes: 0.400, fruits: 0.300,
  huile_olive: 0.025, lait: 0.400, oeufs: 0.050, volaille: 0, porc: 0, poisson: 0.100, gibier: 0,
  vetement: 1 / 365, chauffage: 0, outil: 0.30 / 365, logement: 0
};

const RAW_INITIAL_PRICE: Partial<Record<Good, number>> = {
  ble: 110.8360672146801, pomme_de_terre: 11.08360672146801, legumineuses: 110.8360672146801,
  legumes: 11.08360672146801, fruits: 22.16721344293602, huile_olive: 307.8779644852224,
  lait: 4.105039526469632, oeufs: 1.970418972705424, poisson: 59.11256918116271,
  vetement: 3694.535573822669, chauffage: 3694.535573822669, outil: 738.9071147645338,
  logement: 5541.803360734004
};

const referenceBasketCost = CONSUMED_GOODS.reduce(
  (sum, good) => sum + DAILY_NEED[good] * (RAW_INITIAL_PRICE[good] ?? 0),
  0
);

export const NUTRITIONALLY_CALIBRATED_PRICE_SCALE = initialPriceScale(RAW_INITIAL_PRICE);

export const INITIAL_PRICE: Record<Good, number> = Object.fromEntries(
  GOODS.map(good => [
    good,
    (RAW_INITIAL_PRICE[good] ?? 0) * NUTRITIONALLY_CALIBRATED_PRICE_SCALE
  ])
) as Record<Good, number>;

const activityRows: Array<[Exclude<Job, "idle">, string, Good, number, number, string, boolean?]> = [
  ["agriculture_ble", "job.agriculture_ble", "ble", 164.25, 109500, "agriculture"],
  ["agriculture_pomme_de_terre", "job.agriculture_pomme_de_terre", "pomme_de_terre", 16.425, 109500, "agriculture"],
  ["agriculture_legumineuses", "job.agriculture_legumineuses", "legumineuses", 54.75, 36500, "agriculture"],
  ["horticulture_legumes", "job.horticulture_legumes", "legumes", 21.9, 146000, "horticulture"],
  ["arboriculture_fruits", "job.arboriculture_fruits", "fruits", 32.85, 109500, "arboriculture"],
  ["oliviculture", "job.oliviculture", "huile_olive", 38, 9120, "arboriculture"],
  ["élevage_lait", "job.elevage_lait", "lait", 8.11111111111111, 146000, "élevage"],
  ["aviculture_oeufs", "job.aviculture_oeufs", "oeufs", 0.48666666666666664, 18250, "élevage"],
  ["pêche", "job.peche", "poisson", 29.2, 36500, "pêche"],
  ["chasse", "job.chasse", "gibier", 0, 0, "chasse", true],
  ["textile", "job.textile", "vetement", 50, 1000, "artisanat"],
  ["construction", "job.construction", "logement", 25, 333.3333333333333, "construction", true],
  ["bois_chauffage", "job.bois_chauffage", "chauffage", 50, 1000, "foresterie"],
  ["outillage", "job.outillage", "outil", 3, 300, "artisanat"]
];

export const ACTIVITIES: ActivityDefinition[] = activityRows.map(
  ([job, labelKey, output, referenceEtp, annualOutputFor1000, competence, dormant]) => ({
    job, labelKey, output, referenceEtp, annualOutputFor1000, competence, dormant
  })
);

export const ACTIVE_REFERENCE_ETP = ACTIVITIES
  .filter(activity => !activity.dormant && activity.referenceEtp > 0)
  .reduce((sum, activity) => sum + activity.referenceEtp, 0);

export function dailyOutputPerEtp(activity: ActivityDefinition): number {
  return activity.annualOutputFor1000 / activity.referenceEtp / 365;
}

export function activityByJob(job: Job): ActivityDefinition | undefined {
  return ACTIVITIES.find(activity => activity.job === job);
}

export const GOOD_PRICE_UNIT: Record<Good, string> = {
  ble: "kg",
  pomme_de_terre: "kg",
  legumineuses: "kg",
  legumes: "kg",
  fruits: "kg",
  huile_olive: "kg",
  lait: "kg",
  oeufs: "kg",
  volaille: "kg",
  porc: "kg",
  poisson: "kg",
  gibier: "kg",
  vetement: "unité",
  chauffage: "tonne",
  outil: "unité",
  logement: "m²"
};

export const FOOD_GOODS: Good[] = [
  "ble", "pomme_de_terre", "legumineuses", "legumes", "fruits",
  "huile_olive", "lait", "oeufs", "volaille", "porc", "poisson", "gibier"
];
