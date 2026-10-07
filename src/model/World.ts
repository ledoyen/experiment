import { ACTIVITIES, ACTIVE_WORKER_SHARE, DURABLE_FOOD_GOODS, FOOD_GOODS, INITIAL_PRICE, activityByJob, dailyOutputPerWorker, initialFoodStockPerPerson, rankFoodJobsByNutrientShortage } from "../data/economy";
import { FOOD_NUTRITION, INITIAL_RESERVE_MIN_RATIO, INDIVIDUAL_REQUIREMENT_VARIANCE, NUTRITION, applyNutritionDay, createNutritionReserves, foodToNutrition, isLethalNutritionState, nutritionStatus, nutritionWorkCapacity, updateNutritionDeficitDays, type NutritionId } from "../data/nutrition";
import type { AvailableGood, Good, Human, Job, Metrics, ParameterChangeEvent, Parameters } from "../data/types";
import {
  descendingIntoCritical,
  careerReviewDelayMinutes,
  careerReviewIsUrgent,
  heatingConsumptionForDay,
  heatingPurchaseNeed,
  dailyMaintenanceNeed,
  MAINTENANCE_GOODS,
  priceMultiplier,
  seasonalProductionMultiplier,
  shouldSwitchJob,
  expectedMarginalIncome,
  jobSwitchProbability,
  exponentialDistributionBins,
  linearDistributionBins,
  planFoodDemand,
  decidePurchases,
  MAX_FOOD_PURCHASE_ROUNDS,

  MAX_STORED_FOOD_DAYS_FOR_PRICE
} from "../data/glossary";
import { buildAvailableGoods, decideCheapestPurchases, executePurchase, listForSale } from "./market";

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

export interface WorldOptions {
  recordSnapshots?: boolean;
}

export class World {
  readonly width = 1800;
  readonly height = 1100;
  minute = 0;
  prices: Record<Good, number> = { ...INITIAL_PRICE };
  agents: Human[] = [];
  parameters: Parameters;

  private readonly history: Metrics[] = [];
  private readonly snapshots: Array<{
    minute: number;
    prices: Record<Good, number>;
    agents: Human[];
    monetaryReserve: number;
    parameters: Parameters;
    parameterEvents: ParameterChangeEvent[];
  }> = [];
  private readonly parameterEvents: ParameterChangeEvent[] = [];
  private readonly recordSnapshots: boolean;
  private readonly snapshotWindowMinutes = 60;
  private runInitialParameters: Parameters;
  private moneySupplyTarget = 0;
  private monetaryReserve = 0;

  constructor(parameters: Parameters, options: WorldOptions = {}) {
    this.recordSnapshots = options.recordSnapshots ?? true;
    this.parameters = structuredClone(parameters);
    this.runInitialParameters = structuredClone(parameters);
    this.reset();
  }

  reset() {
    this.minute = 0;
    this.prices = { ...INITIAL_PRICE };
    this.moneySupplyTarget = this.parameters.population * this.parameters.initialMoney;
    this.monetaryReserve = 0;
    this.history.length = 0;
    this.snapshots.length = 0;
    this.parameterEvents.length = 0;
    this.runInitialParameters = structuredClone(this.parameters);

    const referenceCounts = new Map<Job, number>();
    const allocations: Array<{
      job: Job;
      exact: number;
      count: number;
      fraction: number;
    }> = [];

    let assigned = 0;

    for (const activity of ACTIVITIES) {
      if (activity.dormant || activity.annualCapacityPerWorker <= 0) continue;

      const exact =
        this.parameters.population *
        activity.initialWorkerShare /
        Math.max(ACTIVE_WORKER_SHARE, 1);

      const count = Math.floor(exact);
      allocations.push({
        job: activity.job,
        exact,
        count,
        fraction: exact - count
      });
      assigned += count;
    }

    let remaining = Math.max(0, this.parameters.population - assigned);
    allocations.sort((a, b) => b.fraction - a.fraction);

    for (let i = 0; i < allocations.length && remaining > 0; i++, remaining--) {
      allocations[i].count += 1;
    }

    for (const allocation of allocations) {
      referenceCounts.set(allocation.job, allocation.count);
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
      const metabolicFactor =
        1 + (Math.random() * 2 - 1) * INDIVIDUAL_REQUIREMENT_VARIANCE;
      return {
        id,
        x: this.width / 2 + Math.cos(angle) * radius,
        y: this.height / 2 + Math.sin(angle) * radius,
        job,
        productivity: this.randomProductivity(),
        money: this.parameters.initialMoney,
        sex: id % 2 === 0 ? "male" : "female",
        state: "normal",
        metabolicFactor,
        nutritionDeficitDays: {},
        reserves: createNutritionReserves(
          id % 2 === 0 ? "male" : "female",
          "normal",
          INITIAL_RESERVE_MIN_RATIO + Math.random() * (1 - INITIAL_RESERVE_MIN_RATIO),
          metabolicFactor
        ),
        inventory: Object.fromEntries(
          DURABLE_FOOD_GOODS.map(good => [good, initialFoodStockPerPerson(good)])
        ),
        forSale: {},
        askPrices: {},
        events: [],
        nextJobReviewMinute: careerReviewDelayMinutes(Math.random())
      };
    });

