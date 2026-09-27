import type { Agent, Good, Job, Metrics, Parameters } from "../data/types";

const jobs: Job[] = ["farmer", "forester", "fisher"];

const jobGood: Record<Job, Good> = {
  farmer: "food",
  forester: "wood",
  fisher: "fish"
};

const jobColor: Record<Job, string> = {
  farmer: "#8ba86c",
  forester: "#4e7650",
  fisher: "#5d91b8"
};

const dailyNeed: Record<Good, number> = {
  food: 1,
  wood: 0.3,
  fish: 0.1
};

// The initial job distribution is aligned with the current XLS reference
// at the level of broad activities: most work is food, followed by forestry,
// with fishing as a smaller but non-zero activity.
const initialJobRatios: Record<Job, number> = {
  farmer: 0.84,
  forester: 0.10,
  fisher: 0.06
};

// Chosen so that the initial population roughly covers the reference basket.
// Productivity then creates individual differences around these baselines.
const baseProductionPerDay: Record<Job, number> = {
  farmer: dailyNeed.food / initialJobRatios.farmer,
  forester: dailyNeed.wood / initialJobRatios.forester,
  fisher: dailyNeed.fish / initialJobRatios.fisher
};

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
};

const gini = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const sum = a.reduce((x, y) => x + y, 0);
  if (!a.length || sum <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < a.length; i++) weighted += (i + 1) * a[i];
  return (2 * weighted) / (a.length * sum) - (a.length + 1) / a.length;
};

const bins = (v: number[], n = 8) => {
  const result = Array(n).fill(0);
  if (!v.length) return result;
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) {
    result[0] = v.length;
    return result;
  }
  const width = (max - min) / n;
  for (const x of v) {
    result[Math.min(n - 1, Math.floor((x - min) / width))]++;
  }
  return result;
};

const binSums = (v: number[], n = 8) => {
  const result = Array(n).fill(0);
  if (!v.length) return result;
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) {
    result[0] = v.reduce((sum, value) => sum + value, 0);
    return result;
  }
  const width = (max - min) / n;
  for (const x of v) {
    result[Math.min(n - 1, Math.floor((x - min) / width))] += x;
  }
  return result;
};

export class World {
  readonly width = 1800;
  readonly height = 1100;
  minute = 0;
  foodPrice = 1;
  readonly prices: Record<Good, number> = { food: 1, wood: 1, fish: 1 };
  agents: Agent[] = [];
  parameters: Parameters;

  private moneySupplyTarget = 0;
  private history: Metrics[] = [];
  private snapshots: { minute: number; foodPrice: number; agents: Agent[] }[] = [];

  constructor(parameters: Parameters) {
    this.parameters = structuredClone(parameters);
    this.reset();
  }

  reset() {
    this.minute = 0;
    this.foodPrice = 1;
    this.prices.food = 1;
    this.prices.wood = 1;
    this.prices.fish = 1;
    this.moneySupplyTarget = this.parameters.population * this.parameters.initialMoney;
    this.history = [];
    this.snapshots = [];
    this.agents = Array.from({ length: this.parameters.population }, (_, id) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 120 + Math.random() * 430;

      return {
        id,
        x: this.width / 2 + Math.cos(angle) * radius,
        y: this.height / 2 + Math.sin(angle) * radius,
        job: this.initialJobFor(id),
        productivity: Math.exp(this.gaussian() * this.parameters.productivityVariance),
        money: this.parameters.initialMoney
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
      const nextCapture = Math.max(
        this.minute + 1,
        Math.floor(this.minute / interval) * interval + interval
      );

      const chunk = Math.min(remaining, nextCapture - this.minute);
      this.advanceChunk(chunk);
      remaining -= chunk;

      if (this.minute === nextCapture) {
        this.capture();
      }
    }
  }

  rewind(minutes = 60) {
    const target = Math.max(0, this.minute - minutes);
    const snap = [...this.snapshots].reverse().find(s => s.minute <= target);

    if (!snap) return;

    this.minute = snap.minute;
    this.foodPrice = snap.foodPrice;
    this.agents = structuredClone(snap.agents);
    this.history = this.history.filter(x => x.minute <= this.minute);
  }

  getMetrics(): Metrics {
    const wealth = this.agents.map(a => a.money);
    const productivity = this.agents.map(a => a.productivity);
    const wealthMin = Math.min(...wealth);
    const wealthMax = Math.max(...wealth);
    const wealthTotal = wealth.reduce((sum, value) => sum + value, 0);
    const productivityMin = Math.min(...productivity);
    const productivityMax = Math.max(...productivity);

    return {
      minute: this.minute,
      population: this.agents.length,
      medianWealth: median(wealth),
      gini: gini(wealth),
      foodPrice: this.prices.food,
      moneySupply: wealth.reduce((sum, value) => sum + value, 0),
      prices: { ...this.prices },
      wealthBins: bins(wealth),
      wealthBinSums: binSums(wealth),
      wealthTotal,
      wealthMin,
      wealthMax,
      productivityBins: bins(productivity),
      productivityMin,
      productivityMax
    };
  }

  getHistory() {
    return [...this.history];
  }

  getDisplayHistory(speed: number) {
    const interval =
      speed >= 1000 ? 1440 :
      speed >= 100 ? 120 :
      speed >= 10 ? 30 :
      10;

    const result: Metrics[] = [];

    for (const point of this.history) {
      if (point.minute % interval === 0) result.push(point);
    }

    const last = this.history[this.history.length - 1];
    if (last && result[result.length - 1] !== last) result.push(last);

    return result;
  }

  getJobCounts(): Record<Job, number> {
    const counts: Record<Job, number> = {
      farmer: 0,
      forester: 0,
      fisher: 0
    };

    for (const agent of this.agents) counts[agent.job]++;
    return counts;
  }

  color(job: Job) {
    return jobColor[job];
  }

  getAgentAtWorldPosition(x: number, y: number, radius: number): Agent | null {
    const radiusSquared = radius * radius;
    let nearest: Agent | null = null;
    let nearestDistance = radiusSquared;

    for (const agent of this.agents) {
      const dx = agent.x - x;
      const dy = agent.y - y;
      const distance = dx * dx + dy * dy;

      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearest = agent;
      }
    }

    return nearest;
  }

