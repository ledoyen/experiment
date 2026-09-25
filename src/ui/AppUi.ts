import type { Parameters, Metrics } from "../data/types";
import { t } from "../i18n";
import { World } from "../model/World";
import { GameView } from "../render/GameView";

type SeriesKey = "medianWealth" | "gini" | "foodPrice";
type HistogramKey = "wealthBins" | "productivityBins";

export class AppUi {
  private readonly ui: HTMLDivElement;
  private running = true;
  private speed = 1;
  private series = new Set<SeriesKey>(["medianWealth", "gini", "foodPrice"]);
  private histogram: HistogramKey = "wealthBins";

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly view: GameView
  ) {
    this.ui = document.createElement("div");
    this.ui.className = "ui";
    root.appendChild(this.ui);
  }

  mount() {
    this.ui.innerHTML = `
      <section class="panel">
        <header>${t("charts")}</header>
        <canvas id="line"></canvas>
        <canvas id="hist"></canvas>
        <div class="choices">
          ${this.check("medianWealth", "medianWealth")}
          ${this.check("gini", "gini")}
          ${this.check("foodPrice", "foodPrice")}
        </div>
        <div class="choices">
          <label><input type="radio" name="hist" value="wealthBins" checked> ${t("wealthDistribution")}</label>
          <label><input type="radio" name="hist" value="productivityBins"> ${t("productivityDistribution")}</label>
        </div>
      </section>

      <aside class="drawer">
        <button id="drawer-toggle">⚙</button>
        <div class="drawer-body">
          <header>${t("parameters")}</header>
          ${this.range("population", "population", 50, 1000, this.world.parameters.population, 10)}
          ${this.range("initialMoney", "initialMoney", 0, 500, this.world.parameters.initialMoney, 10)}
          ${this.range("mobility", "mobility", 0, 1, this.world.parameters.mobility, .05)}
          ${this.range("priceSensitivity", "priceSensitivity", 0, 1, this.world.parameters.priceSensitivity, .05)}
          ${this.range("productivityVariance", "productivityVariance", 0, .5, this.world.parameters.productivityVariance, .01)}
          <label class="switch"><input id="money" type="checkbox"> ${t("money")}</label>
          <button id="restart">${t("restart")}</button>
        </div>
      </aside>

      <nav class="timebar">
        <button data-action="rewind">◀</button>
        <button data-action="pause">Ⅱ</button>
        <button data-action="play">▶</button>
        <button data-action="fast">×10</button>
        <span id="clock"></span>
      </nav>`;
    this.bind();
    this.render();
  }

  private check(key: SeriesKey, label: string) {
    return `<label><input type="checkbox" data-series="${key}" checked> ${t(label)}</label>`;
  }

  private range(id: keyof Parameters, label: string, min: number, max: number, value: number, step: number) {
    return `<label class="range"><span>${t(label)}</span><output id="${String(id)}-out">${value}</output><input id="${String(id)}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }

  private bind() {
    this.ui.querySelector("#drawer-toggle")?.addEventListener("click", () => this.ui.querySelector(".drawer")?.classList.toggle("open"));
    this.ui.querySelector("#restart")?.addEventListener("click", () => this.world.reset());
    this.ui.querySelector("#money")?.addEventListener("change", e => this.world.setParameters({ moneyEnabled: (e.target as HTMLInputElement).checked }));

    for (const id of ["population", "initialMoney", "mobility", "priceSensitivity", "productivityVariance"] as const) {
      const input = this.ui.querySelector<HTMLInputElement>("#" + id);
      const output = this.ui.querySelector<HTMLOutputElement>("#" + id + "-out");
      input?.addEventListener("input", () => {
        const value = Number(input.value);
        if (output) output.value = input.value;
        this.world.setParameters({ [id]: value });
      });
    }

    this.ui.querySelectorAll<HTMLInputElement>("[data-series]").forEach(input => input.addEventListener("change", () => {
      const key = input.dataset.series as SeriesKey;
      input.checked ? this.series.add(key) : this.series.delete(key);
    }));

    this.ui.querySelectorAll<HTMLInputElement>('input[name="hist"]').forEach(input => input.addEventListener("change", () => {
      if (input.checked) this.histogram = input.value as HistogramKey;
    }));

    this.ui.querySelectorAll<HTMLButtonElement>(".timebar button").forEach(b => b.addEventListener("click", () => {
      switch (b.dataset.action) {
        case "rewind": this.world.rewind(60); break;
        case "pause": this.running = false; this.speed = 0; break;
        case "play": this.running = true; this.speed = 1; break;
        case "fast": this.running = true; this.speed = 10; break;
      }
    }));
  }

  shouldRun() { return this.running; }
  currentSpeed() { return this.speed; }

  render() {
    const history = this.world.getHistory();
    const latest = history[history.length - 1];
    const line = this.ui.querySelector<HTMLCanvasElement>("#line");
    const hist = this.ui.querySelector<HTMLCanvasElement>("#hist");
    if (line) lineChart(line, history, this.series);
    if (hist && latest) histogram(hist, latest[this.histogram]);

    const m = this.world.minute;
    const day = Math.floor(m / 1440) + 1;
    const hh = String(Math.floor((m % 1440) / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const clock = this.ui.querySelector("#clock");
    if (clock) clock.textContent = `${t("day")} ${day} · ${hh}:${mm} · ${t("speed")} ×${this.speed}`;

    this.view.render();
  }
}

function setup(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function lineChart(canvas: HTMLCanvasElement, history: Metrics[], active: Set<SeriesKey>) {
  const { ctx, w, h } = setup(canvas);
  ctx.fillStyle = "#0d140f"; ctx.fillRect(0, 0, w, h);
  const keys = [...active];
  if (history.length < 2 || !keys.length) return;
  const palette: Record<SeriesKey, string> = { medianWealth: "#9fe870", gini: "#f4b942", foodPrice: "#72b7ff" };
  const values = history.flatMap(x => keys.map(k => Number(x[k])));
  const min = Math.min(0, ...values), max = Math.max(1, ...values), span = Math.max(1e-9, max - min);
  keys.forEach((key, k) => {
    ctx.strokeStyle = palette[key]; ctx.lineWidth = 2; ctx.beginPath();
    history.forEach((x, i) => {
      const px = 5 + i / (history.length - 1) * (w - 10);
      const py = h - 6 - (Number(x[key]) - min) / span * (h - 12);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  });
}

function histogram(canvas: HTMLCanvasElement, values: number[]) {
  const { ctx, w, h } = setup(canvas);
  ctx.fillStyle = "#0d140f"; ctx.fillRect(0, 0, w, h);
  const max = Math.max(1, ...values), bw = w / values.length;
  values.forEach((v, i) => {
    const bh = v / max * (h - 10);
    ctx.fillStyle = "#76c7c0";
    ctx.fillRect(i * bw + 2, h - bh - 2, bw - 4, bh);
  });
}