    this.capture();
  }

  setParameters(patch: Partial<Parameters>) {
    const next = { ...this.parameters, ...patch };

    for (const parameter of Object.keys(patch) as Array<keyof Parameters>) {
      const previousValue = this.parameters[parameter];
      const newValue = next[parameter];
      if (Object.is(previousValue, newValue)) continue;

      this.parameterEvents.push({
        minute: this.minute,
        parameter,
        previousValue,
        newValue
      });

      if (
        parameter === "moneyEnabled" &&
        previousValue === false &&
        newValue === true
      ) {
        this.exposeExistingInventoryToMarket();
      }
    }

    this.parameters = next;
  }

  private exposeExistingInventoryToMarket() {
    // Introducing money must not make pre-existing physical stocks
    // inaccessible. Every Human may therefore expose their currently owned
    // inventory; their own daily consumption will reduce both inventory and
    // listed quantity before the market clears.
    for (const human of this.agents) {
      for (const good of Object.keys(human.inventory) as Good[]) {
        const stock = Math.max(0, human.inventory[good] ?? 0);
        if (stock <= 1e-12) continue;

        listForSale(
          human,
          good,
          stock,
          this.prices[good]
        );
      }
    }
  }

  step(minutes = 1, captureInterval = 10) {
    const duration = Math.max(0, Math.floor(minutes));
    if (duration <= 0) return;

    const nextCapture = Math.floor(this.minute / captureInterval) * captureInterval + captureInterval;
    const crossesCapture = this.minute + duration >= nextCapture;
    this.advanceChunk(duration);

    if (crossesCapture) this.capture();
  }

  rewind(minutes = 60) {
    const target = Math.max(0, this.minute - minutes);
    const snapshot = [...this.snapshots].reverse().find(item => item.minute <= target);
    if (!snapshot) return;
    this.minute = snapshot.minute;
    this.prices = { ...snapshot.prices };
    this.agents = structuredClone(snapshot.agents);
    this.monetaryReserve = snapshot.monetaryReserve;
    this.parameters = structuredClone(snapshot.parameters);
    this.parameterEvents.splice(
      0,
      this.parameterEvents.length,
      ...structuredClone(snapshot.parameterEvents)
    );
    while (this.history.length && this.history[this.history.length - 1].minute > this.minute) this.history.pop();
  }

  getMetrics(): Metrics {
    const wealth = this.agents.map(agent => Number.isFinite(agent.money) ? Math.max(0, agent.money) : 0);
    const productivity = this.agents.map(agent => Number.isFinite(agent.productivity) ? Math.max(0, agent.productivity) : 0);
    const wealthDistribution = exponentialDistributionBins(wealth);
    const productivityDistribution = linearDistributionBins(productivity);
    const wealthTotal = wealth.reduce((sum, value) => sum + value, 0);
    const jobCounts = this.getJobCounts();
    const stocks = this.getStockTotals();
    const physiologicalReserveRatio = this.getAveragePhysiologicalReserveRatio();
    const zeroMoney = this.agents.filter(agent => agent.money <= 1e-9);
    const zeroMoneyWithFood = zeroMoney.filter(agent =>
      FOOD_GOODS.some(good => (agent.inventory[good] ?? 0) > 1e-9)
    );
    const physicalWealth = this.agents.reduce((sum, agent) =>
      sum + Object.values(agent.inventory).reduce((total, quantity) => total + Math.max(0, quantity ?? 0), 0), 0
    );

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
      stocks,
      wealthBins: wealthDistribution.counts,
      wealthBinSums: wealthDistribution.sums,
      wealthBinEdges: wealthDistribution.edges,
      wealthTotal,
      wealthMin: wealth.length ? Math.min(...wealth) : 0,
      wealthMax: wealth.length ? Math.max(...wealth) : 0,
      zeroMoneyCount: zeroMoney.length,
      zeroMoneyWithFoodCount: zeroMoneyWithFood.length,
      zeroMoneyWithoutFoodCount: zeroMoney.length - zeroMoneyWithFood.length,
      physiologicalReserveRatio,
      physicalWealth,
      productivityBins: productivityDistribution.counts,
      productivityBinSums: productivityDistribution.sums,
      productivityBinEdges: productivityDistribution.edges,
      productivityMin: productivity.length ? Math.min(...productivity) : 0,
      productivityMax: productivity.length ? Math.max(...productivity) : 0,
      jobCounts
    };
  }

  private getAveragePhysiologicalReserveRatio(): number {
    if (!this.agents.length) return 0;
    let total = 0;
    for (const agent of this.agents) {
      for (const nutrient of NUTRITION) {
        const reserve = agent.reserves[nutrient.id];
        total += reserve.max > 0 ? reserve.value / reserve.max : 0;
      }
    }
    return total / (this.agents.length * NUTRITION.length);
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

  getAgentEvents(agentId: number) {
    return [...(this.agents.find(agent => agent.id === agentId)?.events ?? [])];
  }

  getParameterEvents() {
    return structuredClone(this.parameterEvents);
  }

  getInitialParameters() {
    return structuredClone(this.runInitialParameters);
  }

  getJobCounts(): Record<Job, number> {
    const counts = {} as Record<Job, number>;
    for (const activity of ACTIVITIES) counts[activity.job] = 0;
    counts.idle = 0;
    for (const agent of this.agents) counts[agent.job]++;
    return counts;
  }

  getStockTotals(): Record<Good, number> {
    const stocks = {} as Record<Good, number>;
    for (const good of Object.keys(this.prices) as Good[]) {
      stocks[good] = 0;
    }

    for (const agent of this.agents) {
      for (const good of Object.keys(this.prices) as Good[]) {
        stocks[good] += Math.max(0, agent.inventory[good] ?? 0);
      }
    }

    return stocks;
  }

  color(job: Job) { return jobColors[job]; }

  getAgentAtWorldPosition(x: number, y: number, radius: number): Human | null {
    const radiusSquared = radius * radius;
    let nearest: Human | null = null;
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
    if (this.history.length > 5000) this.compactHistory();
    if (!this.recordSnapshots) return;
    this.snapshots.push({
      minute: this.minute,
      prices: { ...this.prices },
      agents: structuredClone(this.agents),
      monetaryReserve: this.monetaryReserve,
      parameters: structuredClone(this.parameters),
      parameterEvents: structuredClone(this.parameterEvents)
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
    const cutoff = this.minute - this.snapshotWindowMinutes;
    while (this.snapshots.length > 1 && this.snapshots[1].minute < cutoff) {
      this.snapshots.shift();
    }
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
        agent.inventory.chauffage = Math.max(
          0,
          (agent.inventory.chauffage ?? 0) - heatingConsumption
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
        dailyOutputPerWorker(activity) *
        agent.productivity *
        nutritionWorkCapacity(agent.reserves, agent.sex, agent.state, agent.metabolicFactor) *
        seasonalProductionMultiplier(activity.job, simulationDay);

      if (!Number.isFinite(production) || production <= 0) continue;

      const good = activity.output;
      agent.inventory[good] = (agent.inventory[good] ?? 0) + production;

      const existingAsk = agent.askPrices[good];
      listForSale(
        agent,
        good,
        production,
        Number.isFinite(existingAsk) && existingAsk! > 0
          ? existingAsk!
          : this.prices[good]
      );
    }
  }

  private inventoryTotal(good: Good): number {
    return this.agents.reduce(
      (sum, agent) => sum + Math.max(0, agent.inventory[good] ?? 0),
      0
    );
  }

  private consumeStoredFood(agent: Human, simulationDay: number) {
    const equalPrices = Object.fromEntries(
      FOOD_GOODS.map(good => [good, 1])
    ) as Partial<Record<Good, number>>;

    const ownedFood = Object.fromEntries(
      FOOD_GOODS.map(good => [
        good,
        Math.max(0, agent.inventory[good] ?? 0)
      ])
    ) as Partial<Record<Good, number>>;

    const quantities = planFoodDemand(
      agent.reserves,
      agent.sex,
      agent.state,
      Number.POSITIVE_INFINITY,
      equalPrices,
      ownedFood,
      agent.metabolicFactor
    );

    const intake = {} as Partial<Record<NutritionId, number>>;
    for (const nutrient of NUTRITION) intake[nutrient.id] = 0;

    for (const good of FOOD_GOODS) {
      const quantity = quantities[good] ?? 0;
      if (quantity <= 0) continue;

      const food = FOOD_NUTRITION[good];
      if (!food) continue;

      const contribution = foodToNutrition(food, quantity, good);
      for (const nutrient of NUTRITION) {
        intake[nutrient.id] =
          (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
      }

      agent.inventory[good] = Math.max(
        0,
        (agent.inventory[good] ?? 0) - quantity
      );

      // Consumed stock can no longer remain listed for sale.
      agent.forSale[good] = Math.max(
        0,
        (agent.forSale[good] ?? 0) - quantity
      );
    }

    if (Object.values(intake).every(value => (value ?? 0) <= 0)) return;

    const previousReserves = agent.reserves;
    agent.reserves = applyNutritionDay(
      agent.reserves,
      intake,
      agent.sex,
      agent.state,
      agent.metabolicFactor
    );

    const critical = descendingIntoCritical(
      previousReserves,
      agent.reserves
    );
    if (critical) {
      agent.events.push({
        minute: simulationDay * 1440,
        type: "healthCritical",
        nutrient: critical.nutrient,
        ratio: critical.ratio
      });
    }
  }

  private processMarketDay(simulationDay: number) {
    for (const agent of this.agents) {
      this.consumeStoredFood(agent, simulationDay);
    }

    const prices = { ...this.prices };

    // The market is a list of individual offers. The same good may therefore
    // exist several times at different prices and with different sellers.
    const offers = buildAvailableGoods(this.agents, prices);
    const agentsById = new Map(this.agents.map(agent => [agent.id, agent]));
    const offersByKey = new Map(
      offers.map(offer => [offer.name + ":" + offer.sellerId + ":" + offer.price, offer])
    );

    const offeredStock = {} as Record<Good, number>;
    for (const offer of offers) {
      offeredStock[offer.name] =
        (offeredStock[offer.name] ?? 0) + offer.stock;
    }

    const latentFoodDemand = {} as Record<Good, number>;
    for (const good of FOOD_GOODS) latentFoodDemand[good] = 0;

    for (const agent of this.agents) {
      const latent = planFoodDemand(
        agent.reserves,
        agent.sex,
        agent.state,
        agent.money,
        prices,
        undefined,
        agent.metabolicFactor
      );

      for (const good of FOOD_GOODS) {
        latentFoodDemand[good] =
          (latentFoodDemand[good] ?? 0) + (latent[good] ?? 0);
      }
    }

    // Food is cleared in rounds. Buyers submit requests against individual
    // offers, then an oversubscribed offer is rationed proportionally rather
    // than being exhausted by whichever Human happened to be processed first.
    const buyers = [...this.agents].sort(() => Math.random() - 0.5);
    const tradeVolume = {} as Record<Good, number>;
    const tradeValue = {} as Record<Good, number>;

    const purchasedIntake = new Map<number, Partial<Record<NutritionId, number>>>();

    const recordPurchasedFood = (
      human: Human,
      good: Good,
      quantity: number
    ) => {
      if (quantity <= 0) return;
      const food = FOOD_NUTRITION[good];
      if (!food) return;

      const intake = purchasedIntake.get(human.id) ??
        ({} as Partial<Record<NutritionId, number>>);
      const contribution = foodToNutrition(food, quantity, good);

      for (const nutrient of NUTRITION) {
        intake[nutrient.id] =
          (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
      }

      purchasedIntake.set(human.id, intake);
    };

    const applyPurchasedNutrition = () => {
      for (const buyer of this.agents) {
        const intake = purchasedIntake.get(buyer.id);
        if (!intake) continue;

        const previousReserves = buyer.reserves;
        buyer.reserves = applyNutritionDay(
          buyer.reserves,
          intake,
          buyer.sex,
          buyer.state,
          buyer.metabolicFactor
        );

        const critical = descendingIntoCritical(
          previousReserves,
          buyer.reserves
        );
        if (critical) {
          buyer.events.push({
            minute: simulationDay * 1440,
            type: "healthCritical",
            nutrient: critical.nutrient,
            ratio: critical.ratio
          });
        }
      }
    };

    for (let round = 0; round < MAX_FOOD_PURCHASE_ROUNDS; round++) {
      const requestsByHuman = new Map<
        number,
        ReturnType<typeof decidePurchases>
      >();
      const requestsByOffer = new Map<AvailableGood, Array<{
        human: Human;
        decision: ReturnType<typeof decidePurchases>[number];
      }>>();

      let anyRequest = false;

      for (const buyer of buyers) {
        const decisions = decidePurchases(buyer, offers);
        if (decisions.length > 0) anyRequest = true;
        requestsByHuman.set(buyer.id, decisions);

        for (const decision of decisions) {
          const offer = offersByKey.get(
            decision.name + ":" + decision.sellerId + ":" + decision.price
          );
          if (!offer) continue;

          const requests = requestsByOffer.get(offer) ?? [];
          requests.push({ human: buyer, decision });
          requestsByOffer.set(offer, requests);
        }
      }

      if (!anyRequest) break;

      let anyTrade = false;

      for (const [offer, requests] of requestsByOffer) {
        const totalRequested = requests.reduce(
          (sum, item) => sum + item.decision.quantity,
          0
        );
        if (totalRequested <= 1e-12 || offer.stock <= 1e-12) continue;

        const rationing = Math.min(1, offer.stock / totalRequested);

        for (const request of requests) {
          const seller = agentsById.get(offer.sellerId);
          if (!seller) continue;

          const executed = executePurchase(
            request.human,
            seller,
            offer,
            request.decision.quantity * rationing
          );

          if (executed <= 0) continue;

          anyTrade = true;
          tradeVolume[offer.name] =
            (tradeVolume[offer.name] ?? 0) + executed;
          tradeValue[offer.name] =
            (tradeValue[offer.name] ?? 0) +
            executed * offer.price;

          recordPurchasedFood(
            request.human,
            offer.name,
            executed
          );
        }
      }

      if (!anyTrade) break;
    }

    applyPurchasedNutrition();

    // Heating has a physical stock target and is bought from the cheapest
    // individual offers after food has been settled.
    for (const buyer of buyers) {
      const desiredHeating = heatingPurchaseNeed(
        simulationDay,
        buyer.inventory.chauffage ?? 0
      );

      if (desiredHeating <= 0) continue;

      const heatingDecisions = decideCheapestPurchases(
        buyer,
        offers,
        "chauffage",
        desiredHeating
      );

      for (const decision of heatingDecisions) {
        const seller = agentsById.get(decision.sellerId);
        const offer = offersByKey.get(
          decision.name + ":" + decision.sellerId + ":" + decision.price
        );

        if (!seller || !offer) continue;

        const executed = executePurchase(
          buyer,
          seller,
          offer,
          decision.quantity
        );

        if (executed <= 0) continue;

        tradeVolume[decision.name] =
          (tradeVolume[decision.name] ?? 0) + executed;
        tradeValue[decision.name] =
          (tradeValue[decision.name] ?? 0) +
          executed * decision.price;
      }

      for (const good of MAINTENANCE_GOODS) {
        const decisions = decideCheapestPurchases(
          buyer,
          offers,
          good,
          dailyMaintenanceNeed(good)
        );

        for (const decision of decisions) {
          const seller = this.agents.find(
            human => human.id === decision.sellerId
          );
          const offer = offers.find(
            candidate =>
              candidate.name === decision.name &&
              candidate.sellerId === decision.sellerId &&
              Math.abs(candidate.price - decision.price) < 1e-12
          );

          if (!seller || !offer) continue;

          const executed = executePurchase(
            buyer,
            seller,
            offer,
            decision.quantity
          );

          if (executed <= 0) continue;

          tradeVolume[decision.name] =
            (tradeVolume[decision.name] ?? 0) + executed;
          tradeValue[decision.name] =
            (tradeValue[decision.name] ?? 0) +
            executed * decision.price;
        }
      }
    }

    // Price is a reference price, changed at most once per simulation day.
    // Actual transactions use the seller's own asking price.
    for (const good of [
      ...FOOD_GOODS,
      "chauffage" as Good,
      ...MAINTENANCE_GOODS
    ]) {
      const demand =
        good === "chauffage"
          ? this.agents.reduce(
              (sum, agent) =>
                sum +
                heatingPurchaseNeed(
                  simulationDay,
                  agent.inventory.chauffage ?? 0
                ),
              0
            )
          : MAINTENANCE_GOODS.includes(good as "vetement" | "outil")
            ? dailyMaintenanceNeed(good as "vetement" | "outil") *
              this.agents.length
            : latentFoodDemand[good] ?? 0;

      const supply = offeredStock[good] ?? 0;
      if (demand <= 0 && supply <= 0) continue;

      this.prices[good] = priceMultiplier(
        this.prices[good],
        demand,
        supply,
        this.parameters.priceSensitivity
      );
    }

    // Professional mobility uses today's scarcity and actual sale prices.
    const dailyDemand = { ...latentFoodDemand } as Record<Good, number>;
    dailyDemand.chauffage = this.agents.reduce(
      (sum, agent) => sum + heatingPurchaseNeed(
        simulationDay,
        agent.inventory.chauffage ?? 0
      ),
      0
    );
    for (const good of MAINTENANCE_GOODS) {
      dailyDemand[good] = dailyMaintenanceNeed(good) * this.agents.length;
    }

    const expectedIncome = (agent: Human, job: Job) => {
      const activity = activityByJob(job);
      if (!activity || activity.dormant) return 0;

      const output =
        dailyOutputPerWorker(activity) *
        agent.productivity *
        seasonalProductionMultiplier(activity.job, simulationDay);

      const good = activity.output;
      const demand = dailyDemand[good] ?? 0;

      const currentSupply = offeredStock[good] ?? 0;
      const transactionPrice =
        tradeVolume[good] > 0
          ? tradeValue[good] / tradeVolume[good]
          : this.prices[good];

      return expectedMarginalIncome(
        demand,
        currentSupply,
        output,
        transactionPrice
      );
    };

    const currentMinute = simulationDay * 1440;

    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const plannedFoodSpend = FOOD_GOODS.reduce(
        (sum, good) =>
          sum + (latentFoodDemand[good] / Math.max(1, this.agents.length)) *
            prices[good],
        0
      );
      const energyReserve = agent.reserves.energy;
      const energyRatio =
        energyReserve.max > 0 ? energyReserve.value / energyReserve.max : 0;
      const urgentReview = careerReviewIsUrgent(
        agent.money,
        plannedFoodSpend,
        energyRatio
      ) || nutritionStatus(agent.nutritionDeficitDays).level === "deficient";

      if (currentMinute < agent.nextJobReviewMinute && !urgentReview) continue;

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
        Math.random() < jobSwitchProbability(
          current,
          best,
          this.parameters.mobility
        )
      ) {
        const previousJob = agent.job;
        const previousIncome = current;
        agent.job = bestJob;
        agent.events.push({
          minute: currentMinute,
          type: "jobChange",
          previousJob,
          newJob: bestJob,
          previousIncome,
          expectedIncome: best
        });
      }

      agent.nextJobReviewMinute =
        currentMinute + careerReviewDelayMinutes(Math.random());
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
  private reallocateCollectiveFoodWork(plans: Array<Partial<Record<Good, number>>>) {
    const demand = {} as Partial<Record<NutritionId, number>>;
    const stock = {} as Partial<Record<NutritionId, number>>;

    for (const plan of plans) {
      for (const good of FOOD_GOODS) {
        const quantity = plan[good] ?? 0;
        const food = FOOD_NUTRITION[good];
        if (!food || quantity <= 0) continue;
        const nutrients = foodToNutrition(food, quantity, good);
        for (const nutrient of NUTRITION) {
          demand[nutrient.id] = (demand[nutrient.id] ?? 0) + (nutrients[nutrient.id] ?? 0);
        }
      }
    }

    for (const agent of this.agents) {
      for (const good of FOOD_GOODS) {
        const quantity = agent.inventory[good] ?? 0;
        const food = FOOD_NUTRITION[good];
        if (!food || quantity <= 0) continue;
        const nutrients = foodToNutrition(food, quantity, good);
        for (const nutrient of NUTRITION) {
          stock[nutrient.id] = (stock[nutrient.id] ?? 0) + (nutrients[nutrient.id] ?? 0);
        }
      }
    }

    const candidates = this.agents.filter(agent =>
      !FOOD_GOODS.includes(activityByJob(agent.job)?.output ?? ("logement" as Good))
    );
    const rankedJobs = rankFoodJobsByNutrientShortage(demand, stock, candidates.length);
    for (let index = 0; index < rankedJobs.length; index++) {
      candidates[index].job = rankedJobs[index];
    }
  }

  private processCollectiveNutritionDay() {
    // Before money, allocation is still constrained by the same real stocks,
    // but there is no price or monetary budget: people take food according to
    // their current physiological needs.
    const equalPrices = Object.fromEntries(
      FOOD_GOODS.map(good => [good, 1])
    ) as Partial<Record<Good, number>>;
    const plans = this.agents.map(agent =>
      planFoodDemand(
        agent.reserves,
        agent.sex,
        agent.state,
        Number.MAX_SAFE_INTEGER,
        equalPrices,
        undefined,
        agent.metabolicFactor
      )
    );

    // Without money, scarce labour is redirected toward food when physical
    // stocks cannot cover physiological demand. The 67% ceiling is historical,
    // not a calibration coefficient: France had 67% of its population living
    // from agriculture in 1789. Source: https://www.bnsp.insee.fr/ark:/12148/bc6p06zm18h/f1.pdf
    this.reallocateCollectiveFoodWork(plans);

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

        const contribution = foodToNutrition(food, quantity, good);
        for (const nutrient of NUTRITION) {
          intake[nutrient.id] =
            (intake[nutrient.id] ?? 0) + (contribution[nutrient.id] ?? 0);
        }

        // In a non-monetary world, remove the consumed quantity from the
        // owners' stocks proportionally after the allocation below.
      }

      const previousNutrition = agent.reserves;
      agent.reserves = applyNutritionDay(
        previousNutrition,
        intake,
        agent.sex,
        agent.state,
        agent.metabolicFactor
      );

      const critical = descendingIntoCritical(
        previousNutrition,
        agent.reserves
      );
      if (critical) {
        agent.events.push({
          minute: this.minute,
          type: "healthCritical",
          nutrient: critical.nutrient,
          ratio: critical.ratio
        });
      }
    }

    for (const agent of this.agents) {
      agent.nutritionDeficitDays = updateNutritionDeficitDays(
        agent.reserves,
        agent.nutritionDeficitDays
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
    const survivors: Human[] = [];

    for (const agent of this.agents) {
      if (isLethalNutritionState(agent.reserves, agent.nutritionDeficitDays)) {
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