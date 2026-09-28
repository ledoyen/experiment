import { ACTIVITIES, ACTIVE_REFERENCE_ETP, DAILY_NEED, FOOD_GOODS, INITIAL_PRICE, activityByJob, dailyOutputPerEtp } from "../data/economy";
import { FOOD_NUTRITION, NUTRITION, applyNutritionDay, createNutritionReserves, foodToNutrition, isLethalNutritionState, type NutritionId } from "../data/nutrition";
import type { Agent, Good, Job, Metrics, Parameters } from "../data/types";
import {
  allocateFoodBeforeComfort,
  comfortPurchaseAllowed,
  heatingConsumptionForDay,
  heatingPurchaseNeed,
  priceMultiplier,
  seasonalProductionMultiplier,
  shouldSwitchJob,
  exponentialDistributionBins,
  linearDistributionBins,
  planFoodDemand,
  MAX_STORED_FOOD_DAYS_FOR_PRICE
} from "../data/glossary";

const activityJobs = ACTIVITIES.map(activity => activity.job);

const jobColors: Record<Job, string> = {
  agriculture_ble: "#7f9f5b", agriculture_pomme_de_terre: "#91a86b", agriculture_legumineuses: "#6e8f4e",
  horticulture_legumes: "#88a96b", arboriculture_fruits: "#4f7f47", oliviculture: "#667f3b",
  "élevage_lait": "#c49a6c", aviculture_oeufs: "#d1b66f", pêche: "#5d91b8", chasse: "#8d6e63",
  textile: "#9b72a6", construction: "#b27a4e", bois_chauffage: "#5f4a3c", outillage: "#707070", idle: "#9aa39b"
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const gini = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).map(value => Math.max(0, value)).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (!sorted.length || sum <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < sorted.length; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (sorted.length * sum) - (sorted.length + 1) / sorted.length;
};

export class World {
  readonly width = 1800;
  readonly height = 1100;
  minute = 0;
  prices: Record<Good, number> = { ...INITIAL_PRICE };
  agents: Agent[] = [];
  parameters: Parameters;

  private readonly history: Metrics[] = [];
  private readonly snapshots: Array<{ minute: number; prices: Record<Good, number>; agents: Agent[]; monetaryReserve: number }> = [];
  private moneySupplyTarget = 0;
  private monetaryReserve = 0;

  constructor(parameters: Parameters) {
    this.parameters = structuredClone(parameters);
    this.reset();
  }

  reset() {
    this.minute = 0;
    this.prices = { ...INITIAL_PRICE };
    this.moneySupplyTarget = this.parameters.population * this.parameters.initialMoney;
    this.monetaryReserve = 0;
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
        heatingStock: 1,
        inventory: {}
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
    this.monetaryReserve = snapshot.monetaryReserve;
    while (this.history.length && this.history[this.history.length - 1].minute > this.minute) this.history.pop();
  }

  getMetrics(): Metrics {
    const wealth = this.agents.map(agent => Number.isFinite(agent.money) ? Math.max(0, agent.money) : 0);
    const productivity = this.agents.map(agent => Number.isFinite(agent.productivity) ? Math.max(0, agent.productivity) : 0);
    const wealthDistribution = exponentialDistributionBins(wealth);
    const productivityDistribution = linearDistributionBins(productivity);
    const wealthTotal = wealth.reduce((sum, value) => sum + value, 0);

    return {
      minute: this.minute,
      population: this.agents.length,
      medianWealth: median(wealth),
      gini: gini(wealth),
      foodPrice: Number.isFinite(this.prices.ble) ? this.prices.ble : 0,
      moneySupply: Number.isFinite(wealthTotal + this.monetaryReserve)
        ? wealthTotal + this.monetaryReserve
        : 0,
      prices: { ...this.prices },
      wealthBins: wealthDistribution.counts,
      wealthBinSums: wealthDistribution.sums,
      wealthBinEdges: wealthDistribution.edges,
      wealthTotal,
      wealthMin: wealth.length ? Math.min(...wealth) : 0,
      wealthMax: wealth.length ? Math.max(...wealth) : 0,
      productivityBins: productivityDistribution.counts,
      productivityBinSums: productivityDistribution.sums,
      productivityBinEdges: productivityDistribution.edges,
      productivityMin: productivity.length ? Math.min(...productivity) : 0,
      productivityMax: productivity.length ? Math.max(...productivity) : 0
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
    this.snapshots.push({
      minute: this.minute,
      prices: { ...this.prices },
      agents: structuredClone(this.agents),
      monetaryReserve: this.monetaryReserve
    });
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
        agent.heatingStock = Math.max(
          0,
          agent.heatingStock - heatingConsumption
        );
      }

      this.produceForDay(simulationDay);

      if (this.parameters.moneyEnabled) {
        this.processMarketDay(simulationDay);
      } else {
        this.processCollectiveNutritionDay();
      }
    }