  private capture() {
    this.history.push(this.getMetrics());
    this.compactHistory();

    this.snapshots.push({
      minute: this.minute,
      foodPrice: this.foodPrice,
      agents: structuredClone(this.agents)
    });

    this.compactSnapshots();
  }

  private compactHistory() {
    const now = this.minute;
    const buckets = new Map<string, Metrics>();

    for (const metric of this.history) {
      const age = now - metric.minute;
      let key: string;

      if (age < 60) {
        key = `m10:${metric.minute}`;
      } else if (age < 1440) {
        key = `h:${Math.floor(metric.minute / 60)}`;
      } else if (age < 43200) {
        key = `d:${Math.floor(metric.minute / 1440)}`;
      } else {
        key = `mo:${Math.floor(metric.minute / 43200)}`;
      }

      const existing = buckets.get(key);
      if (!existing || metric.minute > existing.minute) {
        buckets.set(key, metric);
      }
    }

    this.history = [...buckets.values()].sort((a, b) => a.minute - b.minute);
  }

  private compactSnapshots() {
    const now = this.minute;
    const buckets = new Map<string, (typeof this.snapshots)[number]>();

    for (const snapshot of this.snapshots) {
      const age = now - snapshot.minute;
      let key: string;

      if (age < 60) {
        key = `m10:${snapshot.minute}`;
      } else if (age < 1440) {
        key = `h:${Math.floor(snapshot.minute / 60)}`;
      } else if (age < 43200) {
        key = `d:${Math.floor(snapshot.minute / 1440)}`;
      } else {
        key = `mo:${Math.floor(snapshot.minute / 43200)}`;
      }

      const existing = buckets.get(key);
      if (!existing || snapshot.minute > existing.minute) {
        buckets.set(key, snapshot);
      }
    }

    this.snapshots = [...buckets.values()].sort((a, b) => a.minute - b.minute);
  }

  private advanceChunk(minutes: number) {
    const previousMinute = this.minute;
    this.minute += minutes;

    if (this.parameters.moneyEnabled) {
      const previousDay = Math.floor(previousMinute / 1440);
      const currentDay = Math.floor(this.minute / 1440);
      const daysElapsed = currentDay - previousDay;

      for (let day = 0; day < daysElapsed; day++) {
        this.processMarketDay();
      }
    }

    const distance = Math.sqrt(minutes) * 0.9;

    for (const agent of this.agents) {
      agent.x = Math.max(
        20,
        Math.min(this.width - 20, agent.x + (Math.random() - 0.5) * distance)
      );
      agent.y = Math.max(
        20,
        Math.min(this.height - 20, agent.y + (Math.random() - 0.5) * distance)
      );
    }
  }

