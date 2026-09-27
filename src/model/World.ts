import type { Agent, Job, Metrics, Parameters } from "../data/types";

const jobs: Job[] = ["farmer", "forester", "fisher"];

const jobFactor: Record<Job, number> = {
  farmer: 1.25,
  forester: 0.95,
  fisher: 0.85
};

const jobColor: Record<Job, string> = {
  farmer: "#8ba86c",
  forester: "#4e7650",
  fisher: "#5d91b8"
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

export class World {
  readonly width = 1800;
  readonly height = 1100;
  minute = 0;
  foodPrice = 1;
  agents: Agent[] = [];
  parameters: Parameters;

  private history: Metrics[] = [];
  private snapshots: { minute: number; foodPrice: number; agents: Agent[] }[] = [];

  constructor(parameters: Parameters) {
    this.parameters = structuredClone(parameters);
    this.reset();
  }

  reset() {
    this.minute = 0;
    this.foodPrice = 1;
    this.history = [];
    this.snapshots = [];
    this.agents = Array.from({ length: this.parameters.population }, (_, id) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 120 + Math.random() * 430;

      return {
        id,
        x: this.width / 2 + Math.cos(angle) * radius,
        y: this.height / 2 + Math.sin(angle) * radius,
        job: jobs[id % jobs.length],
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
    const productivityMin = Math.min(...productivity);
    const productivityMax = Math.max(...productivity);

    return {
      minute: this.minute,
      population: this.agents.length,
      medianWealth: median(wealth),
      gini: gini(wealth),
      foodPrice: this.foodPrice,
      wealthBins: bins(wealth),
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
    const noise = 1 + (Math.random() - 0.5) * 0.08 * Math.sqrt(minutes);
    this.foodPrice *= Math.exp(this.parameters.priceSensitivity * (noise - 1));
    this.foodPrice = Math.max(0.15, Math.min(8, this.foodPrice));

    const switchProbability = 1 - Math.pow(1 - this.parameters.mobility / 1440, minutes);

    for (const agent of this.agents) {
      agent.money += jobFactor[agent.job] * agent.productivity * this.foodPrice / 60 * minutes;

      if (Math.random() < switchProbability) {
        agent.job = jobs[Math.floor(Math.random() * jobs.length)];
      }
    }
  }

  private gaussian() {
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
