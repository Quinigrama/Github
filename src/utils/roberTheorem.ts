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