  private processMarketDay() {
    const supplies: Record<Good, number> = {
      food: 0,
      wood: 0,
      fish: 0
    };

    for (const agent of this.agents) {
      const good = jobGood[agent.job];
      supplies[good] += baseProductionPerDay[agent.job] * agent.productivity;
    }

    const requiredDemand: Record<Good, number> = {
      food: dailyNeed.food * this.agents.length,
      wood: dailyNeed.wood * this.agents.length,
      fish: dailyNeed.fish * this.agents.length
    };

    const requiredCost =
      dailyNeed.food * this.prices.food +
      dailyNeed.wood * this.prices.wood +
      dailyNeed.fish * this.prices.fish;

    // Every individual tries to buy the same essential basket.
    // Their available money limits effective demand, but purchases remain
    // transfers between agents: no new money enters the system.
    const affordability = this.agents.map(agent =>
      Math.min(1, agent.money / Math.max(1e-9, requiredCost))
    );

    const affordabilitySum = affordability.reduce((sum, value) => sum + value, 0);
    const effectiveDemand: Record<Good, number> = {
      food: dailyNeed.food * affordabilitySum,
      wood: dailyNeed.wood * affordabilitySum,
      fish: dailyNeed.fish * affordabilitySum
    };

    const purchaseFraction: Record<Good, number> = {
      food: Math.min(
        1,
        effectiveDemand.food > 0 ? supplies.food / effectiveDemand.food : 0
      ),
      wood: Math.min(
        1,
        effectiveDemand.wood > 0 ? supplies.wood / effectiveDemand.wood : 0
      ),
      fish: Math.min(
        1,
        effectiveDemand.fish > 0 ? supplies.fish / effectiveDemand.fish : 0
      )
    };

    const saleFraction: Record<Good, number> = {
      food: Math.min(
        1,
        supplies.food > 0 ? effectiveDemand.food * purchaseFraction.food / supplies.food : 0
      ),
      wood: Math.min(
        1,
        supplies.wood > 0 ? effectiveDemand.wood * purchaseFraction.wood / supplies.wood : 0
      ),
      fish: Math.min(
        1,
        supplies.fish > 0 ? effectiveDemand.fish * purchaseFraction.fish / supplies.fish : 0
      )
    };

    // Buyers spend only what they can afford and receive the same fraction
    // of each essential good when the market is physically constrained.
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const ratioByBudget = affordability[index];

      const purchaseRatio = {
        food: ratioByBudget * purchaseFraction.food,
        wood: ratioByBudget * purchaseFraction.wood,
        fish: ratioByBudget * purchaseFraction.fish
      };

      const spend =
        dailyNeed.food * this.prices.food * purchaseRatio.food +
        dailyNeed.wood * this.prices.wood * purchaseRatio.wood +
        dailyNeed.fish * this.prices.fish * purchaseRatio.fish;

      agent.money = Math.max(0, agent.money - spend);
    }

    // Sellers receive exactly the money spent on the goods they produced.
    for (const agent of this.agents) {
      const good = jobGood[agent.job];
      const production = baseProductionPerDay[agent.job] * agent.productivity;
      agent.money += production * this.prices[good] * saleFraction[good];
    }

    // Prices react to effective demand vs available supply.
    for (const good of ["food", "wood", "fish"] as Good[]) {
      const demandSupplyRatio =
        effectiveDemand[good] / Math.max(supplies[good], 1e-9);
      const bounded = Math.max(-0.25, Math.min(0.25, demandSupplyRatio - 1));

      this.prices[good] *= Math.exp(this.parameters.priceSensitivity * bounded);
      this.prices[good] = Math.max(0.01, Math.min(100, this.prices[good]));
    }

    // Mobility: an individual may move when another activity would pay
    // materially more given their own productivity and current prices.
    const saleFractions = saleFraction;
    const switchThreshold = 0.05;
    const dailyMobility = Math.min(1, this.parameters.mobility);

    for (const agent of this.agents) {
      const expectedIncome = (job: Job) => {
        const good = jobGood[job];
        return (
          baseProductionPerDay[job] *
          agent.productivity *
          this.prices[good] *
          saleFractions[good]
        );
      };

      const currentIncome = expectedIncome(agent.job);
      let bestJob = agent.job;
      let bestIncome = currentIncome;

      for (const job of jobs) {
        const income = expectedIncome(job);
        if (income > bestIncome * (1 + switchThreshold)) {
          bestIncome = income;
          bestJob = job;
        }
      }

      if (bestJob !== agent.job && Math.random() < dailyMobility) {
        agent.job = bestJob;
      }
    }

    // Numerical cleanup only: the money supply is a conserved quantity.
    const currentSupply = this.agents.reduce((sum, agent) => sum + agent.money, 0);
    const residue = this.moneySupplyTarget - currentSupply;

    if (this.agents.length > 0 && Math.abs(residue) > 1e-9) {
      this.agents[this.agents.length - 1].money += residue;
    }
  }

  private gaussian() {
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
