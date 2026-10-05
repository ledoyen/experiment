import type { Good, PhysiologyState, Sex } from "./types";

export type NutritionId =
  | "energy" | "protein" | "carbohydrate" | "fat" | "fiber"
  | "vitamin_A" | "vitamin_B1" | "vitamin_B2" | "vitamin_B3"
  | "vitamin_B6" | "vitamin_B9" | "vitamin_B12" | "vitamin_C"
  | "vitamin_E" | "vitamin_K"
  | "calcium" | "iron" | "magnesium" | "zinc" | "iodine" | "selenium";

export interface NutritionDefinition {
  id: NutritionId;
  labelKey: string;
  unit: string;
  maxDays: number;
  target: Record<Sex, number>;
  pregnancy?: number;
  lactation?: number;
}

export interface NutritionMortalityRule {
  criticalReserveDays: number;
  lethalAfterDays: number;
}

// These are intentionally conservative simulation thresholds, not clinical diagnostic cut-offs.
// They represent the point where the model considers the remaining physiological reserve critically low.
// The durations reflect the very different time scales of acute starvation and micronutrient depletion.
// Vitamin C deficiency can produce scurvy within about one month of very low intake; iron deficiency
// progresses through depleted stores before anaemia. Sources: https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/
// https://www.who.int/docs/default-source/micronutrients/9789241596107-annex1.pdf
export const NUTRITION_MORTALITY: Record<NutritionId, NutritionMortalityRule> = {
  energy: { criticalReserveDays: 0.5, lethalAfterDays: 2 },
  protein: { criticalReserveDays: 1, lethalAfterDays: 21 },
  carbohydrate: { criticalReserveDays: 1, lethalAfterDays: 21 },
  fat: { criticalReserveDays: 1, lethalAfterDays: 30 },
  fiber: { criticalReserveDays: 1, lethalAfterDays: 60 },
  vitamin_A: { criticalReserveDays: 1, lethalAfterDays: 180 },
  vitamin_B1: { criticalReserveDays: 1, lethalAfterDays: 60 },
  vitamin_B2: { criticalReserveDays: 1, lethalAfterDays: 180 },
  vitamin_B3: { criticalReserveDays: 1, lethalAfterDays: 60 },
  vitamin_B6: { criticalReserveDays: 1, lethalAfterDays: 180 },
  vitamin_B9: { criticalReserveDays: 1, lethalAfterDays: 120 },
  vitamin_B12: { criticalReserveDays: 1, lethalAfterDays: 365 },
  vitamin_C: { criticalReserveDays: 1, lethalAfterDays: 45 },
  vitamin_E: { criticalReserveDays: 1, lethalAfterDays: 365 },
  vitamin_K: { criticalReserveDays: 1, lethalAfterDays: 90 },
  calcium: { criticalReserveDays: 1, lethalAfterDays: 365 },
  iron: { criticalReserveDays: 1, lethalAfterDays: 180 },
  magnesium: { criticalReserveDays: 1, lethalAfterDays: 60 },
  zinc: { criticalReserveDays: 1, lethalAfterDays: 180 },
  iodine: { criticalReserveDays: 1, lethalAfterDays: 180 },
  selenium: { criticalReserveDays: 1, lethalAfterDays: 365 }
};

export interface NutritionReserve {
  value: number;
  max: number;
  unit: string;
  labelKey: string;
  maxDays: number;
}

export type NutritionReserves = Record<NutritionId, NutritionReserve>;

export interface FoodNutrition {
  kcal: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  fiber: number;
  vitamin_A: number;
  vitamin_B1: number;
  vitamin_B2: number;
  vitamin_B3: number;
  vitamin_B6: number;
  vitamin_B9: number;
  vitamin_B12: number;
  vitamin_C: number;
  vitamin_E: number;
  vitamin_K: number;
  calcium: number;
  iron: number;
  magnesium: number;
  zinc: number;
  iodine: number;
  selenium: number;
}

// Start with at least 90% of each physiological reserve: this avoids an artificial day-one deficit while keeping individuals heterogeneous. This is a simulation initial condition, not a medical recommendation.
export const INITIAL_RESERVE_MIN_RATIO = 0.90;

// ±10% individual variation is a deliberately small modelling range around the population reference values; real nutrient needs vary with sex, size, activity and physiological state. Source: https://www.efsa.europa.eu/fr/topics/topic/dietary-reference-values
export const INDIVIDUAL_REQUIREMENT_VARIANCE = 0.10;

