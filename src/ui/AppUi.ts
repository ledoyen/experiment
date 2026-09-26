import type { Parameters, Metrics } from "../data/types";
import { t } from "../i18n";
import { World } from "../model/World";
import { GameView } from "../render/GameView";

type SeriesKey = "medianWealth" | "gini" | "foodPrice";
type HistogramKey = "wealthBins" | "productivityBins";

const SERIES_COLORS: Record<SeriesKey, string> = {
  medianWealth: "#9fe870",
  gini: "#f4b942",
  foodPrice: "#72b7ff"
};

const formatValue = (value: number) => {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export class AppUi {
  private readonly ui: HTMLDivElement;
  private running = true;
  private speed = 1;
  private series = new Set<SeriesKey>(["medianWealth", "gini", "foodPrice"]);
  private histogram: HistogramKey = "wealthBins";
  private hoverX: number | null = null;
  private histogramHoverX: number | null = null;

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

        <div class="line-wrap">
          <canvas id="line"></canvas>
          <div id="line-tooltips" class="line-tooltips" hidden></div>
        </div>

        <div id="line-legend" class="line-legend"></div>

        <div class="hist-wrap">
          <canvas id="hist"></canvas>
          <div id="hist-tooltip" class="hist-tooltip" hidden></div>
        </div>

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

      <div id="population-legend" class="population-legend"></div>

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
        <button data-action="rewind" title="${t("rewind")}">◀</button>
        <button data-action="pause" title="${t("pause")}">Ⅱ</button>
        <button data-action="play" title="${t("play")}">▶</button>
        <button data-speed="1">×1</button>
        <button data-speed="10">×10</button>
        <button data-speed="100">×100</button>
        <button data-speed="1000">×1000</button>
        <span id="clock"></span>
      </nav>`;

    this.bind();
    this.render();
  }

  private check(key: SeriesKey, label: string) {
    return `<label><input type="checkbox" data-series="${key}" checked> <span class="series-dot" style="--series-color:${SERIES_COLORS[key]}"></span>${t(label)}</label>`;
  }

  private range(id: keyof Parameters, label: string, min: number, max: number, value: number, step: number) {
    return `<label class="range"><span>${t(label)}</span><output id="${String(id)}-out">${value}</output><input id="${String(id)}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }

  private bind() {
    this.ui.querySelector("#drawer-toggle")?.addEventListener("click", () => {
      this.ui.querySelector(".drawer")?.classList.toggle("open");
    });

    this.ui.querySelector("#restart")?.addEventListener("click", () => {
      this.world.reset();
      this.hoverX = null;
      this.histogramHoverX = null;
    });

    const line = this.ui.querySelector<HTMLCanvasElement>("#line");
    line?.addEventListener("pointermove", event => {
      const rect = line.getBoundingClientRect();
      this.hoverX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    });
    line?.addEventListener("pointerleave", () => {
      this.hoverX = null;
    });

    const hist = this.ui.querySelector<HTMLCanvasElement>("#hist");
    hist?.addEventListener("pointermove", event => {
      const rect = hist.getBoundingClientRect();
      this.histogramHoverX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    });
    hist?.addEventListener("pointerleave", () => {
      this.histogramHoverX = null;
    });

    for (const id of ["population", "initialMoney", "mobility", "priceSensitivity", "productivityVariance"] as const) {
      const input = this.ui.querySelector<HTMLInputElement>("#" + id);
      const output = this.ui.querySelector<HTMLOutputElement>("#" + id + "-out");
      input?.addEventListener("input", () => {
        const value = Number(input.value);
        if (output) output.value = input.value;
        this.world.setParameters({ [id]: value });
      });
    }

    this.ui.querySelector("#money")?.addEventListener("change", event => {
      this.world.setParameters({ moneyEnabled: (event.target as HTMLInputElement).checked });
    });

    this.ui.querySelectorAll<HTMLInputElement>("[data-series]").forEach(input => input.addEventListener("change", () => {
      const key = input.dataset.series as SeriesKey;
      input.checked ? this.series.add(key) : this.series.delete(key);
    }));

    this.ui.querySelectorAll<HTMLInputElement>('input[name="hist"]').forEach(input => input.addEventListener("change", () => {
      if (input.checked) this.histogram = input.value as HistogramKey;
    }));

    this.ui.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach(button => {
      button.addEventListener("click", () => {
        this.running = true;
        this.speed = Number(button.dataset.speed);
      });
    });

    this.ui.querySelectorAll<HTMLButtonElement>(".timebar button[data-action]").forEach(button => button.addEventListener("click", () => {
      switch (button.dataset.action) {
        case "rewind":
          this.world.rewind(60);
          break;
        case "pause":
          this.running = false;
          this.speed = 0;
          break;
        case "play":
          this.running = true;
          this.speed = 1;
          break;
      }
    }));
  }

  shouldRun() {
    return this.running;
  }

  currentSpeed() {
    return this.speed;
  }

  render() {
    const fullHistory = this.world.getHistory();
    const displayHistory = this.world.getDisplayHistory(this.speed);
    const latest = fullHistory[fullHistory.length - 1];

    const line = this.ui.querySelector<HTMLCanvasElement>("#line");
    const hist = this.ui.querySelector<HTMLCanvasElement>("#hist");

    if (line) {
      renderLineChart(
        line,
        displayHistory,
        this.series,
        this.hoverX,
        this.ui.querySelector<HTMLDivElement>("#line-tooltips")
      );
    }

    if (hist && latest) {
      renderHistogram(
        hist,
        latest,
        this.histogram,
        this.histogramHoverX,
        this.ui.querySelector<HTMLDivElement>("#hist-tooltip")
      );
    }

    this.renderLegend(fullHistory);
    this.renderPopulationLegend();

    const m = this.world.minute;
    const day = Math.floor(m / 1440) + 1;
    const hh = String(Math.floor((m % 1440) / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const clock = this.ui.querySelector("#clock");

    if (clock) {
      clock.textContent = `${t("day")} ${day} · ${hh}:${mm} · ${t("speed")} ×${this.speed}`;
    }

    this.view.render();
  }

  private renderLegend(history: Metrics[]) {
    const root = this.ui.querySelector<HTMLDivElement>("#line-legend");
    if (!root) return;

    root.innerHTML = [...this.series].map(key => {
      const values = history.map(point => Number(point[key]));
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;
      const med = median(values);

      return `
        <div class="legend-item">
          <span class="legend-line" style="--series-color:${SERIES_COLORS[key]}"></span>
          <span class="legend-name">${t(key)}</span>
          <span class="legend-stats">${t("min")} ${formatValue(min)} · ${t("max")} ${formatValue(max)} · ${t("median")} ${formatValue(med)}</span>
        </div>`;
    }).join("");
  }

  private renderPopulationLegend() {
    const root = this.ui.querySelector<HTMLDivElement>("#population-legend");
    if (!root) return;

    const counts = this.world.getJobCounts();
    const jobs = Object.keys(counts) as Array<keyof typeof counts>;

    root.innerHTML = jobs.map(job => `
      <div class="population-job">
        <span class="job-dot" style="--job-color:${this.world.color(job)}"></span>
        <span>${t(`job.${job}`)}</span>
        <strong>${counts[job]}</strong>
      </div>`).join("");
  }
}

function setup(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function renderLineChart(
  canvas: HTMLCanvasElement,
  history: Metrics[],
  active: Set<SeriesKey>,
  hoverX: number | null,
  tooltips: HTMLDivElement | null
) {
  const { ctx, w, h } = setup(canvas);

  ctx.fillStyle = "#0d140f";
  ctx.fillRect(0, 0, w, h);

  const keys = [...active];

  if (tooltips) {
    tooltips.innerHTML = "";
    tooltips.hidden = hoverX === null || history.length < 2 || keys.length === 0;
  }

  if (history.length < 2 || !keys.length) return;

  const palette: Record<SeriesKey, string> = {
    medianWealth: "#9fe870",
    gini: "#f4b942",
    foodPrice: "#72b7ff"
  };

  const values = history.flatMap(point => keys.map(key => Number(point[key])));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);

  const hoverRatio = hoverX === null ? 0 : hoverX;
  const hoverIndex = Math.min(
    history.length - 1,
    Math.max(0, Math.round(hoverRatio * (history.length - 1)))
  );
  const hoverPoint = history[hoverIndex];
  const cursorPx = 5 + hoverRatio * (w - 10);

  if (hoverX !== null) {
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorPx, 4);
    ctx.lineTo(cursorPx, h - 4);
    ctx.stroke();
  }

  keys.forEach(key => {
    ctx.strokeStyle = palette[key];
    ctx.lineWidth = 2;
    ctx.beginPath();

    history.forEach((point, index) => {
      const px = 5 + index / (history.length - 1) * (w - 10);
      const py = h - 6 - (Number(point[key]) - min) / span * (h - 12);
      index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });

    ctx.stroke();

    if (hoverX !== null) {
      const value = Number(hoverPoint[key]);
      const py = h - 6 - (value - min) / span * (h - 12);

      ctx.fillStyle = palette[key];
      ctx.beginPath();
      ctx.arc(cursorPx, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (tooltips) {
        const tooltip = document.createElement("div");
        tooltip.className = "point-tooltip";
        tooltip.style.setProperty("--series-color", palette[key]);
        const tooltipWidth = 120;
        const left = cursorPx + tooltipWidth + 12 > w ? cursorPx - tooltipWidth - 12 : cursorPx + 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(4, Math.min(h - 28, py - 14))}px`;
        tooltip.innerHTML = `<span>${t(key)}</span><strong>${formatValue(value)}</strong>`;
        tooltips.appendChild(tooltip);
      }
    }
  });
}

function renderHistogram(
  canvas: HTMLCanvasElement,
  metric: Metrics,
  histogram: HistogramKey,
  hoverX: number | null,
  tooltip: HTMLDivElement | null
) {
  const { ctx, w, h } = setup(canvas);
  const values = metric[histogram];

  ctx.fillStyle = "#0d140f";
  ctx.fillRect(0, 0, w, h);

  const max = Math.max(1, ...values);
  const barWidth = w / values.length;

  values.forEach((value, index) => {
    const barHeight = value / max * (h - 10);
    ctx.fillStyle = "#76c7c0";
    ctx.fillRect(index * barWidth + 2, h - barHeight - 2, barWidth - 4, barHeight);
  });

  if (tooltip) {
    tooltip.hidden = hoverX === null;
  }

  if (hoverX === null) return;

  const index = Math.min(values.length - 1, Math.floor(hoverX * values.length));
  const count = values[index];
  const min = histogram === "wealthBins" ? metric.wealthMin : metric.productivityMin;
  const maxValue = histogram === "wealthBins" ? metric.wealthMax : metric.productivityMax;
  const step = maxValue === min ? 0 : (maxValue - min) / values.length;
  const low = min + step * index;
  const high = index === values.length - 1 ? maxValue : low + step;

  if (tooltip) {
    const cursorPx = hoverX * w;
    const tooltipWidth = 160;
    tooltip.style.left = `${Math.min(w - tooltipWidth - 4, Math.max(4, cursorPx + 8))}px`;
    tooltip.style.top = "4px";
    tooltip.innerHTML = `
      <div class="tooltip-time">${t(histogram === "wealthBins" ? "wealthDistribution" : "productivityDistribution")}</div>
      <div class="tooltip-row"><span>${t("count")}</span><strong>${count}</strong></div>
      <div class="tooltip-row"><span>${formatValue(low)} – ${formatValue(high)}</span><strong>${((count / Math.max(1, metric.population)) * 100).toFixed(1)}%</strong></div>
    `;
  }
}
