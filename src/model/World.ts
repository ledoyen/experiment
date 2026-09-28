import { ACTIVITIES, ACTIVE_REFERENCE_ETP, DAILY_NEED, FOOD_GOODS, INITIAL_PRICE, activityByJob, dailyOutputPerEtp } from "../data/economy";
import { FOOD_NUTRITION, NUTRITION, applyNutritionDay, createNutritionReserves, foodToNutrition, type NutritionId } from "../data/nutrition";
import type { Agent, Good, Job, Metrics, Parameters } from "../data/types";
import {
  heatingConsumptionForDay,
  heatingPurchaseNeed,
  priceMultiplier,
  seasonalProductionMultiplier,
  shouldSwitchJob
} from "../data/glossary";

const activityJobs = ACTIVITIES.map(activity => activity.job);

const jobColors: Record<Job, string> = {
  agriculture_ble: "#7f9f5b", agriculture_pomme_de_terre: "#91a86b", agriculture_legumineuses: "#6e8f4e",
  horticulture_legumes: "#88a96b", arboriculture_fruits: "#4f7f47", oliviculture: "#667f3b",
  "élevage_lait": "#c49a6c", aviculture_oeufs: "#d1b66f", pêche: "#5d91b8", chasse: "#8d6e63",
  textile: "#9b72a6", construction: "#b27a4e", bois_chauffage: "#5f4a3c", outillage: "#707070", idle: "#9aa39b"
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const gini = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (!sorted.length || sum <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < sorted.length; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (sorted.length * sum) - (sorted.length + 1) / sorted.length;
};

const bins = (values: number[], count = 8) => {
  const result = Array(count).fill(0);
  if (!values.length) return result;
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) { result[0] = values.length; return result; }
  const width = (max - min) / count;
  for (const value of values) result[Math.min(count - 1, Math.floor((value - min) / width))]++;
  return result;
};

const binSums = (values: number[], count = 8) => {
  const result = Array(count).fill(0);
  if (!values.length) return result;
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) { result[0] = values.reduce((sum, value) => sum + value, 0); return result; }
  const width = (max - min) / count;
  for (const value of values) result[Math.min(count - 1, Math.floor((value - min) / width))] += value;
  return result;
};

export class World {
  readonly width = 1800;
  readonly height = 1100;
  minute = 0;
  prices: Record<Good, number> = { ...INITIAL_PRICE };
  agents: Agent[] = [];
  parameters: Parameters;

  private readonly history: Metrics[] = [];
  private readonly snapshots: Array<{ minute: number; prices: Record<Good, number>; agents: Agent[] }> = [];
  private moneySupplyTarget = 0;

  constructor(parameters: Parameters) {
    this.parameters = structuredClone(parameters);
    this.reset();
  }

  reset() {
    this.minute = 0;
    this.prices = { ...INITIAL_PRICE };
    this.moneySupplyTarget = this.parameters.population * this.parameters.initialMoney;
    this.history.length = 0;
    this.snapshots.length = 0;

    const referenceCounts = new Map<Job, number>();
    let assigned = 0;

    for (const activity of ACTIVITIES) {
      if (activity.dormant || activity.referenceEtp <= 0) continue;
      const count = Math.floor(this.parameters.population * activity.referenceEtp / Math.max(ACTIVE_REFERENCE_ETP, 1));
      referenceCounts.set(activity.job, count);
      assigned += count;
    }

    let remaining = Math.max(0, this.parameters.population - assigned);
    const candidates = ACTIVITIES.filter(activity => !activity.dormant && activity.referenceEtp > 0);
    for (let i = 0; i < remaining && candidates.length > 0; i++) {
      const activity = candidates[i % candidates.length];
      referenceCounts.set(activity.job, (referenceCounts.get(activity.job) ?? 0) + 1);
    }

    this.agents = Array.from({ length: this.parameters.population }, (_, id) => {
      let job: Job = "idle";
      let cursor = 0;
      for (const activity of ACTIVITIES) {
        const count = referenceCounts.get(activity.job) ?? 0;
        if (id >= cursor && id < cursor + count) { job = activity.job; break; }
        cursor += count;
      }
      const angle = Math.random() * Math.PI * 2;
      const radius = 120 + Math.random() * 430;
      return {
        id,
        x: this.width / 2 + Math.cos(angle) * radius,
        y: this.height / 2 + Math.sin(angle) * radius,
        job,
        productivity: this.randomProductivity(),
        money: this.parameters.initialMoney,
        sex: id % 2 === 0 ? "male" : "female",
        physiologyState: "normal",
        nutrition: createNutritionReserves(id % 2 === 0 ? "male" : "female", "normal"),
        heatingStock: 1
      };
    });

    this.capture();
  }

