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
  // 1 ha × 1,200 kg/ha/year: conservative preindustrial grain yield. Medieval wheat yields around 0.5 t/ha are documented by 1200; this value is intentionally above that lower bound but below modern yields. Source: https://ndl.ethernet.edu.et/bitstream/123456789/62597/1/Vaclav%20Smil_2013.pdf
  { job: "agriculture_ble", labelKey: "job.agriculture_ble", output: "ble", initialWorkerShare: 0.12, annualCapacityPerWorker: 1, annualOutputPerCapacity: 1200, capacityUnit: "ha", competence: "agriculture" },
  // 0.25 ha/worker and 6 t/ha/year: deliberately modest root-crop yield, below modern potato yields. Source context: https://www.fao.org/4/ap643e/ap643e.pdf
  { job: "agriculture_pomme_de_terre", labelKey: "job.agriculture_pomme_de_terre", output: "pomme_de_terre", initialWorkerShare: 0.08, annualCapacityPerWorker: 0.25, annualOutputPerCapacity: 6000, capacityUnit: "ha", competence: "agriculture" },
  // 0.5 ha/worker and 700 kg/ha/year: modest pulse yield, chosen to stay compatible with low-input cultivation. Historical grain/pulse yields vary widely. Source: https://www.bahs.org.uk/crop-yields-database/the-data/
  { job: "agriculture_legumineuses", labelKey: "job.agriculture_legumineuses", output: "legumineuses", initialWorkerShare: 0.06, annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 700, capacityUnit: "ha", competence: "agriculture" },
  // 0.1 ha/worker and 5 t/ha/year: small intensive garden area with hand cultivation; this is a simulation assumption, not a modern field yield. Reference: https://www.fao.org/faostat/
  { job: "horticulture_legumes", labelKey: "job.horticulture_legumes", output: "legumes", initialWorkerShare: 0.05, annualCapacityPerWorker: 0.1, annualOutputPerCapacity: 5000, capacityUnit: "ha", competence: "horticulture" },
  // 0.3 ha/worker and 2 t/ha/year: conservative perennial-orchard output; fruit yields vary strongly by crop and year. Reference: https://www.fao.org/faostat/
  { job: "arboriculture_fruits", labelKey: "job.arboriculture_fruits", output: "fruits", initialWorkerShare: 0.04, annualCapacityPerWorker: 0.3, annualOutputPerCapacity: 2000, capacityUnit: "ha", competence: "arboriculture" },
  // 0.5 ha/worker and 150 kg oil/ha/year: intentionally modest olive-oil output for low-input groves. Reference: https://www.fao.org/faostat/
  { job: "oliviculture", labelKey: "job.oliviculture", output: "huile_olive", initialWorkerShare: 0.02, annualCapacityPerWorker: 0.5, annualOutputPerCapacity: 150, capacityUnit: "ha", competence: "arboriculture" },
  // 15 cows/worker and 600 L/cow/year: extensive traditional dairy, within FAO's 330–880 L/cow/year range for extensive systems. Source: https://www.fao.org/4/x5547e/x5547e26.htm
  { job: "élevage_lait", labelKey: "job.elevage_lait", output: "lait", initialWorkerShare: 0.08, annualCapacityPerWorker: 15, annualOutputPerCapacity: 600, capacityUnit: "vache", competence: "élevage" },
  // 100 hens/worker and 6 kg eggs/hen/year (~100 eggs): this is a low-input assumption, above the 20–60 eggs/year traditional range but far below commercial layers. Source: https://www.fao.org/4/y5169e/y5169e0b.htm
  { job: "aviculture_oeufs", labelKey: "job.aviculture_oeufs", output: "oeufs", initialWorkerShare: 0.04, annualCapacityPerWorker: 100, annualOutputPerCapacity: 6, capacityUnit: "poule", competence: "élevage" },
  // 500 kg/fisher/year: deliberately simple low-technology catch assumption; the simulation does not model boats or fishing gear yet. Reference: https://www.fao.org/fishery/en
  { job: "pêche", labelKey: "job.peche", output: "poisson", initialWorkerShare: 0.04, annualCapacityPerWorker: 1, annualOutputPerCapacity: 500, capacityUnit: "pêcheur", competence: "pêche" },
  { job: "chasse", labelKey: "job.chasse", output: "gibier", initialWorkerShare: 0, annualCapacityPerWorker: 0, annualOutputPerCapacity: 0, capacityUnit: "chasseur", competence: "chasse", dormant: true },
  { job: "textile", labelKey: "job.textile", output: "vetement", initialWorkerShare: 0.12, annualCapacityPerWorker: 1, annualOutputPerCapacity: 100, capacityUnit: "artisan", competence: "artisanat" },
  { job: "construction", labelKey: "job.construction", output: "logement", initialWorkerShare: 0.05, annualCapacityPerWorker: 1, annualOutputPerCapacity: 20, capacityUnit: "artisan", competence: "construction", dormant: true },
  { job: "bois_chauffage", labelKey: "job.bois_chauffage", output: "chauffage", initialWorkerShare: 0.14, annualCapacityPerWorker: 1, annualOutputPerCapacity: 5, capacityUnit: "bûcheron", competence: "foresterie" },
  { job: "outillage", labelKey: "job.outillage", output: "outil", initialWorkerShare: 0.07, annualCapacityPerWorker: 1, annualOutputPerCapacity: 50, capacityUnit: "artisan", competence: "artisanat" }
];

// These are the foods that can plausibly form a household reserve between harvests. Historical sources emphasize grain storage as a key famine buffer. Source: https://www.fao.org/4/w4979e/w4979e04.htm
export const DURABLE_FOOD_GOODS: Good[] = [
  "ble", "pomme_de_terre", "legumineuses", "huile_olive"
];

// 90 days is a modelling starting point, deliberately finite: storage exists, but is not an unlimited buffer. Historical grain reserves are well documented. Source: https://www.fao.org/4/w4979e/w4979e04.htm
export const INITIAL_DURABLE_FOOD_STOCK_DAYS = 90;

// Pure bookkeeping conversion from annual production to an initial household reserve.
export function initialFoodStockPerPerson(good: Good): number {
  if (!DURABLE_FOOD_GOODS.includes(good)) return 0;
  const activity = ACTIVITIES.find(item => item.output === good);
  if (!activity) return 0;
  const annualPerWorker = annualOutputPerWorker(activity);
  const share = activity.initialWorkerShare / Math.max(ACTIVE_WORKER_SHARE, 1);
  return annualPerWorker * share * INITIAL_DURABLE_FOOD_STOCK_DAYS / 365;
}

// Sum of explicit starting workforce shares; keeping this visible makes the initial labour allocation auditable.
export const ACTIVE_WORKER_SHARE = ACTIVITIES
  .filter(activity => !activity.dormant)
  .reduce((sum, activity) => sum + activity.initialWorkerShare, 0);

// Pure and deliberately simple: capacity multiplied by output per capacity.
export function annualOutputPerWorker(activity: ActivityDefinition): number {
  return activity.annualCapacityPerWorker * activity.annualOutputPerCapacity;
}

// Pure unit conversion from annual output to a daily average.
export function dailyOutputPerWorker(activity: ActivityDefinition): number {
  return annualOutputPerWorker(activity) / 365;
}

// Pure lookup used by the simulation engine.
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
