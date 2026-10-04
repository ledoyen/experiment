import type { Good, Job } from "./types";
import { initialPriceScale } from "./glossary/nutritionCost";

export interface ActivityDefinition {
  job: Exclude<Job, "idle">;
  labelKey: string;
  output: Good;
  initialWorkerShare: number;
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
  { job: "agriculture_ble", labelKey: "job.agriculture_ble", output: "ble", initialWorkerShare: 0.12, annualCapacityPerWorker: 1, annualOutputPerCapacity: 1200, capacityUnit: "ha", competence: "agriculture" },
  { job: "agriculture_pomme_de_terre", labelKey: "job.agriculture_pomme_de_terre", output: "pomme_de_terre", initialWorkerShare: 0.08, annualCapacityPerWorker: 0.25, annualOutputPerCapacity: 6000, capacityUnit: "ha", competence: "agriculture" },
  { job: "agriculture_legumineuses", labelKey: "job.agriculture_legumineuses", output: "legumineuses", initialWorkerShare: 0.06, annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 700, capacityUnit: "ha", competence: "agriculture" },
  { job: "horticulture_legumes", labelKey: "job.horticulture_legumes", output: "legumes", initialWorkerShare: 0.05, annualCapacityPerWorker: 0.1, annualOutputPerCapacity: 5000, capacityUnit: "ha", competence: "horticulture" },
  { job: "arboriculture_fruits", labelKey: "job.arboriculture_fruits", output: "fruits", initialWorkerShare: 0.04, annualCapacityPerWorker: 0.3, annualOutputPerCapacity: 2000, capacityUnit: "ha", competence: "arboriculture" },
  { job: "oliviculture", labelKey: "job.oliviculture", output: "huile_olive", initialWorkerShare: 0.02, annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 150, capacityUnit: "ha", competence: "arboriculture" },
  { job: "élevage_lait", labelKey: "job.elevage_lait", output: "lait", initialWorkerShare: 0.08, annualCapacityPerWorker: 15, annualOutputPerCapacity: 600, capacityUnit: "vache", competence: "élevage" },
  { job: "aviculture_oeufs", labelKey: "job.aviculture_oeufs", output: "oeufs", initialWorkerShare: 0.04, annualCapacityPerWorker: 100, annualOutputPerCapacity: 6, capacityUnit: "poule", competence: "élevage" },
  { job: "pêche", labelKey: "job.peche", output: "poisson", initialWorkerShare: 0.04, annualCapacityPerWorker: 1, annualOutputPerCapacity: 500, capacityUnit: "pêcheur", competence: "pêche" },
  { job: "chasse", labelKey: "job.chasse", output: "gibier", initialWorkerShare: 0, annualCapacityPerWorker: 0, annualOutputPerCapacity: 0, capacityUnit: "chasseur", competence: "chasse", dormant: true },
  { job: "textile", labelKey: "job.textile", output: "vetement", initialWorkerShare: 0.12, annualCapacityPerWorker: 1, annualOutputPerCapacity: 100, capacityUnit: "artisan", competence: "artisanat" },
  { job: "construction", labelKey: "job.construction", output: "logement", initialWorkerShare: 0.05, annualCapacityPerWorker: 1, annualOutputPerCapacity: 20, capacityUnit: "artisan", competence: "construction", dormant: true },
  { job: "bois_chauffage", labelKey: "job.bois_chauffage", output: "chauffage", initialWorkerShare: 0.14, annualCapacityPerWorker: 1, annualOutputPerCapacity: 5, capacityUnit: "bûcheron", competence: "foresterie" },
  { job: "outillage", labelKey: "job.outillage", output: "outil", initialWorkerShare: 0.07, annualCapacityPerWorker: 1, annualOutputPerCapacity: 50, capacityUnit: "artisan", competence: "artisanat" }
];

export const ACTIVE_WORKER_SHARE = ACTIVITIES
  .filter(activity => !activity.dormant)
  .reduce((sum, activity) => sum + activity.initialWorkerShare, 0);

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