  setParameters(patch: Partial<Parameters>) {
    this.parameters = { ...this.parameters, ...patch };
  }

  step(minutes = 1, captureInterval = 10) {
    let remaining = Math.max(0, Math.floor(minutes));
    const interval = Math.max(10, Math.floor(captureInterval));

    while (remaining > 0) {
      const nextCapture = Math.max(this.minute + 1, Math.floor(this.minute / interval) * interval + interval);
      const chunk = Math.min(remaining, nextCapture - this.minute);
      this.advanceChunk(chunk);
      remaining -= chunk;
      if (this.minute === nextCapture) this.capture();
    }
  }

  rewind(minutes = 60) {
    const target = Math.max(0, this.minute - minutes);
    const snapshot = [...this.snapshots].reverse().find(item => item.minute <= target);
    if (!snapshot) return;
    this.minute = snapshot.minute;
    this.prices = { ...snapshot.prices };
    this.agents = structuredClone(snapshot.agents);
    while (this.history.length && this.history[this.history.length - 1].minute > this.minute) this.history.pop();
  }

  getMetrics(): Metrics {
    const wealth = this.agents.map(agent => agent.money);
    const productivity = this.agents.map(agent => agent.productivity);
    const wealthTotal = wealth.reduce((sum, value) => sum + value, 0);
    return {
      minute: this.minute,
      population: this.agents.length,
      medianWealth: median(wealth),
      gini: gini(wealth),
      foodPrice: this.prices.ble,
      moneySupply: wealthTotal,
      prices: { ...this.prices },
      wealthBins: bins(wealth),
      wealthBinSums: binSums(wealth),
      wealthTotal,
      wealthMin: Math.min(...wealth),
      wealthMax: Math.max(...wealth),
      productivityBins: bins(productivity),
      productivityMin: Math.min(...productivity),
      productivityMax: Math.max(...productivity)
    };
  }

  getHistory() { return [...this.history]; }

  getDisplayHistory(speed: number) {
    const interval = speed >= 1000 ? 1440 : speed >= 100 ? 120 : speed >= 10 ? 30 : 10;
    const result: Metrics[] = [];
    for (const point of this.history) if (point.minute % interval === 0) result.push(point);
    const last = this.history[this.history.length - 1];
    if (last && result[result.length - 1] !== last) result.push(last);
    return result;
  }

  getJobCounts(): Record<Job, number> {
    const counts = {} as Record<Job, number>;
    for (const activity of ACTIVITIES) counts[activity.job] = 0;
    counts.idle = 0;
    for (const agent of this.agents) counts[agent.job]++;
    return counts;
  }

  color(job: Job) { return jobColors[job]; }

  getAgentAtWorldPosition(x: number, y: number, radius: number): Agent | null {
    const radiusSquared = radius * radius;
    let nearest: Agent | null = null;
    let nearestDistance = radiusSquared;
    for (const agent of this.agents) {
      const dx = agent.x - x;
      const dy = agent.y - y;
      const distance = dx * dx + dy * dy;
      if (distance <= nearestDistance) { nearestDistance = distance; nearest = agent; }
    }
    return nearest;
  }

  private capture() {
    this.history.push(this.getMetrics());
    this.compactHistory();
    this.snapshots.push({ minute: this.minute, prices: { ...this.prices }, agents: structuredClone(this.agents) });
    this.compactSnapshots();
  }

  private compactHistory() {
    const now = this.minute;
    const buckets = new Map<string, Metrics>();
    for (const metric of this.history) {
      const age = now - metric.minute;
      const key = age < 60 ? "m10:" + metric.minute : age < 1440 ? "h:" + Math.floor(metric.minute / 60) : age < 43200 ? "d:" + Math.floor(metric.minute / 1440) : "mo:" + Math.floor(metric.minute / 43200);
      const existing = buckets.get(key);
      if (!existing || metric.minute > existing.minute) buckets.set(key, metric);
    }
    this.history.splice(0, this.history.length, ...[...buckets.values()].sort((a, b) => a.minute - b.minute));
  }

