import type { Good, Job, Metrics, ParameterChangeEvent, Parameters } from "../data/types";
import { GOODS, GOOD_PRICE_UNIT } from "../data/economy";
import { simulationTimeParts } from "../data/glossary";
import type { I18nKey } from "../i18n";
import { t } from "../i18n";

export interface AnalysisSeries {
  id: string;
  label: string;
  unit: string;
  values: number[];
}

const JOBS: Job[] = [
  "agriculture_ble",
  "agriculture_pomme_de_terre",
  "agriculture_legumineuses",
  "horticulture_legumes",
  "arboriculture_fruits",
  "oliviculture",
  "élevage_lait",
  "aviculture_oeufs",
  "pêche",
  "chasse",
  "textile",
  "construction",
  "bois_chauffage",
  "outillage",
  "idle"
];

const ALL_SERIES = [
  "medianWealth",
  "gini",
  "moneySupply",
  "population"
] as const;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function numberValue(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : "";
}

function timeLabel(metrics: Metrics[], index: number): string {
  const current = metrics[index]?.minute ?? 0;
  const previous = index > 0 ? metrics[index - 1].minute : current;
  const next = index + 1 < metrics.length ? metrics[index + 1].minute : current;
  const deltas = [current - previous, next - current].filter(delta => delta > 0);
  const resolution = deltas.length ? Math.min(...deltas) : 0;
  const parts = simulationTimeParts(current);

  if (resolution >= 43200) {
    return `${t("month")} ${parts.month} — ${t("year")} ${parts.year}`;
  }
  if (resolution >= 1440) return `${t("day")} ${parts.day}`;
  if (resolution >= 60) {
    return `${t("day")} ${parts.day} — ${String(parts.hour).padStart(2, "0")}h`;
  }
  return `${t("day")} ${parts.day} — ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function eventTimeLabel(minute: number): string {
  const parts = simulationTimeParts(minute);
  return `${t("day")} ${parts.day} — ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function parameterLabel(parameter: keyof Parameters): string {
  return t(parameter as I18nKey);
}

function seriesFromHistory(history: Metrics[]): AnalysisSeries[] {
  return [
    {
      id: "population",
      label: t("livingPopulation"),
      unit: t("individuals"),
      values: history.map(point => point.population)
    },
    {
      id: "medianWealth",
      label: t("medianWealth"),
      unit: "🪙 / individu",
      values: history.map(point => point.medianWealth)
    },
    {
      id: "gini",
      label: t("gini"),
      unit: "",
      values: history.map(point => point.gini)
    },
    {
      id: "moneySupply",
      label: t("moneySupply"),
      unit: "🪙",
      values: history.map(point => point.moneySupply)
    },
    ...GOODS.map((good: Good): AnalysisSeries => ({
      id: `price:${good}`,
      label: `${t("price")} — ${t(`good.${good}`)}`,
      unit: `🪙 / ${GOOD_PRICE_UNIT[good]}`,
      values: history.map(point => point.prices[good])
    })),
    ...JOBS.map((job): AnalysisSeries => ({
      id: `job:${job}`,
      label: t(`job.${job}`),
      unit: t("individuals"),
      values: history.map(point => point.jobCounts[job] ?? 0)
    }))
  ];
}

function parameterComments(
  initialParameters: Parameters,
  finalParameters: Parameters,
  events: ParameterChangeEvent[]
): string[] {
  const lines = [
    "# Economic God Game — export analytique",
    "# Valeurs numeriques non localisees ; separateur CSV = virgule",
    "# Parametres initiaux"
  ];

  for (const parameter of Object.keys(initialParameters) as Array<keyof Parameters>) {
    lines.push(
      `# parameter.initial.${String(parameter)} = ${String(initialParameters[parameter])}`
    );
  }

  if (events.length) {
    lines.push("# Evenements de parametres");
    for (const event of events) {
      lines.push(
        `# event | ${eventTimeLabel(event.minute)} | ${parameterLabel(event.parameter)} | ${String(event.previousValue)} -> ${String(event.newValue)}`
      );
    }
  } else {
    lines.push("# Evenements de parametres | aucun");
  }

  lines.push("# Parametres finaux");
  for (const parameter of Object.keys(finalParameters) as Array<keyof Parameters>) {
    lines.push(
      `# parameter.final.${String(parameter)} = ${String(finalParameters[parameter])}`
    );
  }

  return lines;
}

export function buildAnalysisCsv(
  history: Metrics[],
  initialParameters: Parameters,
  finalParameters: Parameters,
  parameterEvents: ParameterChangeEvent[]
): string {
  const series = seriesFromHistory(history);
  const lines = parameterComments(
    initialParameters,
    finalParameters,
    parameterEvents
  );

  const header = [
    "series_id",
    "label",
    "unit",
    ...history.map((_, index) => timeLabel(history, index))
  ];
  lines.push(header.map(csvCell).join(","));

  for (const item of series) {
    lines.push(
      [
        item.id,
        item.label,
        item.unit,
        ...item.values.map(numberValue)
      ].map(csvCell).join(",")
    );
  }

  return "\uFEFF" + lines.join("\n") + "\n";
}
