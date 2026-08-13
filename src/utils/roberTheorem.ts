import { percentile } from './orderStatistics';

export function binomialTailProbability(k: number, n: number, p: number): number {
  if (k > n) return 0;
  if (k <= 0) return 1;
  const logChoose = (n: number, k: number): number => {
    let result = 0;
    for (let i = 0; i < k; i++) {
      result += Math.log(n - i) - Math.log(i + 1);
    }
    return result;
  };
  let tail = 0;
  for (let j = k; j <= n; j++) {
    const logProb = logChoose(n, j) + j * Math.log(p) + (n - j) * Math.log(1 - p);
    tail += Math.exp(logProb);
  }
  return Math.min(1, tail);
}

export function findCriticalK(n: number, p: number, alpha: number): number {
  for (let k = 0; k <= n; k++) {
    if (binomialTailProbability(k, n, p) <= alpha) return k;
  }
  return n + 1;
}

export function layer1Threshold(nLarga: number, p: number, alpha: number = 0.10): number {
  const zAlpha = 1.2816;
  const lambda = nLarga * p;
  const sigma = Math.sqrt(nLarga * p * (1 - p));
  return Math.ceil(lambda + zAlpha * sigma);
}

export interface RoberResult {
  excluded: number[];
  excludedLayer1: number[];
  excludedLayer2: number[];
  kStar: number;
  layer1Cutoff: number;
  p: number;
  lambda: number;
  nLarga: number;
  nCorta: number;
}

export function getRoberExclusions(
  historicalData: any[],
  universeSize: number,
  drawSize: number,
  nLarga: number,
  nCorta: number,
  extractElements: (draw: any) => number[],
  alpha: number = 0.10
): RoberResult {
  const p = drawSize / universeSize;
  const effectiveNLarga = Math.min(nLarga, historicalData.length);
  const effectiveNCorta = Math.min(nCorta, historicalData.length);
  const sampleL = historicalData.slice(-effectiveNLarga);
  const sampleC = historicalData.slice(-effectiveNCorta);

  const countsL: Record<number, number> = {};
  sampleL.forEach(d => extractElements(d).forEach(el => { countsL[el] = (countsL[el] || 0) + 1; }));
  const countsC: Record<number, number> = {};
  sampleC.forEach(d => extractElements(d).forEach(el => { countsC[el] = (countsC[el] || 0) + 1; }));

  const layer1Cutoff = layer1Threshold(effectiveNLarga, p, alpha);
  const kStar = findCriticalK(effectiveNCorta, p, alpha);

  const excludedLayer1: number[] = [];
  const excludedLayer2: number[] = [];
  Object.entries(countsL).forEach(([el, count]) => { if (count >= layer1Cutoff) excludedLayer1.push(Number(el)); });
  Object.entries(countsC).forEach(([el, count]) => { if (count >= kStar) excludedLayer2.push(Number(el)); });

  const excluded = Array.from(new Set([...excludedLayer1, ...excludedLayer2])).sort((a, b) => a - b);

  return {
    excluded, excludedLayer1, excludedLayer2, kStar, layer1Cutoff,
    p, lambda: effectiveNLarga * p, nLarga: effectiveNLarga, nCorta: effectiveNCorta
  };
}

export function hypergeometricPMF(M: number, K: number, m: number, j: number): number {
  if (j > K || (m - j) > (M - K) || j < 0 || (m - j) < 0) return 0;
  const logComb = (n: number, r: number): number => {
    if (r < 0 || r > n) return -Infinity;
    let result = 0;
    for (let i = 0; i < r; i++) result += Math.log(n - i) - Math.log(i + 1);
    return result;
  };
  const logP = logComb(K, j) + logComb(M - K, m - j) - logComb(M, m);
  return Math.exp(logP);
}

export interface ChipCategory {
  key: string;
  p: number;
}

export function getChipExclusions(
  historicalData: any[],
  categories: ChipCategory[],
  nLarga: number,
  nCorta: number,
  extractCategoryKey: (draw: any) => string,
  alpha: number = 0.10
): { excludedKeys: string[]; details: Record<string, { p: number; countL: number; countC: number; layer1Cutoff: number; kStar: number }> } {
  const effectiveNLarga = Math.min(nLarga, historicalData.length);
  const effectiveNCorta = Math.min(nCorta, historicalData.length);
  const sampleL = historicalData.slice(-effectiveNLarga);
  const sampleC = historicalData.slice(-effectiveNCorta);

  const countsL: Record<string, number> = {};
  sampleL.forEach(d => { const k = extractCategoryKey(d); countsL[k] = (countsL[k] || 0) + 1; });
  const countsC: Record<string, number> = {};
  sampleC.forEach(d => { const k = extractCategoryKey(d); countsC[k] = (countsC[k] || 0) + 1; });

  const excludedKeys: string[] = [];
  const details: Record<string, any> = {};

  categories.forEach(cat => {
    const layer1Cutoff = layer1Threshold(effectiveNLarga, cat.p, alpha);
    const kStar = findCriticalK(effectiveNCorta, cat.p, alpha);
    const countL = countsL[cat.key] || 0;
    const countC = countsC[cat.key] || 0;
    details[cat.key] = { p: cat.p, countL, countC, layer1Cutoff, kStar };
    if (countL >= layer1Cutoff || countC >= kStar) excludedKeys.push(cat.key);
  });

  // Failsafe: si TODAS las categorías quedarían excluidas, no excluir ninguna (evita vaciar el filtro por completo)
  if (excludedKeys.length === categories.length) return { excludedKeys: [], details };

  return { excludedKeys, details };
}

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
 * Excluye las categorías menos frecuentes cuya masa de probabilidad acumulada
 * (sumando desde la más rara hacia arriba) no supera tailMass del total.
 * Es la versión para categorías sin orden numérico del mismo concepto de "cola del 5%-95%".
 */
export function nominalTailExclusion(
  categoryCounts: Record<string, number>,
  tailMass: number = 0.10
): { excludedKeys: string[] } {
  const entries = Object.entries(categoryCounts).sort((a, b) => a[1] - b[1]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  if (total === 0) return { excludedKeys: [] };

  const excludedKeys: string[] = [];
  let cumulative = 0;
  for (const [key, count] of entries) {
    cumulative += count;
    if (cumulative / total <= tailMass) {
      excludedKeys.push(key);
    } else {
      break;
    }
  }
  // Failsafe: si excluiría todas las categorías, no excluir ninguna
  if (excludedKeys.length === entries.length) return { excludedKeys: [] };
  return { excludedKeys };
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