  private compactSnapshots() {
    const now = this.minute;
    const buckets = new Map<string, (typeof this.snapshots)[number]>();
    for (const snapshot of this.snapshots) {
      const age = now - snapshot.minute;
      const key = age < 60 ? "m10:" + snapshot.minute : age < 1440 ? "h:" + Math.floor(snapshot.minute / 60) : age < 43200 ? "d:" + Math.floor(snapshot.minute / 1440) : "mo:" + Math.floor(snapshot.minute / 43200);
      const existing = buckets.get(key);
      if (!existing || snapshot.minute > existing.minute) buckets.set(key, snapshot);
    }
    this.snapshots.splice(0, this.snapshots.length, ...[...buckets.values()].sort((a, b) => a.minute - b.minute));
  }

  private advanceChunk(minutes: number) {
    const previousMinute = this.minute;
    this.minute += minutes;
    const previousDay = Math.floor(previousMinute / 1440);
    const currentDay = Math.floor(this.minute / 1440);
    for (let day = previousDay; day < currentDay; day++) {
      const simulationDay = day + 1;
      const heatingConsumption = heatingConsumptionForDay(simulationDay);

      for (const agent of this.agents) {
        agent.heatingStock = Math.max(0, agent.heatingStock - heatingConsumption);
      }

      if (this.parameters.moneyEnabled) {
        this.processMarketDay(simulationDay);
      } else {
        this.processCollectiveNutritionDay();
      }
    }
    const distance = Math.sqrt(minutes) * 0.9;
    for (const agent of this.agents) {
      agent.x = Math.max(20, Math.min(this.width - 20, agent.x + (Math.random() - 0.5) * distance));
      agent.y = Math.max(20, Math.min(this.height - 20, agent.y + (Math.random() - 0.5) * distance));
    }
  }

  private processMarketDay(simulationDay: number) {
    const supplies = {} as Record<Good, number>;
    const marketIntake = {} as Record<NutritionId, number>;

    for (const good of Object.keys(this.prices) as Good[]) {
      supplies[good] = 0;
    }

    for (const agent of this.agents) {
      const activity = activityByJob(agent.job);
      if (!activity || activity.dormant) continue;
      supplies[activity.output] +=
        dailyOutputPerEtp(activity) *
        agent.productivity *
        seasonalProductionMultiplier(activity.job, simulationDay);
    }

    const foodBasketCost = FOOD_GOODS.reduce(
      (sum, good) => sum + DAILY_NEED[good] * this.prices[good],
      0
    );

    const affordability = this.agents.map(agent =>
      Math.min(1, agent.money / Math.max(foodBasketCost, 1e-9))
    );

    const totalAffordability = affordability.reduce((sum, value) => sum + value, 0);

    // Heating is a stock: each person consumes 1 tonne/year and replenishes
    // only when the household stock falls below its target.
    const desiredHeating = this.agents.map(agent =>
      heatingPurchaseNeed(simulationDay, agent.heatingStock)
    );

    const demand = {} as Record<Good, number>;
    const saleFraction = {} as Record<Good, number>;
    for (const good of Object.keys(this.prices) as Good[]) {
      demand[good] = 0;
      saleFraction[good] = 0;
    }

    for (const good of FOOD_GOODS) {
      demand[good] = DAILY_NEED[good] * totalAffordability;
      saleFraction[good] =
        demand[good] > 0
          ? Math.min(1, supplies[good] / demand[good])
          : 0;
    }

    // Food purchases happen first. This determines how much money remains
    // available for household heating stock.
    const remainingMoneyAfterFood = this.agents.map((agent, index) => {
      const ratio = affordability[index];
      let spend = 0;

      for (const good of FOOD_GOODS) {
        spend +=
          DAILY_NEED[good] *
          this.prices[good] *
          ratio *
          saleFraction[good];
      }

      agent.money = Math.max(0, agent.money - spend);
      return agent.money;
    });

    const affordableHeatingDemand = desiredHeating.reduce(
      (sum, quantity, index) =>
        sum +
        Math.min(
          quantity,
          remainingMoneyAfterFood[index] / Math.max(this.prices.chauffage, 1e-9)
        ),
      0
    );

    demand.chauffage = affordableHeatingDemand;
    saleFraction.chauffage =
      affordableHeatingDemand > 0
        ? Math.min(1, supplies.chauffage / affordableHeatingDemand)
        : 0;

    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const desiredPurchase = Math.min(
        desiredHeating[index],
        remainingMoneyAfterFood[index] / Math.max(this.prices.chauffage, 1e-9)
      );
      const heatingPurchase = desiredPurchase * saleFraction.chauffage;

      agent.money -= heatingPurchase * this.prices.chauffage;
      agent.heatingStock = Math.min(1, agent.heatingStock + heatingPurchase);
    }

