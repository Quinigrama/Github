import { percentile } from './orderStatistics';

/**
 * Excluye categorías cuyo valor numérico subyacente cae fuera del percentil [pLow, pHigh]
 * calculado sobre TODO el histórico disponible (sin ventana de recencia).
 * Ejemplo: para par/impar, el valor subyacente es "número de pares" (0..n).
 */
export function orderedPercentileExclusion(
  historicalValues: number[],
  allCategoryValues: number[],
  pLow: number = 0.05,
  pHigh: number = 0.95
): { excludedValues: number[]; p5: number; p95: number } {
  if (historicalValues.length < 10) {
    return { excludedValues: [], p5: Math.min(...allCategoryValues), p95: Math.max(...allCategoryValues) };
  }
  const sorted = [...historicalValues].sort((a, b) => a - b);
  const p5 = percentile(sorted, pLow);
  const p95 = percentile(sorted, pHigh);
  const excludedValues = allCategoryValues.filter(v => v < p5 || v > p95);
  return { excludedValues, p5, p95 };
}

/**
 * Dado un conjunto de frecuencias de categorías nominales (p.ej. agrupaciones o consecutivos)
 * y una masa de cobertura objetivo (p.ej. 0.90, 0.95, 1.0), devuelve las categorías que
 * están activas (las de mayor frecuencia acumulada hasta alcanzar esa masa).
 */
export function nominalActivationSet(
  categoryCounts: Record<string, number>,
  targetMass: number = 0.90
): Set<string> {
  const entries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  if (total === 0 || targetMass >= 1.0) {
    return new Set(entries.map(([k]) => k));
  }
  const active = new Set<string>();
  let cumulative = 0;
  for (const [key, count] of entries) {
    active.add(key);
    cumulative += count;
    if (cumulative / total >= targetMass) {
      break;
    }
  }
  return active;
}
