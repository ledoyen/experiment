/**
 * DISTRIBUTIONS — glossaire
 *
 * The wealth histogram uses logarithmic coordinates so interval widths grow
 * with wealth. This deliberately aggregates the extreme upper tail instead
 * of producing several one-person bins there.
 */

export const MIN_DISTRIBUTION_BINS = 6;
export const MAX_DISTRIBUTION_BINS = 12;

export interface DistributionBins {
  counts: number[];
  sums: number[];
  edges: number[];
}

function finiteNonNegativeValues(values: readonly number[]): number[] {
  return values
    .filter(value => Number.isFinite(value))
    .map(value => Math.max(0, value));
}

export function distributionBinCount(population: number): number {
  if (!Number.isFinite(population) || population <= 0) return MIN_DISTRIBUTION_BINS;
  return Math.min(
    MAX_DISTRIBUTION_BINS,
    Math.max(MIN_DISTRIBUTION_BINS, Math.round(Math.log2(population)))
  );
}

export function exponentialDistributionBins(
  values: readonly number[],
  count = distributionBinCount(values.length)
): DistributionBins {
  const safe = finiteNonNegativeValues(values);
  const bins = Math.max(MIN_DISTRIBUTION_BINS, Math.min(MAX_DISTRIBUTION_BINS, Math.floor(count)));
  const counts = Array(bins).fill(0);
  const sums = Array(bins).fill(0);

  if (safe.length === 0) {
    return { counts, sums, edges: Array(bins + 1).fill(0) };
  }

  const min = Math.min(...safe);
  const max = Math.max(...safe);

  if (min === max) {
    counts[0] = safe.length;
    sums[0] = safe.reduce((sum, value) => sum + value, 0);
    const edges = Array.from({ length: bins + 1 }, () => min);
    edges[edges.length - 1] = max;
    return { counts, sums, edges };
  }

  // Equal-width bins in log1p(value - min) space => exponentially growing
  // intervals in the original wealth space.
  const range = max - min;
  const logRange = Math.log1p(range);
  const edges = Array.from(
    { length: bins + 1 },
    (_, index) => min + Math.expm1(logRange * index / bins)
  );

  for (const value of safe) {
    const normalized = Math.log1p(value - min) / logRange;
    const index = Math.min(bins - 1, Math.max(0, Math.floor(normalized * bins)));
    counts[index]++;
    sums[index] += value;
  }

  edges[0] = min;
  edges[edges.length - 1] = max;
  return { counts, sums, edges };
}

export function linearDistributionBins(
  values: readonly number[],
  count = distributionBinCount(values.length)
): DistributionBins {
  const safe = values.filter(Number.isFinite);
  const bins = Math.max(MIN_DISTRIBUTION_BINS, Math.min(MAX_DISTRIBUTION_BINS, Math.floor(count)));
  const counts = Array(bins).fill(0);
  const sums = Array(bins).fill(0);

  if (safe.length === 0) {
    return { counts, sums, edges: Array(bins + 1).fill(0) };
  }

  const min = Math.min(...safe);
  const max = Math.max(...safe);

  if (min === max) {
    counts[0] = safe.length;
    sums[0] = safe.reduce((sum, value) => sum + value, 0);
    return { counts, sums, edges: Array.from({ length: bins + 1 }, () => min) };
  }

  const width = (max - min) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, index) => min + width * index);

  for (const value of safe) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    counts[index]++;
    sums[index] += value;
  }

  edges[0] = min;
  edges[edges.length - 1] = max;
  return { counts, sums, edges };
}