// Adult reference values are based on ANSES/EFSA dietary reference values; the model keeps the initial scope intentionally small and uses sex-specific values where the source supports them. Source: https://www.anses.fr/en/system/files/NUT2012SA0103Ra-1EN.pdf
export const NUTRITION: NutritionDefinition[] = [
  { id: "energy", labelKey: "phys.energy", unit: "kcal", maxDays: 7, target: { male: 2500, female: 2000 } },
  { id: "protein", labelKey: "phys.protein", unit: "g", maxDays: 7, target: { male: 58.1, female: 58.1 } },
  { id: "carbohydrate", labelKey: "phys.carbohydrate", unit: "g", maxDays: 7, target: { male: 328.1, female: 262.5 } },
  { id: "fat", labelKey: "phys.fat", unit: "g", maxDays: 7, target: { male: 76.4, female: 61.1 } },
  { id: "fiber", labelKey: "phys.fiber", unit: "g", maxDays: 7, target: { male: 25, female: 25 } },
  { id: "vitamin_A", labelKey: "phys.vitamin_A", unit: "µg RE", maxDays: 30, target: { male: 750, female: 650 } },
  { id: "vitamin_B1", labelKey: "phys.vitamin_B1", unit: "mg", maxDays: 30, target: { male: 1.1, female: 0.9 } },
  { id: "vitamin_B2", labelKey: "phys.vitamin_B2", unit: "mg", maxDays: 30, target: { male: 1.6, female: 1.4 } },
  { id: "vitamin_B3", labelKey: "phys.vitamin_B3", unit: "mg NE", maxDays: 30, target: { male: 16, female: 13 } },
  { id: "vitamin_B6", labelKey: "phys.vitamin_B6", unit: "mg", maxDays: 30, target: { male: 1.7, female: 1.6 } },
  { id: "vitamin_B9", labelKey: "phys.vitamin_B9", unit: "µg DFE", maxDays: 30, target: { male: 330, female: 330 } },
  { id: "vitamin_B12", labelKey: "phys.vitamin_B12", unit: "µg", maxDays: 30, target: { male: 4, female: 4 } },
  { id: "vitamin_C", labelKey: "phys.vitamin_C", unit: "mg", maxDays: 30, target: { male: 110, female: 95 } },
  { id: "vitamin_E", labelKey: "phys.vitamin_E", unit: "mg", maxDays: 30, target: { male: 13, female: 11 } },
  { id: "vitamin_K", labelKey: "phys.vitamin_K", unit: "µg", maxDays: 30, target: { male: 70, female: 70 } },
  { id: "calcium", labelKey: "phys.calcium", unit: "mg", maxDays: 30, target: { male: 950, female: 950 } },
  { id: "iron", labelKey: "phys.iron", unit: "mg", maxDays: 30, target: { male: 11, female: 16 } },
  { id: "magnesium", labelKey: "phys.magnesium", unit: "mg", maxDays: 30, target: { male: 350, female: 300 } },
  { id: "zinc", labelKey: "phys.zinc", unit: "mg", maxDays: 30, target: { male: 9.4, female: 7.5 } },
  { id: "iodine", labelKey: "phys.iodine", unit: "µg", maxDays: 30, target: { male: 150, female: 150 } },
  { id: "selenium", labelKey: "phys.selenium", unit: "µg", maxDays: 30, target: { male: 70, female: 70 } }
];

// Milk is displayed and stored in litres; 1 L of milk is approximately 1.03 kg, used only to convert volume to mass for nutrition data. Source: https://www.fao.org/4/t0251e/t0251e01.htm
export const FOOD_DENSITY_KG_PER_UNIT: Partial<Record<Good, number>> = {
  lait: 1.03
};