    const distance = Math.sqrt(minutes) * 0.9;
    for (const agent of this.agents) {
      agent.x = Math.max(
        20,
        Math.min(
          this.width - 20,
          agent.x + (Math.random() - 0.5) * distance
        )
      );
      agent.y = Math.max(
        20,
        Math.min(
          this.height - 20,
          agent.y + (Math.random() - 0.5) * distance
        )
      );
    }
  }

  private produceForDay(simulationDay: number) {
    for (const agent of this.agents) {
      const activity = activityByJob(agent.job);
      if (!activity || activity.dormant) continue;

      const production =
        dailyOutputPerEtp(activity) *
        agent.productivity *
        seasonalProductionMultiplier(activity.job, simulationDay);

      if (!Number.isFinite(production) || production <= 0) continue;

      agent.inventory[activity.output] =
        (agent.inventory[activity.output] ?? 0) + production;
    }
  }

  private inventoryTotal(good: Good): number {
    return this.agents.reduce(
      (sum, agent) => sum + Math.max(0, agent.inventory[good] ?? 0),
      0
    );
  }

  private processMarketDay(simulationDay: number) {
    const prices = { ...this.prices };
    const foodPlans = this.agents.map(agent =>
      planFoodDemand(
        agent.nutrition,
        agent.sex,
        agent.physiologyState,
        agent.money,
        prices
      )
    );

    const foodDemand = {} as Record<Good, number>;
    const saleFraction = {} as Record<Good, number>;

    for (const good of FOOD_GOODS) {
      const demand = foodPlans.reduce(
        (sum, plan) => sum + (plan[good] ?? 0),
        0
      );
      const supply = this.inventoryTotal(good);

      foodDemand[good] = demand;
      saleFraction[good] =
        demand > 0 ? Math.min(1, supply / demand) : 0;
    }

    const actualFoodPurchases = this.agents.map(plan => {
      const actual = {} as Record<Good, number>;
      for (const good of FOOD_GOODS) {
        actual[good] = (plan[good] ?? 0) * saleFraction[good];
      }
      return actual;
    });

    // Execute food purchases. The amount spent is never above the plan's budget.
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const purchase = actualFoodPurchases[index];

      let spend = 0;
      for (const good of FOOD_GOODS) {
        spend += purchase[good] * prices[good];
      }

      agent.money = Math.max(0, agent.money - spend);
    }

    // Convert actual food purchases into physiological intake.
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const intake = {} as Partial<Record<NutritionId, number>>;

      for (const nutrient of NUTRITION) intake[nutrient.id] = 0;

      for (const good of FOOD_GOODS) {
        const quantity = actualFoodPurchases[index][good];
        if (quantity <= 0) continue;

        const food = FOOD_NUTRITION[good];
        if (!food) continue;

        const contribution = foodToNutrition(food, quantity);
        for (const nutrient of NUTRITION) {
          intake[nutrient.id] =
            (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
        }
      }

      agent.nutrition = applyNutritionDay(
        agent.nutrition,
        intake,
        agent.sex,
        agent.physiologyState
      );
    }

    // Heating is a lower priority than food.
    const remainingMoney = this.agents.map(agent => agent.money);
    const heatingDemand = this.agents.map((agent, index) => {
      const desired = heatingPurchaseNeed(
        simulationDay,
        agent.heatingStock
      );
      if (desired <= 0) return 0;

      return Math.min(
        desired,
        remainingMoney[index] / Math.max(this.prices.chauffage, 1e-9)
      );
    });

    const totalHeatingDemand = heatingDemand.reduce(
      (sum, value) => sum + value,
      0
    );
    const heatingSupply = this.inventoryTotal("chauffage");
    const heatingSaleFraction =
      totalHeatingDemand > 0
        ? Math.min(1, heatingSupply / totalHeatingDemand)
        : 0;

    for (let index = 0; index < this.agents.length; index++) {
      const quantity = heatingDemand[index] * heatingSaleFraction;
      this.agents[index].money -= quantity * this.prices.chauffage;
      this.agents[index].heatingStock = Math.min(
        1,
        this.agents[index].heatingStock + quantity
      );
    }

    // Money from each commodity sale goes to the people who owned the stock.
    for (const good of [...FOOD_GOODS, "chauffage" as Good]) {
      const soldQuantity =
        (good === "chauffage"
          ? totalHeatingDemand * heatingSaleFraction
          : foodDemand[good] * saleFraction[good]);

      if (soldQuantity <= 0) continue;

      const totalStock = this.inventoryTotal(good);
      if (totalStock <= 0) continue;

      const revenue = soldQuantity * prices[good];

      for (const seller of this.agents) {
        const sellerStock = Math.max(0, seller.inventory[good] ?? 0);
        if (sellerStock <= 0) continue;

        const sold = soldQuantity * sellerStock / totalStock;
        seller.inventory[good] = Math.max(0, sellerStock - sold);
        seller.money += sold * prices[good];
      }
    }

    // A price changes at most once in this daily market clearing.
    for (const good of [...FOOD_GOODS, "chauffage" as Good]) {
      const demand =
        good === "chauffage"
          ? totalHeatingDemand
          : foodDemand[good];

      const productionLikeSupply =
        demand > 0
          ? Math.min(
              this.inventoryTotal(good),
              demand * MAX_STORED_FOOD_DAYS_FOR_PRICE
            )
          : 0;

      const dailyReferenceSupply =
        productionLikeSupply > 0
          ? productionLikeSupply
          : this.inventoryTotal(good);

      if (demand <= 0 && dailyReferenceSupply <= 0) continue;

      this.prices[good] = priceMultiplier(
        this.prices[good],
        demand,
        dailyReferenceSupply,
        this.parameters.priceSensitivity
      );
    }

    // Professional mobility follows the income available from today's sales.
    const expectedIncome = (agent: Agent, job: Job) => {
      const activity = activityByJob(job);
      if (!activity || activity.dormant) return 0;

      const output =
        dailyOutputPerEtp(activity) *
        agent.productivity *
        seasonalProductionMultiplier(activity.job, simulationDay);

      const good = activity.output;
      const sale =
        good === "chauffage"
          ? heatingSaleFraction
          : saleFraction[good] ?? 0;

      return output * this.prices[good] * sale;
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

    this.removeDeadAgents();

    const currentSupply =
      this.agents.reduce((sum, agent) => sum + agent.money, 0) +
      this.monetaryReserve;
    const residue = this.moneySupplyTarget - currentSupply;

    if (this.agents.length > 0 && Math.abs(residue) > 1e-9) {
      this.agents[this.agents.length - 1].money += residue;
    }
  }

  private processCollectiveNutritionDay() {
    // Before money, allocation is still constrained by the same real stocks,
    // but there is no price or monetary budget: people take food according to
    // their current physiological needs.
    const referencePrices = Object.fromEntries(
      FOOD_GOODS.map(good => [good, 1])
    ) as Partial<Record<Good, number>>;

    const plans = this.agents.map(agent =>
      planFoodDemand(
        agent.nutrition,
        agent.sex,
        agent.physiologyState,
        Number.MAX_SAFE_INTEGER,
        referencePrices
      )
    );

    const fractions = {} as Record<Good, number>;

    for (const good of FOOD_GOODS) {
      const demand = plans.reduce(
        (sum, plan) => sum + (plan[good] ?? 0),
        0
      );
      const supply = this.inventoryTotal(good);
      fractions[good] = demand > 0 ? Math.min(1, supply / demand) : 0;
    }

    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const intake = {} as Partial<Record<NutritionId, number>>;

      for (const nutrient of NUTRITION) intake[nutrient.id] = 0;

      for (const good of FOOD_GOODS) {
        const quantity = (plans[index][good] ?? 0) * fractions[good];
        const food = FOOD_NUTRITION[good];
        if (quantity <= 0 || !food) continue;

        const contribution = foodToNutrition(food, quantity);
        for (const nutrient of NUTRITION) {
          intake[nutrient.id] =
            (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
        }

        // In a non-monetary world, remove the consumed quantity from the
        // owners' stocks proportionally after the allocation below.
      }

      agent.nutrition = applyNutritionDay(
        agent.nutrition,
        intake,
        agent.sex,
        agent.physiologyState
      );
    }

    // Remove consumed food from commodity stocks proportionally.
    for (const good of FOOD_GOODS) {
      const sold = plans.reduce(
        (sum, plan) => sum + (plan[good] ?? 0),
        0
      ) * fractions[good];

      if (sold <= 0) continue;

      const totalStock = this.inventoryTotal(good);
      if (totalStock <= 0) continue;

      for (const seller of this.agents) {
        const stock = Math.max(0, seller.inventory[good] ?? 0);
        if (stock <= 0) continue;
        seller.inventory[good] = Math.max(
          0,
          stock - sold * stock / totalStock
        );
      }
    }

    this.removeDeadAgents();
  }

  private removeDeadAgents() {
    const survivors: Agent[] = [];

    for (const agent of this.agents) {
      if (isLethalNutritionState(agent.nutrition)) {
        this.monetaryReserve += Number.isFinite(agent.money) ? agent.money : 0;
      } else {
        survivors.push(agent);
      }
    }

    this.agents = survivors;
  }

  private randomProductivity() {
    const sigma = this.parameters.productivityVariance;
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.exp(normal * sigma - 0.5 * sigma * sigma);
  }
}