    // Compute the nutrient intake of the sold food basket.
    for (const nutrient of NUTRITION) {
      marketIntake[nutrient.id] = 0;
    }

    for (const good of FOOD_GOODS) {
      const quantity = DAILY_NEED[good] * saleFraction[good];
      const food = FOOD_NUTRITION[good];
      if (quantity <= 0 || !food) continue;

      const contribution = foodToNutrition(food, quantity);
      for (const nutrient of NUTRITION) {
        marketIntake[nutrient.id] += contribution[nutrient.id] ?? 0;
      }
    }

    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const ratio = affordability[index];
      const intake = Object.fromEntries(
        NUTRITION.map(nutrient => [
          nutrient.id,
          marketIntake[nutrient.id] * ratio
        ])
      ) as Partial<Record<NutritionId, number>>;

      agent.nutrition = applyNutritionDay(
        agent.nutrition,
        intake,
        agent.sex,
        agent.physiologyState
      );
    }

    // Redistribute exactly what buyers spent to producers.
    for (const good of [...FOOD_GOODS, "chauffage" as Good]) {
      const soldQuantity = demand[good] * saleFraction[good];
      if (soldQuantity <= 0 || supplies[good] <= 0) continue;

      const revenue = soldQuantity * this.prices[good];

      for (const agent of this.agents) {
        const activity = activityByJob(agent.job);
        if (!activity || activity.output !== good) continue;

        const output =
          dailyOutputPerEtp(activity) *
          agent.productivity *
          seasonalProductionMultiplier(activity.job, simulationDay);
        agent.money += revenue * (output / supplies[good]);
      }
    }

    // Price formation uses actual intended purchases relative to physical supply.
    for (const good of [...FOOD_GOODS, "chauffage" as Good]) {
      const required = demand[good];
      if (required <= 0 && supplies[good] <= 0) continue;

      this.prices[good] = priceMultiplier(
        this.prices[good],
        required,
        supplies[good],
        this.parameters.priceSensitivity
      );
    }

    // Mobility follows expected market income.
    const expectedIncome = (agent: Agent, job: Job) => {
      const activity = activityByJob(job);
      if (!activity || activity.dormant) return 0;

      const output = dailyOutputPerEtp(activity) * agent.productivity;
      return output * this.prices[activity.output] * saleFraction[activity.output];
    };

    for (const agent of this.agents) {
      const current = expectedIncome(agent, agent.job);
      let bestJob = agent.job;
      let best = current;

      for (const job of activityJobs) {
        const income = expectedIncome(agent, job);
        if (shouldSwitchJob(best, income)) {
          best = income;
          bestJob = job;
        }
      }

      if (
        bestJob !== agent.job &&
        Math.random() < Math.min(1, this.parameters.mobility)
      ) {
        agent.job = bestJob;
      }
    }

    // Floating-point correction only: monetary stock remains conserved.
    const currentSupply = this.agents.reduce(
      (sum, agent) => sum + agent.money,
      0
    );
    const residue = this.moneySupplyTarget - currentSupply;

    if (this.agents.length > 0 && Math.abs(residue) > 1e-9) {
      this.agents[this.agents.length - 1].money += residue;
    }
  }

  private processCollectiveNutritionDay() {
    const intake = {} as Record<NutritionId, number>;
    for (const nutrient of NUTRITION) intake[nutrient.id] = 0;

    for (const good of FOOD_GOODS) {
      const quantity = DAILY_NEED[good];
      const food = FOOD_NUTRITION[good];
      if (quantity <= 0 || !food) continue;

      const contribution = foodToNutrition(food, quantity);
      for (const nutrient of NUTRITION) {
        intake[nutrient.id] += contribution[nutrient.id] ?? 0;
      }
    }

    for (const agent of this.agents) {
      agent.nutrition = applyNutritionDay(
        agent.nutrition,
        intake,
        agent.sex,
        agent.physiologyState
      );
    }
  }

  private randomProductivity() {
    const sigma = this.parameters.productivityVariance;
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.exp(normal * sigma - 0.5 * sigma * sigma);
  }
}