// Nutrient composition is expressed per 100 g; values are based on representative food composition data. They should be replaced with exact Ciqual entries when the simulation food list is finalized. Source: https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table
export const FOOD_NUTRITION: Partial<Record<Good, FoodNutrition>> = {
  ble: { kcal: 340, protein: 13.5, carbohydrate: 60, fat: 2.5, fiber: 10.7, vitamin_A: 0, vitamin_B1: .45, vitamin_B2: .1, vitamin_B3: 4.7, vitamin_B6: .34, vitamin_B9: 40, vitamin_B12: 0, vitamin_C: 0, vitamin_E: 1, vitamin_K: 2, calcium: 34, iron: 3.8, magnesium: 126, zinc: 2.9, iodine: 0, selenium: 70 },
  pomme_de_terre: { kcal: 80, protein: 1.8, carbohydrate: 16.7, fat: .3, fiber: 2.2, vitamin_A: 0, vitamin_B1: .08, vitamin_B2: .03, vitamin_B3: 1.4, vitamin_B6: .3, vitamin_B9: 17, vitamin_B12: 0, vitamin_C: 15, vitamin_E: .1, vitamin_K: 2, calcium: 12, iron: .7, magnesium: 23, zinc: .3, iodine: 0, selenium: 0 },
  legumineuses: { kcal: 330, protein: 22, carbohydrate: 50, fat: 1.5, fiber: 15, vitamin_A: 5, vitamin_B1: .55, vitamin_B2: .2, vitamin_B3: 2.5, vitamin_B6: .55, vitamin_B9: 450, vitamin_B12: 0, vitamin_C: 4, vitamin_E: 2, vitamin_K: 5, calcium: 100, iron: 6.5, magnesium: 170, zinc: 3, iodine: 5, selenium: 5 },
  legumes: { kcal: 30, protein: 1.5, carbohydrate: 5, fat: .3, fiber: 3, vitamin_A: 300, vitamin_B1: .08, vitamin_B2: .05, vitamin_B3: .7, vitamin_B6: .15, vitamin_B9: 60, vitamin_B12: 0, vitamin_C: 30, vitamin_E: 1, vitamin_K: 150, calcium: 35, iron: .7, magnesium: 20, zinc: .4, iodine: 5, selenium: 1 },
  fruits: { kcal: 50, protein: .7, carbohydrate: 12, fat: .2, fiber: 2.4, vitamin_A: 50, vitamin_B1: .05, vitamin_B2: .04, vitamin_B3: .4, vitamin_B6: .1, vitamin_B9: 25, vitamin_B12: 0, vitamin_C: 35, vitamin_E: .3, vitamin_K: 5, calcium: 15, iron: .3, magnesium: 10, zinc: .2, iodine: 2, selenium: 1 },
  lait: { kcal: 46, protein: 3.3, carbohydrate: 4.8, fat: 1.5, fiber: 0, vitamin_A: 50, vitamin_B1: .04, vitamin_B2: .18, vitamin_B3: .1, vitamin_B6: .04, vitamin_B9: 5, vitamin_B12: .4, vitamin_C: 0, vitamin_E: .1, vitamin_K: 0, calcium: 120, iron: 0, magnesium: 11, zinc: .4, iodine: 15, selenium: 2 },
  oeufs: { kcal: 143, protein: 12.6, carbohydrate: .7, fat: 9.5, fiber: 0, vitamin_A: 160, vitamin_B1: .04, vitamin_B2: .46, vitamin_B3: .1, vitamin_B6: .17, vitamin_B9: 47, vitamin_B12: 1.1, vitamin_C: 0, vitamin_E: 1.9, vitamin_K: .3, calcium: 56, iron: 1.8, magnesium: 12, zinc: 1.3, iodine: 140, selenium: 30 },
  volaille: { kcal: 190, protein: 29, carbohydrate: 0, fat: 8.5, fiber: 0, vitamin_A: 10, vitamin_B1: .07, vitamin_B2: .15, vitamin_B3: 10, vitamin_B6: .5, vitamin_B9: 6, vitamin_B12: .3, vitamin_C: 0, vitamin_E: .3, vitamin_K: 2, calcium: 15, iron: 1.2, magnesium: 25, zinc: 2.5, iodine: 5, selenium: 25 },
  porc: { kcal: 240, protein: 26, carbohydrate: 0, fat: 15, fiber: 0, vitamin_A: 0, vitamin_B1: .8, vitamin_B2: .2, vitamin_B3: 8, vitamin_B6: .5, vitamin_B9: 5, vitamin_B12: .7, vitamin_C: 0, vitamin_E: .3, vitamin_K: 2, calcium: 10, iron: 1, magnesium: 22, zinc: 3, iodine: 7, selenium: 35 },
  poisson: { kcal: 130, protein: 22, carbohydrate: 0, fat: 5, fiber: 0, vitamin_A: 25, vitamin_B1: .1, vitamin_B2: .15, vitamin_B3: 6, vitamin_B6: .5, vitamin_B9: 15, vitamin_B12: 3, vitamin_C: 0, vitamin_E: 1.2, vitamin_K: .5, calcium: 30, iron: .8, magnesium: 30, zinc: .7, iodine: 50, selenium: 40 },
  gibier: { kcal: 150, protein: 29, carbohydrate: 0, fat: 4, fiber: 0, vitamin_A: 0, vitamin_B1: .15, vitamin_B2: .25, vitamin_B3: 8, vitamin_B6: .5, vitamin_B9: 5, vitamin_B12: 2.5, vitamin_C: 0, vitamin_E: .5, vitamin_K: 2, calcium: 10, iron: 4, magnesium: 25, zinc: 5, iodine: 5, selenium: 30 },
  huile_olive: { kcal: 884, protein: 0, carbohydrate: 0, fat: 100, fiber: 0, vitamin_A: 0, vitamin_B1: 0, vitamin_B2: 0, vitamin_B3: 0, vitamin_B6: 0, vitamin_B9: 0, vitamin_B12: 0, vitamin_C: 0, vitamin_E: 14.4, vitamin_K: 0, calcium: 1, iron: 0, magnesium: 0, zinc: 0, iodine: 0, selenium: 0 }
};

