import { NUTRITION } from "../data/nutrition";
import type { Good, Human } from "../data/types";

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: Array<string | number | boolean | null | undefined>): string {
  return values.map(csvCell).join(",");
}

export function buildFinalAgentsCsv(
  agents: Human[],
  goods: Good[],
  finalDay: number
): string {
  const columns = [
    "day", "id", "sex", "physiological_state", "job", "productivity",
    "money", "x", "y",
    ...goods.map(good => `stock_${good}`),
    ...NUTRITION.flatMap(nutrient => [
      `${nutrient.id}_reserve`,
      `${nutrient.id}_reserve_max`,
      `${nutrient.id}_deficit_days`,
    ]),
  ];

  const rows = agents.map(agent => row([
    finalDay, agent.id, agent.sex, agent.state, agent.job, agent.productivity,
    agent.money, agent.x, agent.y,
    ...goods.map(good => agent.inventory[good] ?? 0),
    ...NUTRITION.flatMap(nutrient => [
      agent.reserves[nutrient.id].value,
      agent.reserves[nutrient.id].max,
      agent.nutritionDeficitDays[nutrient.id] ?? 0,
    ]),
  ]));

  return [row(columns), ...rows].join("\n") + "\n";
}
