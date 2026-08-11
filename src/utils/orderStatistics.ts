/**
 * Order Statistics utility functions for optimal position range calculation.
 * 
 * Mathematical Foundations:
 * Given a game drawing n numbers without replacement from 1...N, ordered X_1 < X_2 < ... < X_n:
 * 
 * 1. Theoretical Expected Value (Mean):
 *    E[X_k] = k * (N + 1) / (n + 1)
 * 
 * 2. Theoretical Variance:
 *    Var(X_k) = k * (n - k + 1) * (N + 1) * (N - n) / [ (n + 1)^2 * (n + 2) ]
 * 
 * 3. Theoretical Range at confidence level z (default z = 1.645 for 90% confidence interval):
 *    rango_teorico_min = E[X_k] - z * sqrt(Var(X_k))
 *    rango_teorico_max = E[X_k] + z * sqrt(Var(X_k))
 * 
 * 4. Empirical Range (5th and 95th percentiles of historical draws at position k).
 *    Omitted if fewer than 10 historical draws are available.
 * 
 * 5. Final Range (Blend):
 *    rango_final_min = round((rango_teorico_min + rango_empirico_min) / 2)
 *    rango_final_max = round((rango_teorico_max + rango_empirico_max) / 2)
 *    Bounded to [1, N].
 */

/**
 * Calculates theoretical expected value E[X_k] for the k-th order statistic.
 * Formula: E[X_k] = k * (N + 1) / (n + 1)
 */
export function theoreticalMean(N: number, n: number, k: number): number {
  if (n <= 0 || k < 1 || k > n || N < n) return 0;
  return (k * (N + 1)) / (n + 1);
}

/**
 * Calculates theoretical variance Var(X_k) for the k-th order statistic.
 * Formula: Var(X_k) = k * (n - k + 1) * (N + 1) * (N - n) / [ (n + 1)^2 * (n + 2) ]
 */
export function theoreticalVariance(N: number, n: number, k: number): number {
  if (n <= 0 || k < 1 || k > n || N < n) return 0;
  const numerator = k * (n - k + 1) * (N + 1) * (N - n);
  const denominator = Math.pow(n + 1, 2) * (n + 2);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculates theoretical range [min, max] at confidence level z (default z = 1.645 for 90%).
 */
export function theoreticalRange(
  N: number,
  n: number,
  k: number,
  z: number = 1.645
): { min: number; max: number } {
  const mean = theoreticalMean(N, n, k);
  const variance = theoreticalVariance(N, n, k);
  const stdDev = Math.sqrt(Math.max(0, variance));

  const min = Math.max(1, mean - z * stdDev);
  const max = Math.min(N, mean + z * stdDev);

  return { min, max };
}

/**
 * Calculates empirical range (5th and 95th percentiles) from historical draws at position k (1-indexed).
 * Returns null if fewer than 10 historical draws are available.
 */
export function empiricalRange(
  historicalDraws: number[][],
  k: number
): { min: number; max: number } | null {
  if (!historicalDraws || historicalDraws.length < 10) {
    return null;
  }

  const values: number[] = [];
  for (const draw of historicalDraws) {
    if (draw && draw.length >= k) {
      const sorted = [...draw].sort((a, b) => a - b);
      const val = sorted[k - 1];
      if (typeof val === 'number' && !isNaN(val)) {
        values.push(val);
      }
    }
  }

  if (values.length < 10) {
    return null;
  }

  values.sort((a, b) => a - b);
  const M = values.length;

  const getPercentile = (p: number): number => {
    const idx = p * (M - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    if (lower === upper) return values[lower];
    return values[lower] * (1 - weight) + values[upper] * weight;
  };

  const min = getPercentile(0.05);
  const max = getPercentile(0.95);

  return { min, max };
}

/**
 * Computes final position range as a blend of theoretical and empirical ranges.
 * If historical draws < 10, uses theoretical range only and sets usedHistorical = false.
 * Otherwise, averages theoretical and empirical ranges and rounds to integer, bounded to [1, N].
 */
export function finalPositionRange(
  N: number,
  n: number,
  k: number,
  historicalDraws: number[][],
  z: number = 1.645
): {
  min: number;
  max: number;
  usedHistorical: boolean;
} {
  const th = theoreticalRange(N, n, k, z);
  const emp = empiricalRange(historicalDraws, k);

  if (!emp) {
    const min = Math.max(1, Math.min(N, Math.round(th.min)));
    const max = Math.max(min, Math.min(N, Math.round(th.max)));
    return { min, max, usedHistorical: false };
  }

  const blendedMin = (th.min + emp.min) / 2;
  const blendedMax = (th.max + emp.max) / 2;

  const min = Math.max(1, Math.min(N, Math.round(blendedMin)));
  const max = Math.max(min, Math.min(N, Math.round(blendedMax)));

  return { min, max, usedHistorical: true };
}

/**
 * Calculates final optimal ranges for all positions 1...n.
 */
export function calculateAllPositionRanges(
  N: number,
  n: number,
  historicalDraws: number[][],
  z: number = 1.645
): { position: number; min: number; max: number; usedHistorical: boolean }[] {
  const ranges: { position: number; min: number; max: number; usedHistorical: boolean }[] = [];
  for (let k = 1; k <= n; k++) {
    const res = finalPositionRange(N, n, k, historicalDraws, z);
    ranges.push({
      position: k,
      min: res.min,
      max: res.max,
      usedHistorical: res.usedHistorical,
    });
  }
  return ranges;
}