// Pure selection of the applicable reference intake for the individual's physiological state.
export function targetFor(nutrient: NutritionDefinition, sex: Sex, state: PhysiologyState): number {
  if (state === "pregnancy" && nutrient.pregnancy !== undefined) return nutrient.pregnancy;
  if (state === "lactation" && nutrient.lactation !== undefined) return nutrient.lactation;
  return nutrient.target[sex];
}

// Pure construction of physiological reserves from a target and a maximum tolerated deficit period.
export function createNutritionReserves(
  sex: Sex,
  state: PhysiologyState,
  initialRatio = 1,
  requirementFactor = 1
): NutritionReserves {
  return Object.fromEntries(
    NUTRITION.map(nutrient => {
      const target = targetFor(nutrient, sex, state) * requirementFactor;
      const max = target * nutrient.maxDays;
      return [nutrient.id, {
        value: max * Math.max(0, Math.min(1, initialRatio)),
        max,
        unit: nutrient.unit,
        labelKey: nutrient.labelKey,
        maxDays: nutrient.maxDays
      }];
    })
  ) as NutritionReserves;
}

// Pure daily reserve update: intake replenishes the reserve and the physiological target consumes it.
export function applyNutritionDay(
  reserves: NutritionReserves,
  intake: Partial<Record<NutritionId, number>>,
  sex: Sex,
  state: PhysiologyState,
  requirementFactor = 1
): NutritionReserves {
  const next = { ...reserves };
  for (const nutrient of NUTRITION) {
    const current = reserves[nutrient.id];
    const target = targetFor(nutrient, sex, state) * requirementFactor;
    const absorbed = intake[nutrient.id] ?? 0;
    next[nutrient.id] = {
      ...current,
      value: Math.max(0, Math.min(current.max, current.value + absorbed - target))
    };
  }
  return next;
}

// Pure unit conversion from a food quantity to nutrient intake.
export function foodToNutrition(food: FoodNutrition, quantity: number, good?: Good): Partial<Record<NutritionId, number>> {
  // Food composition is expressed per 100 g. Most stocks are in kg.
  const quantityKg = quantity * (good ? FOOD_DENSITY_KG_PER_UNIT[good] ?? 1 : 1);
  const unitsOf100g = quantityKg * 1000 / 100;
  return {
    energy: food.kcal * unitsOf100g,
    protein: food.protein * unitsOf100g,
    carbohydrate: food.carbohydrate * unitsOf100g,
    fat: food.fat * unitsOf100g,
    fiber: food.fiber * unitsOf100g,
    vitamin_A: food.vitamin_A * unitsOf100g,
    vitamin_B1: food.vitamin_B1 * unitsOf100g,
    vitamin_B2: food.vitamin_B2 * unitsOf100g,
    vitamin_B3: food.vitamin_B3 * unitsOf100g,
    vitamin_B6: food.vitamin_B6 * unitsOf100g,
    vitamin_B9: food.vitamin_B9 * unitsOf100g,
    vitamin_B12: food.vitamin_B12 * unitsOf100g,
    vitamin_C: food.vitamin_C * unitsOf100g,
    vitamin_E: food.vitamin_E * unitsOf100g,
    vitamin_K: food.vitamin_K * unitsOf100g,
    calcium: food.calcium * unitsOf100g,
    iron: food.iron * unitsOf100g,
    magnesium: food.magnesium * unitsOf100g,
    zinc: food.zinc * unitsOf100g,
    iodine: food.iodine * unitsOf100g,
    selenium: food.selenium * unitsOf100g
  };
}


/** Zero is the simulation death boundary, not a medical threshold. */
// A reserve below its critical threshold is not immediate death. It becomes lethal only
// when the individual remains below that threshold for the nutrient's defined duration.
export function updateNutritionDeficitDays(
  reserves: NutritionReserves,
  previousDeficitDays: Partial<Record<NutritionId, number>>
): Partial<Record<NutritionId, number>> {
  return Object.fromEntries(
    NUTRITION.map(nutrient => {
      const rule = NUTRITION_MORTALITY[nutrient.id];
      const criticalReserve = (reserves[nutrient.id].max / nutrient.maxDays) * rule.criticalReserveDays;
      const days = previousDeficitDays[nutrient.id] ?? 0;
      return [nutrient.id, reserves[nutrient.id].value < criticalReserve ? days + 1 : 0];
    })
  );
}

export function isLethalNutritionState(
  reserves: NutritionReserves,
  deficitDays: Partial<Record<NutritionId, number>>
): boolean {
  return NUTRITION.some(nutrient =>
    (deficitDays[nutrient.id] ?? 0) >= NUTRITION_MORTALITY[nutrient.id].lethalAfterDays
  );
}
