/**
 * PRODUCTION SAISONNIÈRE — glossaire
 *
 * Chaque profil contient quatre coefficients (hiver, printemps, été, automne).
 * La moyenne des coefficients est 1 afin de conserver le rendement annuel
 * de référence du XLS tout en répartissant la production dans le temps.
 *
 * Ces profils sont des paramètres de simulation, pas des constantes biologiques.
 */

import type { Job } from "../types";
import type { Season } from "./calendar";
import { seasonOfDay } from "./calendar";

export const SEASON_ORDER: Season[] = ["winter", "spring", "summer", "autumn"];

type SeasonalProfile = Record<Season, number>;

export const PRODUCTION_SEASONALITY: Partial<Record<Job, SeasonalProfile>> = {
  agriculture_ble: {
    winter: 0.8, spring: 0.8, summer: 1.4, autumn: 1.0
  },
  agriculture_pomme_de_terre: {
    winter: 0.8, spring: 0.8, summer: 1.2, autumn: 1.2
  },
  agriculture_legumineuses: {
    winter: 0.8, spring: 0.8, summer: 1.4, autumn: 1.0
  },
  horticulture_legumes: {
    winter: 0.8, spring: 1.2, summer: 1.2, autumn: 0.8
  },
  arboriculture_fruits: {
    winter: 0.5, spring: 1.0, summer: 1.8, autumn: 0.7
  },
  oliviculture: {
    winter: 0.5, spring: 0.8, summer: 1.2, autumn: 1.5
  },
  "élevage_lait": {
    winter: 0.9, spring: 1.0, summer: 1.1, autumn: 1.0
  },
  aviculture_oeufs: {
    winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0
  },
  pêche: {
    winter: 0.9, spring: 1.2, summer: 1.0, autumn: 0.9
  },
  textile: {
    winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0
  },
  construction: {
    winter: 0.8, spring: 1.2, summer: 1.2, autumn: 0.8
  },
  bois_chauffage: {
    winter: 0.8, spring: 1.0, summer: 1.0, autumn: 1.2
  },
  outillage: {
    winter: 1.0, spring: 1.0, summer: 1.0, autumn: 1.0
  }
};

const DEFAULT_PROFILE: SeasonalProfile = {
  winter: 1,
  spring: 1,
  summer: 1,
  autumn: 1
};

export function seasonalProductionMultiplier(
  job: Job,
  simulationDay: number
): number {
  return (PRODUCTION_SEASONALITY[job] ?? DEFAULT_PROFILE)[seasonOfDay(simulationDay)];
}
