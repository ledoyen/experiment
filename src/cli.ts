import { writeFileSync } from "node:fs";
import { buildAnalysisCsv } from "./analysis/buildAnalysisCsv";
import { buildFinalAgentsCsv } from "./analysis/buildFinalAgentsCsv";
import { defaultParameters } from "./data/defaults";
import type { Good, Parameters } from "./data/types";
import { World, type DeathRecord } from "./model/World";

const MINUTES_PER_DAY = 1440;

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildDeathLogCsv(records: DeathRecord[]): string {
  const headers = [
    "minute", "day", "agent_id", "job", "money", "causes", "reserves", "deficit_days"
  ];
  const rows = records.map(record => [
    record.minute,
    record.day,
    record.agentId,
    record.job,
    record.money,
    record.causes.join(";"),
    JSON.stringify(record.reserves),
    JSON.stringify(record.deficitDays)
  ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}

interface CliOptions {
  output: string;
  durationDays: number;
  moneyIntroductionDay: number | null;
  parameters: Parameters;
}

function usage(): never {
  console.error(`Usage: npm run simulate -- [options]

Initial parameters:
  --population <number>
  --initial-money <number>
  --money-enabled <true|false>
  --mobility <number>
  --price-sensitivity <number>
  --productivity-variance <number>

Experiment:
  --money-introduction-day <day|empty>
  --duration-days <number>
  --output <path>
`);
  process.exit(1);
}

function requiredNumber(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const parameters = defaultParameters();
  let durationDays = 365;
  let moneyIntroductionDay: number | null = null;
  let output = "simulation.csv";

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const [name, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? args[++index];
    if (value === undefined) usage();

    switch (name) {
      case "--population": parameters.population = requiredNumber(name, value); break;
      case "--initial-money": parameters.initialMoney = requiredNumber(name, value); break;
      case "--money-enabled":
        if (value !== "true" && value !== "false") throw new Error("money-enabled must be true or false");
        parameters.moneyEnabled = value === "true";
        break;
      case "--mobility": parameters.mobility = requiredNumber(name, value); break;
      case "--price-sensitivity": parameters.priceSensitivity = requiredNumber(name, value); break;
      case "--productivity-variance": parameters.productivityVariance = requiredNumber(name, value); break;
      case "--money-introduction-day":
        moneyIntroductionDay = value === "" ? null : requiredNumber(name, value);
        break;
      case "--duration-days": durationDays = requiredNumber(name, value); break;
      case "--output": output = value; break;
      case "--help": usage();
      default: throw new Error(`Unknown option: ${name}`);
    }
  }

  if (!Number.isInteger(parameters.population) || parameters.population < 1) {
    throw new Error("population must be a positive integer");
  }
  if (durationDays < 0 || !Number.isInteger(durationDays)) {
    throw new Error("duration-days must be a non-negative integer");
  }
  if (
    moneyIntroductionDay !== null &&
    (!Number.isInteger(moneyIntroductionDay) ||
      moneyIntroductionDay < 1 ||
      moneyIntroductionDay > durationDays)
  ) {
    throw new Error("money-introduction-day must be between 1 and duration-days");
  }
  if (parameters.moneyEnabled && moneyIntroductionDay !== null) {
    throw new Error("money-introduction-day cannot be combined with money-enabled=true");
  }

  return { output, durationDays, moneyIntroductionDay, parameters };
}

function run(options: CliOptions): void {
  const world = new World(options.parameters);

  for (let day = 1; day <= options.durationDays; day++) {
    if (options.moneyIntroductionDay === day) {
      world.setParameters({ moneyEnabled: true });
    }
    world.step(MINUTES_PER_DAY, MINUTES_PER_DAY);
  }

  const csv = buildAnalysisCsv(
    world.getHistory(),
    world.getInitialParameters(),
    world.parameters,
    world.getParameterEvents()
  );
  writeFileSync(options.output, csv, "utf8");

  const finalAgentsOutput = options.output.endsWith(".csv")
    ? options.output.replace(/\.csv$/i, "-final-agents.csv")
    : `${options.output}-final-agents.csv`;
  const goods = Object.keys(world.prices) as Good[];
  writeFileSync(
    finalAgentsOutput,
    buildFinalAgentsCsv(world.agents, goods, options.durationDays),
    "utf8"
  );

  const deathLogOutput = options.output.endsWith(".csv")
    ? options.output.replace(/\.csv$/i, "-deaths.csv")
    : `${options.output}-deaths.csv`;
  writeFileSync(deathLogOutput, buildDeathLogCsv(world.getDeathLog()), "utf8");

  const metrics = world.getMetrics();
  console.log(
    `Simulation finished: day ${options.durationDays}, population ${metrics.population}, ` +
    `money ${metrics.moneySupply}, outputs ${options.output}, ${finalAgentsOutput}, and ${deathLogOutput}`
  );
  console.log("Death causes:", JSON.stringify(world.getDeathCauses()));
}

try {
  run(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
