import type { Parameters, Metrics, Agent, AgentEvent, Good, Job } from "../data/types";
import { CONSUMED_GOODS, GOODS, GOOD_PRICE_UNIT } from "../data/economy";
import { NUTRITION, type NutritionId } from "../data/nutrition";
import { chartTimeResolution, simulationTimeParts, estimateFoodAutonomyDays } from "../data/glossary";
import { t } from "../i18n";
import { World } from "../model/World";
import { GameView } from "../render/GameView";
import { buildAnalysisCsv } from "../analysis/buildAnalysisCsv";

type BaseSeriesKey = "medianWealth" | "gini" | "moneySupply" | "population" | "physicalWealth" | "zeroMoneyWithoutFood";
type SeriesKey = BaseSeriesKey | `price:${Good}` | `job:${Job}` | `stock:${Good}`;
type HistogramKey = "wealthBins" | "productivityBins";

const SERIES_COLORS: Record<string, string> = {
  medianWealth: "#9fe870",
  gini: "#f4b942",
  moneySupply: "#d1d5db",
  population: "#ff9f68",
  physicalWealth: "#8dd3c7",
  zeroMoneyWithoutFood: "#fb8072"
};

const PRICE_CURRENCY_SYMBOL = "🪙";
const PRICE_COLORS = ["#72b7ff", "#8dd3c7", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#bc80bd", "#ccebc5", "#ffed6f", "#a6cee3"];
const JOB_SERIES_COLORS: Record<Job, string> = {
  agriculture_ble: "#7f9f5b", agriculture_pomme_de_terre: "#91a86b", agriculture_legumineuses: "#6e8f4e",
  horticulture_legumes: "#88a96b", arboriculture_fruits: "#4f7f47", oliviculture: "#667f3b",
  "élevage_lait": "#c49a6c", aviculture_oeufs: "#d1b66f", pêche: "#5d91b8", chasse: "#8d6e63",
  textile: "#9b72a6", construction: "#b27a4e", bois_chauffage: "#5f4a3c", outillage: "#707070", idle: "#9aa39b"
};

function seriesColor(key: SeriesKey): string {
  if (key.startsWith("price:")) {
    const good = key.slice(6) as Good;
    const index = GOODS.indexOf(good);
    return PRICE_COLORS[index % PRICE_COLORS.length];
  }
  if (key.startsWith("job:")) return JOB_SERIES_COLORS[key.slice(4) as Job];
  if (key.startsWith("stock:")) {
    const index = GOODS.indexOf(key.slice(6) as Good);
    return PRICE_COLORS[(index + 5) % PRICE_COLORS.length];
  }
  return SERIES_COLORS[key];
}

function seriesValue(point: Metrics, key: SeriesKey): number {
  if (key.startsWith("price:")) return point.prices[key.slice(6) as Good];
  if (key.startsWith("job:")) return point.jobCounts[key.slice(4) as Job] ?? 0;
  if (key.startsWith("stock:")) return point.stocks[key.slice(6) as Good] ?? 0;
  if (key === "physicalWealth") return point.physicalWealth;
  if (key === "zeroMoneyWithoutFood") return point.zeroMoneyWithoutFoodCount;
  return Number(point[key as Exclude<BaseSeriesKey, "physicalWealth" | "zeroMoneyWithoutFood">]);
}

function seriesLabel(key: SeriesKey): string {
  if (key.startsWith("price:")) {
    const good = key.slice(6) as Good;
    return t("price") + " — " + t("good." + good) +
      " (" + PRICE_CURRENCY_SYMBOL + " / " + GOOD_PRICE_UNIT[good] + ")";
  }
  if (key.startsWith("job:")) return t("job." + key.slice(4));
  if (key.startsWith("stock:")) return t("stock") + " — " + t("good." + key.slice(6));
  return t(key);
}

function seriesUnit(key: SeriesKey): string {
  return key.startsWith("price:")
    ? PRICE_CURRENCY_SYMBOL + " / " + GOOD_PRICE_UNIT[key.slice(6) as Good]
    : "";
}

const formatValue = (value: number) => {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
};

const formatReserve = (value: number) => {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
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
  private series = new Set<SeriesKey>(["medianWealth", "gini", "moneySupply", "population", "price:ble"]);
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
          <div id="line-time-tooltip" class="line-time-tooltip" hidden></div>
        </div>

        <div id="line-legend" class="line-legend"></div>

        <div class="hist-wrap">
          <canvas id="hist"></canvas>
          <div id="hist-tooltip" class="hist-tooltip" hidden></div>
        </div>

        <div class="choices">
          ${this.check("medianWealth", "medianWealth")}
          ${this.check("gini", "gini")}
          ${this.check("moneySupply", "moneySupply")}
          ${this.check("population", "livingPopulation")}
          ${this.check("physicalWealth", "physicalWealth")}
          ${this.check("zeroMoneyWithoutFood", "zeroMoneyWithoutFood")}
          ${this.check("price:ble", "good.ble")}
        </div>
        <details class="price-choices">
          <summary>${t("price")} — ${t("charts")}</summary>
          <div class="choices">
            ${CONSUMED_GOODS.map(good => this.check(("price:" + good) as SeriesKey, "good." + good)).join("")}
          </div>
        </details>

        <details class="price-choices">
          <summary>${t("populationByJob")}</summary>
          <div class="choices">
            ${Object.keys(JOB_SERIES_COLORS).filter(job => job !== "idle").map(job => this.check(("job:" + job) as SeriesKey, "job." + job)).join("")}
          </div>
        </details>
        <details class="price-choices">
          <summary>${t("stock")}</summary>
          <div class="choices">
            ${CONSUMED_GOODS.map(good => this.check(("stock:" + good) as SeriesKey, "good." + good)).join("")}
          </div>
        </details>

        <div class="choices">
          <label><input type="radio" name="hist" value="wealthBins" checked> ${t("wealthDistribution")}</label>
          <label><input type="radio" name="hist" value="productivityBins"> ${t("productivityDistribution")}</label>
        </div>
      </section>

      <div id="population-legend" class="population-legend"></div>
      <div id="agent-tooltip" class="agent-tooltip" hidden></div>

      <div id="agent-modal" class="agent-modal" hidden>
        <div class="agent-modal-backdrop" data-agent-modal-close></div>
        <section class="agent-modal-card" role="dialog" aria-modal="true">
          <header class="agent-modal-header">
            <strong id="agent-modal-title"></strong>
            <button id="agent-modal-close" type="button" title="${t("close")}">×</button>
          </header>
          <nav class="agent-modal-tabs">
            <button type="button" data-agent-tab="profile" class="active">${t("agentProfile")}</button>
            <button type="button" data-agent-tab="events">${t("agentHistory")}</button>
          </nav>
          <div id="agent-modal-profile" class="agent-modal-content"></div>
          <div id="agent-modal-events" class="agent-modal-content" hidden></div>
        </section>
      </div>

            <a class="github-link" href="https://github.com/ledoyen/experiment" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.26c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.99c1.02 0 2.05.14 3.01.42 2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.13 3.17.76.84 1.22 1.91 1.22 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z"/></svg></a>
            <aside class="drawer">
        <button id="drawer-toggle">⚙</button>
        <div class="drawer-body">
          <header>${t("parameters")}</header>
          ${this.range("population", "population", 50, 1000, this.world.parameters.population, 10)}
          ${this.range("initialMoney", "initialMoneyPerIndividual", 0, 500, this.world.parameters.initialMoney, 10)}
          ${this.range("mobility", "mobility", 0, 1, this.world.parameters.mobility, .05)}
          ${this.range("priceSensitivity", "priceSensitivity", 0, 1, this.world.parameters.priceSensitivity, .05)}
          ${this.range("productivityVariance", "productivityVariance", 0, .5, this.world.parameters.productivityVariance, .01)}
          <label class="switch"><input id="money" type="checkbox"> ${t("money")}</label>
          <button id="export-analysis">${t("exportAnalysis")}</button>
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

    this.view.setAgentHoverHandler((agent, screenX, screenY) => {
      this.updateAgentTooltip(agent, screenX, screenY);
    });
    this.view.setAgentClickHandler((agent) => {
      if (agent) this.openAgentModal(agent);
    });

    this.bind();
    this.render();
  }

  private check(key: SeriesKey, label: string) {
    return `<label><input type="checkbox" data-series="${key}" ${this.series.has(key) ? "checked" : ""}> <span class="series-dot" style="--series-color:${seriesColor(key)}"></span>${t(label)}</label>`;
  }

  private range(id: keyof Parameters, label: string, min: number, max: number, value: number, step: number) {
    return `<label class="range"><span>${t(label)}</span><output id="${String(id)}-out">${value}</output><input id="${String(id)}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }

  private bind() {
    this.ui.querySelector("#drawer-toggle")?.addEventListener("click", () => {
      this.ui.querySelector(".drawer")?.classList.toggle("open");
    });

    this.ui.querySelector("#export-analysis")?.addEventListener("click", () => {
      this.exportAnalysisCsv();
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

    this.ui.querySelector("#agent-modal-close")?.addEventListener("click", () => this.closeAgentModal());
    this.ui.querySelector("[data-agent-modal-close]")?.addEventListener("click", () => this.closeAgentModal());
    this.ui.querySelectorAll<HTMLButtonElement>("[data-agent-tab]").forEach(button => {
      button.addEventListener("click", () => {
        const tab = button.dataset.agentTab;
        this.ui.querySelectorAll<HTMLButtonElement>("[data-agent-tab]").forEach(item => item.classList.toggle("active", item === button));
        const profile = this.ui.querySelector<HTMLElement>("#agent-modal-profile");
        const events = this.ui.querySelector<HTMLElement>("#agent-modal-events");
        if (profile) profile.hidden = tab !== "profile";
        if (events) events.hidden = tab !== "events";
      });
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

  currentRecordingInterval() {
    switch (this.speed) {
      case 1000: return 1440;
      case 100: return 120;
      case 10: return 30;
      default: return 10;
    }
  }

  render() {
    const fullHistory = this.world.getHistory();
    const displayHistory = this.world.getDisplayHistory(this.speed);
    const latest = this.world.getMetrics();

    const line = this.ui.querySelector<HTMLCanvasElement>("#line");
    const hist = this.ui.querySelector<HTMLCanvasElement>("#hist");

    if (line) {
      renderLineChart(
        line,
        displayHistory,
        this.series,
        this.hoverX,
        this.ui.querySelector<HTMLDivElement>("#line-tooltips"),
        this.ui.querySelector<HTMLDivElement>("#line-time-tooltip")
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

  private updateAgentTooltip(agent: Agent | null, screenX: number, screenY: number) {
    const tooltip = this.ui.querySelector<HTMLDivElement>("#agent-tooltip");
    if (!tooltip) return;

    if (!agent) {
      tooltip.hidden = true;
      return;
    }

    tooltip.hidden = false;
    const width = 250;
    tooltip.style.left = `${Math.min(window.innerWidth - width - 12, Math.max(8, screenX + 14))}px`;
    tooltip.style.top = `${Math.min(window.innerHeight - 12, Math.max(12, screenY + 14))}px`;
    tooltip.innerHTML = this.agentProfileMarkup(agent, false);
  }

  private agentProfileMarkup(agent: Agent, full: boolean) {
    const topRows = `
      <div class="agent-tooltip-title">#${agent.id}</div>
      <div class="agent-row"><span>${t("sex")}</span><strong>${t(`sex.${agent.sex}`)}</strong></div>
      <div class="agent-row"><span>${t("physiologyState")}</span><strong>${t(`physiology.${agent.state}`)}</strong></div>
      <div class="agent-row"><span>${t("job")}</span><strong>${t(`job.${agent.job}`)}</strong></div>
      <div class="agent-row"><span>${t("productivity")}</span><strong>${formatValue(agent.productivity)}</strong></div>
      <div class="agent-row"><span>${t("money")}</span><strong>${formatValue(agent.money)}</strong></div>
      <div class="agent-row"><span>${t("position")}</span><strong>${Math.round(agent.x)}, ${Math.round(agent.y)}</strong></div>`;

    if (!full) return topRows + this.nutritionGaugeMarkup(agent, ["energy"]);

    const sections: Array<{ title: string; ids: NutritionId[] }> = [
      { title: t("phys.section.energy"), ids: ["energy"] },
      { title: t("phys.section.macros"), ids: ["protein", "carbohydrate", "fat", "fiber"] },
      { title: t("phys.section.vitamins"), ids: ["vitamin_A", "vitamin_B1", "vitamin_B2", "vitamin_B3", "vitamin_B6", "vitamin_B9", "vitamin_B12", "vitamin_C", "vitamin_E", "vitamin_K"] },
      { title: t("phys.section.minerals"), ids: ["calcium", "iron", "magnesium", "zinc", "iodine", "selenium"] }
    ];

    const stocks = Object.entries(agent.inventory)
      .filter(([, quantity]) => (quantity ?? 0) > 1e-9)
      .sort(([a], [b]) => a.localeCompare(b));
    const autonomyDays = estimateFoodAutonomyDays(
      agent.reserves, agent.sex, agent.state, agent.inventory,
      this.world.prices, agent.metabolicFactor
    );

    return topRows + `
      <div class="agent-section">
        <div class="agent-section-title">${t("stock")}</div>
        <div class="agent-stock-list">
          ${stocks.length
            ? stocks.map(([good, quantity]) => `<div class="agent-row"><span>${t("good." + good)}</span><strong>${formatValue(quantity ?? 0)} ${GOOD_PRICE_UNIT[good as Good]}</strong></div>`).join("")
            : `<div class="empty-events">${t("noStock")}</div>`}
        </div>
        <div class="agent-row"><span>${t("foodAutonomy")}</span><strong>${autonomyDays === null ? "365+ " + t("day") : autonomyDays.toFixed(1) + " " + t("day")}</strong></div>
      </div>
      <div class="physiology-gauges full-profile">
        ${sections.map(section => `
          <div class="phys-section-title">${section.title}</div>
          ${this.nutritionGaugeMarkup(agent, section.ids)}
        `).join("")}
      </div>`;
  }

  private nutritionGaugeMarkup(agent: Agent, ids: NutritionId[]) {
    return ids.map(id => {
      const reserve = agent.reserves[id];
      const percent = reserve.max > 0 ? Math.max(0, Math.min(100, reserve.value / reserve.max * 100)) : 0;
      return `
        <div class="phys-gauge">
          <div class="phys-gauge-head">
            <span>${t(reserve.labelKey)}</span>
            <strong>${formatReserve(reserve.value)} ${reserve.unit} · ${percent.toFixed(0)}%</strong>
          </div>
          <div class="phys-gauge-track"><div class="phys-gauge-fill" style="width:${percent}%"></div></div>
        </div>`;
    }).join("");
  }

  private openAgentModal(agent: Agent) {
    const modal = this.ui.querySelector<HTMLDivElement>("#agent-modal");
    if (!modal) return;

    const title = this.ui.querySelector<HTMLElement>("#agent-modal-title");
    if (title) title.textContent = `#${agent.id}`;

    const profile = this.ui.querySelector<HTMLElement>("#agent-modal-profile");
    if (profile) {
      profile.hidden = false;
      profile.innerHTML = this.agentProfileMarkup(agent, true);
    }

    const events = this.ui.querySelector<HTMLElement>("#agent-modal-events");
    if (events) {
      events.hidden = true;
      events.innerHTML = this.agentEventsMarkup(agent);
    }

    this.ui.querySelectorAll<HTMLButtonElement>("[data-agent-tab]").forEach((button, index) => button.classList.toggle("active", index === 0));
    modal.hidden = false;
  }

  private closeAgentModal() {
    const modal = this.ui.querySelector<HTMLDivElement>("#agent-modal");
    if (modal) modal.hidden = true;
  }

  private agentEventsMarkup(agent: Agent) {
    if (!agent.events.length) return `<div class="empty-events">${t("noEvents")}</div>`;
    return [...agent.events].reverse().map(event => this.agentEventMarkup(event)).join("");
  }

  private agentEventMarkup(event: AgentEvent) {
    const time = formatEventTime(event.minute);
    if (event.type === "healthCritical") {
      return `
        <article class="agent-event health-critical">
          <div class="agent-event-time">${time}</div>
          <strong>${t("event.healthCritical")}</strong>
          <div>${t("event.criticalNutrient")}: ${t(`phys.${event.nutrient}`)} · ${(event.ratio * 100).toFixed(0)}%</div>
        </article>`;
    }

    return `
      <article class="agent-event">
        <div class="agent-event-time">${time}</div>
        <strong>${t("event.jobChange")}</strong>
        <div>${t("from")} ${t(`job.${event.previousJob}`)} → ${t(`job.${event.newJob}`)}</div>
        <div>${t("event.previousIncome")}: ${formatValue(event.previousIncome)} 🪙</div>
        <div>${t("event.expectedIncome")}: ${formatValue(event.expectedIncome)} 🪙</div>
      </article>`;
  }
  private exportAnalysisCsv() {
    const csv = buildAnalysisCsv(
      this.world.getHistory(),
      this.world.getInitialParameters(),
      this.world.parameters,
      this.world.getParameterEvents()
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const day = Math.floor(this.world.minute / 1440) + 1;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `economic-godgame-day-${day}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  private renderLegend(history: Metrics[]) {
    const root = this.ui.querySelector<HTMLDivElement>("#line-legend");
    if (!root) return;

    root.innerHTML = [...this.series].map(key => {
      const values = history.map(point => seriesValue(point, key));
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;
      const med = median(values);

      return `
        <div class="legend-item">
          <span class="legend-line" style="--series-color:${seriesColor(key)}"></span>
          <span class="legend-name">${seriesLabel(key)}</span>
          <span class="legend-stats">${t("min")} ${formatValue(min)} · ${t("max")} ${formatValue(max)} · ${t("median")} ${formatValue(med)}</span>
        </div>`;
    }).join("");
  }

  private renderPopulationLegend() {
    const root = this.ui.querySelector<HTMLDivElement>("#population-legend");
    if (!root) return;

    const counts = this.world.getJobCounts();
    const jobs = Object.keys(counts) as Array<keyof typeof counts>;

    root.innerHTML = jobs
      .filter(job => counts[job] > 0)
      .map(job => `
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

function formatChartTime(history: Metrics[], index: number): string {
  const current = history[index]?.minute ?? 0;
  const previous = index > 0 ? history[index - 1].minute : current;
  const next = index + 1 < history.length ? history[index + 1].minute : current;
  const deltas = [current - previous, next - current].filter(delta => delta > 0);
  const resolution = chartTimeResolution(deltas.length ? Math.min(...deltas) : 0);
  const parts = simulationTimeParts(current);

  switch (resolution) {
    case "month":
      return `${t("month")} ${parts.month} · ${t("year")} ${parts.year}`;
    case "day":
      return `${t("day")} ${parts.day}`;
    case "hour":
    case "minute":
    default:
      return `${t("day")} ${parts.day} · ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }
}

function formatEventTime(minute: number): string {
  const parts = simulationTimeParts(minute);
  return `${t("day")} ${parts.day} · ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
function niceAxis(minValue: number, maxValue: number, ticks = 5) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1, step: 0.2 };
  }

  if (minValue === maxValue) {
    const max = maxValue <= 0 ? 1 : maxValue;
    return { min: 0, max, step: max / (ticks - 1) };
  }

  const range = maxValue - minValue;
  const exponent = Math.floor(Math.log10(Math.max(range, 1e-9)));
  const base = Math.pow(10, exponent);
  const normalized = range / base;
  const niceStep =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 5 ? 5 : 10;

  const step = niceStep * base;
  let min = Math.floor(minValue / step) * step;
  let max = Math.ceil(maxValue / step) * step;

  if (minValue >= 0) min = 0;
  if (max <= min) max = min + step * (ticks - 1);

  return { min, max, step };
}

function renderLineChart(
  canvas: HTMLCanvasElement,
  history: Metrics[],
  active: Set<SeriesKey>,
  hoverX: number | null,
  tooltips: HTMLDivElement | null,
  timeTooltip: HTMLDivElement | null
) {
  const { ctx, w, h } = setup(canvas);
  ctx.fillStyle = "#0d140f";
  ctx.fillRect(0, 0, w, h);

  const keys = [...active];

  if (tooltips) {
    tooltips.innerHTML = "";
    tooltips.hidden = hoverX === null || history.length < 2 || keys.length === 0;
  }
  if (timeTooltip) {
    timeTooltip.hidden = hoverX === null || history.length < 2 || keys.length === 0;
  }

  if (history.length < 2 || !keys.length) return;

  const left = 38;
  const right = 6;
  const top = 14;
  const bottom = 10;
  const plotWidth = Math.max(1, w - left - right);
  const plotHeight = Math.max(1, h - top - bottom);

  const palette: Record<string, string> = Object.fromEntries(
    keys.map(key => [key, seriesColor(key)])
  );

  const values = history
    .flatMap(point => keys.map(key => seriesValue(point, key)))
    .filter(Number.isFinite);

  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const axis = niceAxis(rawMin, rawMax);
  const span = Math.max(axis.step, axis.max - axis.min);

  // Dynamic Y axis follows the currently selected series.
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1;
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const tickCount = Math.max(2, Math.floor((axis.max - axis.min) / axis.step) + 1);
  for (let tick = 0; tick < tickCount; tick++) {
    const value = axis.min + axis.step * tick;
    const py = h - bottom - ((value - axis.min) / span) * plotHeight;

    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(w - right, py);
    ctx.stroke();

    ctx.fillText(formatValue(value), left - 5, py);
  }

  const hoverRatio = hoverX === null ? 0 : hoverX;
  const hoverIndex = Math.min(
    history.length - 1,
    Math.max(0, Math.round(hoverRatio * (history.length - 1)))
  );
  const hoverPoint = history[hoverIndex];
  const cursorPx = left + hoverRatio * plotWidth;

  if (hoverX !== null) {
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorPx, top);
    ctx.lineTo(cursorPx, h - bottom);
    ctx.stroke();

    if (timeTooltip) {
      timeTooltip.hidden = false;
      timeTooltip.textContent = formatChartTime(history, hoverIndex);
      timeTooltip.style.left = `${cursorPx}px`;
    }
  }

  keys.forEach(key => {
    ctx.strokeStyle = palette[key];
    ctx.lineWidth = 2;
    ctx.beginPath();

    history.forEach((point, index) => {
      const value = seriesValue(point, key);
      const px = left + index / (history.length - 1) * plotWidth;
      const py = h - bottom - (value - axis.min) / span * plotHeight;
      index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });

    ctx.stroke();

    if (hoverX !== null) {
      const value = seriesValue(hoverPoint, key);
      const py = h - bottom - (value - axis.min) / span * plotHeight;

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
        const leftPos =
          cursorPx + tooltipWidth + 12 > w
            ? cursorPx - tooltipWidth - 12
            : cursorPx + 10;

        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${Math.max(4, Math.min(h - 28, py - 14))}px`;
        tooltip.innerHTML =
          `<span>${seriesLabel(key)}</span><strong>${formatValue(value)} ${seriesUnit(key)}</strong>`;

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
  const values = metric[histogram].map(value =>
    Number.isFinite(value) ? Math.max(0, value) : 0
  );

  ctx.fillStyle = "#0d140f";
  ctx.fillRect(0, 0, w, h);

  const max = Math.max(1, ...values);
  const barWidth = w / Math.max(1, values.length);

  values.forEach((value, index) => {
    const barHeight = Number.isFinite(value) ? value / max * (h - 10) : 0;
    ctx.fillStyle = "#76c7c0";
    ctx.fillRect(index * barWidth + 2, h - barHeight - 2, Math.max(0, barWidth - 4), barHeight);
  });

  if (!tooltip) return;
  tooltip.hidden = hoverX === null || values.length === 0;
  if (hoverX === null || values.length === 0) return;

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.floor(hoverX * values.length))
  );
  const count = values[index];

  const edges = histogram === "wealthBins"
    ? metric.wealthBinEdges
    : metric.productivityBinEdges;

  const low = Number.isFinite(edges[index]) ? edges[index] : 0;
  const rawHigh = Number.isFinite(edges[index + 1]) ? edges[index + 1] : low;
  const high = Math.max(low, rawHigh);

  const wealthSum = histogram === "wealthBins"
    ? (Number.isFinite(metric.wealthBinSums[index]) ? metric.wealthBinSums[index] : 0)
    : 0;

  const wealthShare = histogram === "wealthBins" && metric.wealthTotal > 0
    ? (wealthSum / metric.wealthTotal) * 100
    : 0;

  const cursorPx = hoverX * w;
  const tooltipWidth = 185;
  tooltip.style.left = `${Math.min(w - tooltipWidth - 4, Math.max(4, cursorPx + 8))}px`;
  tooltip.style.top = "4px";

  tooltip.innerHTML = `
    <div class="tooltip-time">${t(histogram === "wealthBins" ? "wealthDistribution" : "productivityDistribution")}</div>
    <div class="tooltip-row"><span>${t("range")}</span><strong>${formatValue(low)} – ${formatValue(high)}</strong></div>
    <div class="tooltip-row"><span>${t("individuals")}</span><strong>${count} (${((count / Math.max(1, metric.population)) * 100).toFixed(1)} %)</strong></div>
    ${histogram === "wealthBins"
      ? '<div class="tooltip-row"><span>' + t("fortuneSum") + '</span><strong>' + formatValue(wealthSum) + ' (' + wealthShare.toFixed(1) + ' %)</strong></div>'
      : '<div class="tooltip-row"><span>' + t("share") + '</span><strong>' + ((count / Math.max(1, metric.population)) * 100).toFixed(1) + ' %</strong></div>'}
  `;
}
