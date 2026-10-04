import type { Good, Job } from "./types";
import { initialPriceScale } from "./glossary/nutritionCost";

export interface ActivityDefinition {
  job: Exclude<Job, "idle">;
  labelKey: string;
  output: Good;
  annualCapacityPerWorker: number;
  annualOutputPerCapacity: number;
  capacityUnit: string;
  competence: string;
  dormant?: boolean;
}

/**
 * Production pré-industrielle.
 *
 * Chaque activité est décrite par deux choses simples :
 * - la capacité qu'un travailleur peut gérer pendant un an ;
 * - la production annuelle de cette capacité.
 *
 * Exemple : 15 vaches × 600 L/vache/an = 9 000 L de lait/an.
 * Les valeurs sont volontairement prudentes : pas de tracteur,
 * engrais minéral, pesticide ou sélection animale moderne.
 */
export const ACTIVITIES: ActivityDefinition[] = [
  { job: "agriculture_ble", labelKey: "job.agriculture_ble", output: "ble", annualCapacityPerWorker: 1, annualOutputPerCapacity: 1200, capacityUnit: "ha", competence: "agriculture" },
  { job: "agriculture_pomme_de_terre", labelKey: "job.agriculture_pomme_de_terre", output: "pomme_de_terre", annualCapacityPerWorker: 0.25, annualOutputPerCapacity: 6000, capacityUnit: "ha", competence: "agriculture" },
  { job: "agriculture_legumineuses", labelKey: "job.agriculture_legumineuses", output: "legumineuses", annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 700, capacityUnit: "ha", competence: "agriculture" },
  { job: "horticulture_legumes", labelKey: "job.horticulture_legumes", output: "legumes", annualCapacityPerWorker: 0.1, annualOutputPerCapacity: 5000, capacityUnit: "ha", competence: "horticulture" },
  { job: "arboriculture_fruits", labelKey: "job.arboriculture_fruits", output: "fruits", annualCapacityPerWorker: 0.3, annualOutputPerCapacity: 2000, capacityUnit: "ha", competence: "arboriculture" },
  { job: "oliviculture", labelKey: "job.oliviculture", output: "huile_olive", annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 150, capacityUnit: "ha", competence: "arboriculture" },
  { job: "élevage_lait", labelKey: "job.elevage_lait", output: "lait", annualCapacityPerWorker: 15, annualOutputPerCapacity: 600, capacityUnit: "vache", competence: "élevage" },
  { job: "aviculture_oeufs", labelKey: "job.aviculture_oeufs", output: "oeufs", annualCapacityPerWorker: 100, annualOutputPerCapacity: 6, capacityUnit: "poule", competence: "élevage" },
  { job: "pêche", labelKey: "job.peche", output: "poisson", annualCapacityPerWorker: 1, annualOutputPerCapacity: 500, capacityUnit: "pêcheur", competence: "pêche" },
  { job: "chasse", labelKey: "job.chasse", output: "gibier", annualCapacityPerWorker: 0, annualOutputPerCapacity: 0, capacityUnit: "chasseur", competence: "chasse", dormant: true },
  { job: "textile", labelKey: "job.textile", output: "vetement", annualCapacityPerWorker: 1, annualOutputPerCapacity: 100, capacityUnit: "artisan", competence: "artisanat" },
  { job: "construction", labelKey: "job.construction", output: "logement", annualCapacityPerWorker: 1, annualOutputPerCapacity: 20, capacityUnit: "artisan", competence: "construction", dormant: true },
  { job: "bois_chauffage", labelKey: "job.bois_chauffage", output: "chauffage", annualCapacityPerWorker: 1, annualOutputPerCapacity: 5, capacityUnit: "bûcheron", competence: "foresterie" },
  { job: "outillage", labelKey: "job.outillage", output: "outil", annualCapacityPerWorker: 1, annualOutputPerCapacity: 50, capacityUnit: "artisan", competence: "artisanat" }
];

export const ACTIVE_REFERENCE_ETP = ACTIVITIES
  .filter(activity => !activity.dormant)
  .reduce((sum, activity) => sum + activity.annualCapacityPerWorker, 0);

export function annualOutputPerWorker(activity: ActivityDefinition): number {
  return activity.annualCapacityPerWorker * activity.annualOutputPerCapacity;
}

export function dailyOutputPerWorker(activity: ActivityDefinition): number {
  return annualOutputPerWorker(activity) / 365;
}

export function activityByJob(job: Job): ActivityDefinition | undefined {
  return ACTIVITIES.find(activity => activity.job === job);
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

const RAW_INITIAL_PRICE: Partial<Record<Good, number>> = {
  ble: 110.8360672146801, pomme_de_terre: 11.08360672146801, legumineuses: 110.8360672146801,
  legumes: 11.08360672146801, fruits: 22.16721344293602, huile_olive: 307.8779644852224,
  lait: 4.105039526469632, oeufs: 1.970418972705424, poisson: 59.11256918116271,
  vetement: 3694.535573822669, chauffage: 3694.535573822669, outil: 738.9071147645338,
  logement: 5541.803360734004
};

export const NUTRITIONALLY_CALIBRATED_PRICE_SCALE = initialPriceScale(RAW_INITIAL_PRICE);

export const DEFAULT_RAW_PRICE = 1000;

export const INITIAL_PRICE: Record<Good, number> = Object.fromEntries(
  GOODS.map(good => [
    good,
    (RAW_INITIAL_PRICE[good] ?? DEFAULT_RAW_PRICE) *
      NUTRITIONALLY_CALIBRATED_PRICE_SCALE
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

export const FOOD_PRODUCTION_CALIBRATION = 5;

export function dailyOutputPerEtp(activity: ActivityDefinition): number {
  const base = activity.annualOutputFor1000 / activity.referenceEtp / 365;
  return FOOD_GOODS.includes(activity.output)
    ? base * FOOD_PRODUCTION_CALIBRATION
    : base;
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
  lait: "L",
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
