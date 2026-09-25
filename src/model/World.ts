import type { Agent, Job, Metrics, Parameters } from "../data/types";

const jobs: Job[] = ["farmer", "forester", "fisher", "builder"];

const jobFactor: Record<Job, number> = {
  farmer: 1.25,
  forester: 0.95,
  fisher: 0.85,
  builder: 0.65
};

const jobColor: Record<Job, string> = {
  farmer: "#8ba86c",
  forester: "#4e7650",
  fisher: "#5d91b8",
  builder: "#b27a4e"
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
  const min = Math.min(...v), max = Math.max(...v);
  if (min === max) { result[0] = v.length; return result; }
  for (const x of v) result[Math.min(n - 1, Math.floor((x - min) / ((max - min) / n)))]++;
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
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 430;
      return {
        id,
        x: this.width / 2 + Math.cos(a) * r,
        y: this.height / 2 + Math.sin(a) * r,
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

  step(minutes = 1) {
    for (let i = 0; i < minutes; i++) {
      this.minute++;
      if (this.parameters.moneyEnabled) this.stepMarket();
      this.stepMovement();
      if (this.minute % 10 === 0) this.capture();
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
    return {
      minute: this.minute,
      population: this.agents.length,
      medianWealth: median(wealth),
      gini: gini(wealth),
      foodPrice: this.foodPrice,
      wealthBins: bins(wealth),
      productivityBins: bins(this.agents.map(a => a.productivity))
    };
  }

  getHistory() { return [...this.history]; }
  color(job: Job) { return jobColor[job]; }

  private capture() {
    this.history.push(this.getMetrics());
    this.snapshots.push({
      minute: this.minute,
      foodPrice: this.foodPrice,
      agents: structuredClone(this.agents)
    });
    if (this.history.length > 900) this.history.shift();
    if (this.snapshots.length > 180) this.snapshots.shift();
  }

  private stepMarket() {
    const noise = 1 + (Math.random() - 0.5) * 0.08;
    this.foodPrice *= Math.exp(this.parameters.priceSensitivity * (noise - 1));
    this.foodPrice = Math.max(0.15, Math.min(8, this.foodPrice));
    for (const a of this.agents) {
      a.money += jobFactor[a.job] * a.productivity * this.foodPrice / 60;
      if (Math.random() < this.parameters.mobility / 1440) {
        a.job = jobs[Math.floor(Math.random() * jobs.length)];
      }
    }
  }

  private stepMovement() {
    for (const a of this.agents) {
      a.x = Math.max(20, Math.min(this.width - 20, a.x + (Math.random() - .5) * .9));
      a.y = Math.max(20, Math.min(this.height - 20, a.y + (Math.random() - .5) * .9));
    }
  }

  private gaussian() {
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
