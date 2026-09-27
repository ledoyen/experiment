import type { Agent, Good, Job, Metrics, Parameters } from "../data/types";

const jobs: Job[] = ["farmer", "forester", "fisher"];

const jobFactor: Record<Job, number> = {
  farmer: 1.25,
  forester: 0.95,
  fisher: 0.85
};

const jobGood: Record<Job, Good> = {
  farmer: "food",
  forester: "wood",
  fisher: "fish"
};

const jobColor: Record<Job, string> = {
  farmer: "#8ba86c",
  forester: "#5d91b8",
  fisher: "#b27a4e"
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
    this.minute += minutes;

    if (this.parameters.moneyEnabled) {
      this.stepMarket(minutes);
    }

    const distance = Math.sqrt(minutes) * 0.9;

    for (const agent of this.agents) {
      agent.x = Math.max(20, Math.min(this.width - 20, agent.x + (Math.random() - 0.5) * distance));
      agent.y = Math.max(20, Math.min(this.height - 20, agent.y + (Math.random() - 0.5) * distance));
    }
  }

  private stepMarket(minutes: number) {
    const days = Math.max(1, Math.floor(minutes / 1440));

    for (let day = 0; day < days; day++) {
      this.processMarketDay();
    }

    this.foodPrice = this.prices.food;
  }

  private processMarketDay() {
    const supplies: Record<Good, number> = { food: 0, wood: 0, fish: 0 };

    for (const agent of this.agents) {
      const good = jobGood[agent.job];
      supplies[good] += baseProductionPerDay[agent.job] * agent.productivity;
    }

    const requiredDemand: Record<Good, number> = {
      food: dailyNeed.food * this.agents.length,
      wood: dailyNeed.wood * this.agents.length,
      fish: dailyNeed.fish * this.agents.length
    };

    // Demand is first constrained by each person's available money.
    const desiredCosts = this.agents.map(agent =>
      (dailyNeed.food * this.prices.food) +
      (dailyNeed.wood * this.prices.wood) +
      (dailyNeed.fish * this.prices.fish)
    );

    const affordability = this.agents.map((agent, index) =>
      Math.min(1, agent.money / Math.max(1e-9, desiredCosts[index]))
    );

    const effectiveDemand: Record<Good, number> = {
      food: dailyNeed.food * affordability.reduce((sum, value) => sum + value, 0),
      wood: dailyNeed.wood * affordability.reduce((sum, value) => sum + value, 0),
      fish: dailyNeed.fish * affordability.reduce((sum, value) => sum + value, 0)
    };

    const saleRatio: Record<Good, number> = {
      food: Math.min(1, supplies.food > 0 ? effectiveDemand.food / supplies.food : 0),
      wood: Math.min(1, supplies.wood > 0 ? effectiveDemand.wood / supplies.wood : 0),
      fish: Math.min(1, supplies.fish > 0 ? effectiveDemand.fish / supplies.fish : 0)
    };

    const purchaseRatio: Record<Good, number> = {
      food: Math.min(1, supplies.food > 0 ? effectiveDemand.food / Math.max(requiredDemand.food, 1e-9) : 0),
      wood: Math.min(1, supplies.wood > 0 ? effectiveDemand.wood / Math.max(requiredDemand.wood, 1e-9) : 0),
      fish: Math.min(1, supplies.fish > 0 ? effectiveDemand.fish / Math.max(requiredDemand.fish, 1e-9) : 0)
    };

    // SELL: money moves from buyers to the people producing the purchased good.
    for (const agent of this.agents) {
      const good = jobGood[agent.job];
      const production = baseProductionPerDay[agent.job] * agent.productivity;
      agent.money += production * this.prices[good] * saleRatio[good];
    }

    // BUY: money leaves each buyer. No money is created here.
    for (const agent of this.agents) {
      const budget = agent.money;
      const ratio = Math.min(
        affordability[this.agents.indexOf(agent)],
        purchaseRatio.food,
        purchaseRatio.wood,
        purchaseRatio.fish
      );

      const spend =
        dailyNeed.food * this.prices.food * ratio +
        dailyNeed.wood * this.prices.wood * ratio +
        dailyNeed.fish * this.prices.fish * ratio;

      agent.money = Math.max(0, budget - spend);
    }

    // Prices respond to physical demand versus physical supply.
    const priceStep = this.parameters.priceSensitivity;
    for (const good of ["food", "wood", "fish"] as Good[]) {
      const ratio = requiredDemand[good] / Math.max(supplies[good], 1e-9);
      const bounded = Math.max(-0.25, Math.min(0.25, ratio - 1));
      this.prices[good] *= Math.exp(priceStep * bounded);
      this.prices[good] = Math.max(0.01, Math.min(100, this.prices[good]));
    }

    // Professional mobility responds to expected sales income.
    const expectedIncome = (job: Job, agent: Agent) => {
      const good = jobGood[job];
      return baseProductionPerDay[job] * agent.productivity * this.prices[good] * saleRatio[good];
    };

    const switchThreshold = 0.05;
    const dailyMobility = Math.min(1, this.parameters.mobility);

    for (const agent of this.agents) {
      const currentIncome = expectedIncome(agent.job, agent);
      let bestJob = agent.job;
      let bestIncome = currentIncome;

      for (const job of jobs) {
        const income = expectedIncome(job, agent);
        if (income > bestIncome * (1 + switchThreshold)) {
          bestIncome = income;
          bestJob = job;
        }
      }

      if (bestJob !== agent.job && Math.random() < dailyMobility) {
        agent.job = bestJob;
      }
    }

    // The only legal money movements are purchases. Correct floating-point
    // residue so the monetary stock remains exactly conserved.
    const currentSupply = this.agents.reduce((sum, agent) => sum + agent.money, 0);
    const residue = this.moneySupplyTarget - currentSupply;
    if (this.agents.length > 0 && Math.abs(residue) > 1e-9) {
      this.agents[this.agents.length - 1].money += residue;
    }
  }

  private initialJobFor(id: number): Job {
    const fraction = (id + 0.5) / Math.max(1, this.parameters.population);
    if (fraction < initialJobRatios.farmer) return "farmer";
    if (fraction < initialJobRatios.farmer + initialJobRatios.forester) return "forester";
    return "fisher";
  }

  private gaussian() {
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
