/**
 * BIENS DURABLES / ENTRETIEN — glossaire
 *
 * These are annual replacement/maintenance flows, not a fixed food basket.
 * They create ordinary demand for clothing and tools even when nobody is
 * currently expanding the population or building new housing.
 */

import type { Good } from "../types";

export const ANNUAL_MAINTENANCE_NEED: Record<"vetement" | "outil", number> = {
  vetement: 1,
  outil: 0.30
};

export function dailyMaintenanceNeed(
  good: "vetement" | "outil"
): number {
  return ANNUAL_MAINTENANCE_NEED[good] / 365;
}

export const MAINTENANCE_GOODS: Array<"vetement" | "outil"> = [
  "vetement",
  "outil"
];
