# Contribution rules for the simulation

This project must remain understandable to a contributor who knows economics but little code.

## Core rule

All values that define simulation rules (defaults, ratios, coefficients, thresholds, reference prices, durations, needs, calibrations, etc.) must live in `src/data/`.

Pure calculation functions that use those values and do not depend on mutable world state must also live in `src/data/`:
- same inputs -> same result;
- no access to or mutation of `World`, the DOM, the clock, randomness, or mutable global state;
- no side effects.

## Readability

Every rule value or non-obvious rule function must be:
- simple;
- clearly named;
- accompanied by an English comment explaining why the value or rule exists and linking to an external source or reference; obvious pure functions do not need a source;
- expressed in the model's units.

Rule functions in `src/data/` must stay short: **20 lines maximum**. Split longer rules into several named functions.

The code in `src/model/` orchestrates the simulation; it must not hide economic or physiological rules.

The goal is that an economist can open `src/data/`, understand the assumptions, and change a rule without understanding the whole technical architecture.

## Language

All committed code, comments, documentation, configuration text, workflow text, and other repository text must be written in **English**. External source links may point to sources written in other languages.

## CI requirement

**Every commit must leave the repository with a passing CI.**

Before creating a commit:
1. run the relevant checks locally when possible;
2. inspect the result, do not assume it passes;
3. after a sequence of commits, verify the GitHub Actions run for the resulting commit;
4. never knowingly leave `main` with a failing build or test.

For simulation research, use the CLI simulation workflow and its CSV artifacts to iterate. Do not add temporary diagnostic code just to inspect a run.

## CLI simulation and GitHub Actions

The CLI simulation uses **exactly the same `World` as the graphical interface**. It is not a second model: it creates a `World` with the initial parameters, advances one day at a time as fast as possible, and exports the analytical history as CSV.

Local command:

```bash
npm run simulate -- \
  --population 200 \
  --initial-money 100 \
  --money-enabled false \
  --mobility 0.2 \
  --price-sensitivity 0.15 \
  --productivity-variance 0.2 \
  --money-introduction-day "" \
  --duration-days 365 \
  --output simulation.csv
```

The six initial parameters correspond to the values in `defaultParameters()` in `src/data/defaults.ts`. The GitHub workflow intentionally repeats these defaults in its inputs: **when simulation defaults change, update the workflow defaults too**.

Leave `money-introduction-day` empty for a simulation without money. Set it to a day such as `178` to introduce money at the beginning of that day. `money-enabled=true` means that money is active from the beginning and must not be combined with an introduction date.

The workflow `.github/workflows/run-simulation.yml` can be run manually with **Run workflow**. It exposes all initial parameters, the duration, and the money introduction day. Speed is not an input: the CLI advances directly day by day without graphical rendering. At the end, `simulation.csv` contains aggregate history and `simulation-final-agents.csv` contains the final state of every individual, including stocks, physiological reserves, and deficiency counters. Both files are stored in the same GitHub Actions artifact.

## Issue-triggered simulations

The workflow `.github/workflows/run-simulation.yml` can also run when an issue is created or edited. To prevent ordinary issues from launching simulations, this mode is accepted only when the issue author is **`ledoyen`**.

The issue body must be **exactly one JSON object** containing these eight parameters and no extra field:

```json
{
  "population": 200,
  "initial_money": 100,
  "money_enabled": false,
  "mobility": 0.2,
  "price_sensitivity": 0.15,
  "productivity_variance": 0.2,
  "money_introduction_day": null,
  "duration_days": 1000
}
```

`money_introduction_day: null` means no introduction. The workflow validates the structure and types before starting the simulation. To rerun an experiment, edit the same issue: the `edited` event starts the workflow again.

## Simulation model discipline

Do not add an arbitrary coefficient merely to make a population survive.

When a simulation fails to reach a stable population, first identify the physical or physiological cause in the generated CSV and correct it with:
- a sourced value;
- a sourced relationship;
- a pure rule derived directly from the model's units;
- or a missing mechanism that is required to represent the intended economic system.

All such changes must remain understandable in `src/data/` and must include an English source comment unless the rule is mathematically obvious.
