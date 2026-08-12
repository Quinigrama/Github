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

export interface RoberGameConfig {
  id?: string;
  numberRange: number;
  maxNumbers: number;
  starRange?: number;
  maxStars?: number;
}

export interface RoberFilterState {
  excludedNumbers: number[];               // números excluidos por recencia (Capas 1/2)
  excludedStars: number[];                 // estrellas excluidas por recencia (Capas 1/2)
  excludedParImparKeys: string[];          // proporciones par/impar excluidas (chip + percentil)
  excludedBajosAltosKeys: string[];        // proporciones bajos/altos excluidas
  sumRange: { min: number; max: number; mean: number; std: number };  // rango de suma total permitido (percentil 5-95%)
  excludedTerminaciones: number[];         // dígitos de terminación excluidos (0-9)
  excludedTermKeys: string[];              // claves de terminaciones excluidas ('0'-'9')
  excludedAgrupDecenas: string[];          // patrones de agrupación por decena excluidos
  excludedConsecutivos: string[];          // patrones de consecutivos excluidos
  entropiaTerminacionesRange: { min: number; max: number };
  entropiaIntervalosRange: { min: number; max: number };
  nLarga: number;
  nCorta: number;
  alpha: number;

  // Re-export / Detailed breakdown for UI reasoning block and backtesting
  numResult: RoberResult;
  starResult: RoberResult | null;
  parImparResult: ReturnType<typeof getChipExclusions> | null;
  parImparPercentileKeys: string[];
  parImparExcludedKeys: string[];
  bajosAltosResult: ReturnType<typeof getChipExclusions> | null;
  bajosAltosPercentileKeys: string[];
  bajosAltosExcludedKeys: string[];
  excludedTermKeysRecency: string[];
  excludedTermKeysPercentile: string[];
  termDetails: Record<string, { p: number; countL: number; countC: number; layer1Cutoff: number; kStar: number }>;
  distinctTermResult: ReturnType<typeof getChipExclusions>;
  distExcludedPercentileKeys: string[];
  distinctExcludedKeys: string[];
  agrupResult: ReturnType<typeof getChipExclusions>;
  agrupExcludedPercentileKeys: string[];
  agrupExcludedKeys: string[];
  consecResult: ReturnType<typeof getChipExclusions>;
  consecExcludedPercentileKeys: string[];
  consecExcludedKeys: string[];
  entTermRange: { min: number; max: number };
  entIntRange: { min: number; max: number };
}

/**
 * Calcula el estado completo del Teorema de Rober (todas sus capas) de forma pura,
 * sin tocar el DOM. Reutilizable tanto por la UI (index.tsx) como por scripts externos
 * de backtesting. Replica EXACTAMENTE la lógica del handler Teorema de Rober.
 */
export function computeRoberFilterState(
  historicalData: any[],
  game: RoberGameConfig,
  nLarga: number = 100,
  nCorta: number = 8,
  alpha: number = 0.10
): RoberFilterState {
  const startNum = game.id === 'nacional' ? 10 : 1;
  const numberUniverseSize = game.numberRange - startNum + 1;

  // 1. Exclusión de números e individuales (Capa 1 + Capa 2)
  const numbersResult = getRoberExclusions(
    historicalData, numberUniverseSize, game.maxNumbers, nLarga, nCorta,
    (d: any) => d.numbers || [],
    alpha
  );
  const excludedNumbers = [...numbersResult.excluded];

  let starsResult: RoberResult | null = null;
  const excludedStars: number[] = [];
  if (game.maxStars && game.maxStars > 0 && game.starRange && game.starRange > 0) {
    starsResult = getRoberExclusions(
      historicalData, game.starRange, game.maxStars, nLarga, nCorta,
      (d: any) => d.stars || [],
      alpha
    );
    excludedStars.push(...starsResult.excluded);
  }

  // 2. Suma Total (Percentil empírico 5%-95% sobre el histórico completo)
  const allSums = historicalData.map(d => (d.numbers || []).reduce((a: number, b: number) => a + b, 0));
  const sortedSums = [...allSums].sort((a, b) => a - b);
  const meanSum = allSums.length > 0 ? allSums.reduce((a, b) => a + b, 0) / allSums.length : 0;
  const stdSum = allSums.length > 0 ? Math.sqrt(allSums.reduce((sq, n) => sq + Math.pow(n - meanSum, 2), 0) / allSums.length) : 0;
  const calcSumMin = sortedSums.length > 0 ? Math.max(1, Math.floor(percentile(sortedSums, 0.05))) : 1;
  const calcSumMax = sortedSums.length > 0 ? Math.ceil(percentile(sortedSums, 0.95)) : 100;
  const sumRange = { min: calcSumMin, max: calcSumMax, mean: meanSum, std: stdSum };

  // 3. Excluir Terminaciones (Dígitos 0-9) mediante Capa Reciente + Capa Percentil
  const M = game.numberRange;
  const m = game.maxNumbers;
  const totalStartN = game.id === 'nacional' ? 10 : 1;
  const totalPossibleN = M - totalStartN + 1;

  const termCategories: ChipCategory[] = [];
  for (let digit = 0; digit <= 9; digit++) {
    let countDigitInUniverse = 0;
    for (let n = totalStartN; n <= M; n++) {
      if (n % 10 === digit) countDigitInUniverse++;
    }
    const p = countDigitInUniverse / totalPossibleN;
    termCategories.push({ key: String(digit), p });
  }

  const effectiveNL = Math.min(nLarga, historicalData.length);
  const effectiveNC = Math.min(nCorta, historicalData.length);
  const sampleL = historicalData.slice(-effectiveNL);
  const sampleC = historicalData.slice(-effectiveNC);

  const termCountsL: Record<number, number> = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  const termCountsC: Record<number, number> = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  sampleL.forEach(d => (d.numbers || []).forEach((n: number) => { termCountsL[n % 10] = (termCountsL[n % 10] || 0) + 1; }));
  sampleC.forEach(d => (d.numbers || []).forEach((n: number) => { termCountsC[n % 10] = (termCountsC[n % 10] || 0) + 1; }));

  const termDetails: Record<string, { p: number; countL: number; countC: number; layer1Cutoff: number; kStar: number }> = {};
  const excludedTermKeysRecency: string[] = [];

  termCategories.forEach(cat => {
    const digit = Number(cat.key);
    const pNum = cat.p;
    const layer1Cutoff = layer1Threshold(effectiveNL * m, pNum, alpha);
    const kStar = findCriticalK(effectiveNC * m, pNum, alpha);
    const countL = termCountsL[digit] || 0;
    const countC = termCountsC[digit] || 0;
    termDetails[cat.key] = { p: pNum, countL, countC, layer1Cutoff, kStar };
    if (countL >= layer1Cutoff || countC >= kStar) {
      excludedTermKeysRecency.push(cat.key);
    }
  });

  const allTermCounts: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
  historicalData.forEach(d => (d.numbers || []).forEach((n: number) => {
    const digitStr = String(n % 10);
    allTermCounts[digitStr] = (allTermCounts[digitStr] || 0) + 1;
  }));
  const termPercentileRes = nominalTailExclusion(allTermCounts, 0.10);
  const excludedTermKeysPercentile = termPercentileRes.excludedKeys;
  const excludedTermKeys = Array.from(new Set([...excludedTermKeysRecency, ...excludedTermKeysPercentile]));
  const excludedTerminaciones = excludedTermKeys.map(Number);

  // 4. Variedad de Terminaciones Distintas
  const distinctCountsL: Record<number, number> = {};
  sampleL.forEach(d => {
    const distinct = new Set((d.numbers || []).map((n: number) => n % 10)).size;
    distinctCountsL[distinct] = (distinctCountsL[distinct] || 0) + 1;
  });

  const distinctCategories: ChipCategory[] = [];
  for (let v = 1; v <= m; v++) {
    const p = (distinctCountsL[v] || 0) / (effectiveNL || 1);
    if (p > 0) distinctCategories.push({ key: String(v), p });
  }

  const distinctTermResult = getChipExclusions(
    historicalData, distinctCategories, nLarga, nCorta,
    (d: any) => String(new Set((d.numbers || []).map((n: number) => n % 10)).size),
    alpha
  );

  const allDistinctValues = historicalData.map(d => new Set((d.numbers || []).map((n: number) => n % 10)).size);
  const allDistinctCatValues = Array.from({ length: m }, (_, i) => i + 1);
  const distPercentileRes = orderedPercentileExclusion(allDistinctValues, allDistinctCatValues, 0.05, 0.95);
  const distExcludedPercentileKeys = distPercentileRes.excludedValues.map(v => String(v));
  const distinctExcludedKeys = Array.from(new Set([...distinctTermResult.excludedKeys, ...distExcludedPercentileKeys]));

  // 5. Par/Impar y Bajos/Altos
  let parImparResult: ReturnType<typeof getChipExclusions> | null = null;
  let bajosAltosResult: ReturnType<typeof getChipExclusions> | null = null;
  let parImparExcludedKeys: string[] = [];
  let parImparPercentileKeys: string[] = [];
  let bajosAltosExcludedKeys: string[] = [];
  let bajosAltosPercentileKeys: string[] = [];

  if (game.id !== 'nacional') {
    const K_pares = Math.floor(M / 2);
    const parImparCategories: ChipCategory[] = [];
    for (let j = 0; j <= m; j++) {
      const p = hypergeometricPMF(M, K_pares, m, j);
      if (p > 0) parImparCategories.push({ key: `${j}/${m - j}`, p });
    }
    parImparResult = getChipExclusions(
      historicalData, parImparCategories, nLarga, nCorta,
      (d: any) => {
        const evens = (d.numbers || []).filter((n: number) => n % 2 === 0).length;
        return `${evens}/${m - evens}`;
      },
      alpha
    );

    const allEvenCounts = historicalData.map(d => (d.numbers || []).filter((n: number) => n % 2 === 0).length);
    const allParCatValues = Array.from({ length: m + 1 }, (_, i) => i);
    const parPercentileRes = orderedPercentileExclusion(allEvenCounts, allParCatValues, 0.05, 0.95);
    parImparPercentileKeys = parPercentileRes.excludedValues.map(j => `${j}/${m - j}`);
    parImparExcludedKeys = Array.from(new Set([...parImparResult.excludedKeys, ...parImparPercentileKeys]));

    const midPoint = Math.floor(M / 2);
    const K_bajos = midPoint;
    const bajosAltosCategories: ChipCategory[] = [];
    for (let j = 0; j <= m; j++) {
      const p = hypergeometricPMF(M, K_bajos, m, j);
      if (p > 0) bajosAltosCategories.push({ key: `${j}/${m - j}`, p });
    }
    bajosAltosResult = getChipExclusions(
      historicalData, bajosAltosCategories, nLarga, nCorta,
      (d: any) => {
        const lows = (d.numbers || []).filter((n: number) => n <= midPoint).length;
        return `${lows}/${m - lows}`;
      },
      alpha
    );

    const allLowCounts = historicalData.map(d => (d.numbers || []).filter((n: number) => n <= midPoint).length);
    const allLowCatValues = Array.from({ length: m + 1 }, (_, i) => i);
    const lowPercentileRes = orderedPercentileExclusion(allLowCounts, allLowCatValues, 0.05, 0.95);
    bajosAltosPercentileKeys = lowPercentileRes.excludedValues.map(j => `${j}/${m - j}`);
    bajosAltosExcludedKeys = Array.from(new Set([...bajosAltosResult.excludedKeys, ...bajosAltosPercentileKeys]));
  }

  // 6. Agrupación por Decenas
  const agrupCountsL: Record<string, number> = {};
  sampleL.forEach(d => {
    const tens: Record<number, number> = {};
    (d.numbers || []).forEach((n: number) => {
      const ten = Math.floor((n - 1) / 10);
      tens[ten] = (tens[ten] || 0) + 1;
    });
    const pattern = Object.values(tens).sort((a, b) => b - a).join('/');
    agrupCountsL[pattern] = (agrupCountsL[pattern] || 0) + 1;
  });

  const agrupCategories: ChipCategory[] = [];
  Object.entries(agrupCountsL).forEach(([pat, count]) => {
    const p = count / (effectiveNL || 1);
    agrupCategories.push({ key: pat, p });
  });

  const agrupResult = getChipExclusions(
    historicalData, agrupCategories, nLarga, nCorta,
    (d: any) => {
      const tens: Record<number, number> = {};
      (d.numbers || []).forEach((n: number) => {
        const ten = Math.floor((n - 1) / 10);
        tens[ten] = (tens[ten] || 0) + 1;
      });
      return Object.values(tens).sort((a, b) => b - a).join('/');
    },
    alpha
  );

  const allAgrupCounts: Record<string, number> = {};
  historicalData.forEach(d => {
    const tens: Record<number, number> = {};
    (d.numbers || []).forEach((n: number) => {
      const ten = Math.floor((n - 1) / 10);
      tens[ten] = (tens[ten] || 0) + 1;
    });
    const pattern = Object.values(tens).sort((a, b) => b - a).join('/');
    allAgrupCounts[pattern] = (allAgrupCounts[pattern] || 0) + 1;
  });

  const agrupPercentileRes = nominalTailExclusion(allAgrupCounts, 0.10);
  const agrupExcludedPercentileKeys = agrupPercentileRes.excludedKeys;
  const agrupExcludedKeys = Array.from(new Set([...agrupResult.excludedKeys, ...agrupExcludedPercentileKeys]));

  // 7. Números Consecutivos
  const consecCountsL: Record<string, number> = {};
  sampleL.forEach(d => {
    const sorted = [...(d.numbers || [])].sort((a, b) => a - b);
    let consecStr = '';
    let cCount = 1;
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j] === sorted[j - 1] + 1) {
        cCount++;
      } else {
        consecStr += cCount;
        cCount = 1;
      }
    }
    consecStr += cCount;
    const pattern = consecStr.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    consecCountsL[pattern] = (consecCountsL[pattern] || 0) + 1;
  });

  const consecCategories: ChipCategory[] = [];
  Object.entries(consecCountsL).forEach(([pat, count]) => {
    const p = count / (effectiveNL || 1);
    consecCategories.push({ key: pat, p });
  });

  const consecResult = getChipExclusions(
    historicalData, consecCategories, nLarga, nCorta,
    (d: any) => {
      const sorted = [...(d.numbers || [])].sort((a, b) => a - b);
      let consecStr = '';
      let cCount = 1;
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] === sorted[j - 1] + 1) {
          cCount++;
        } else {
          consecStr += cCount;
          cCount = 1;
        }
      }
      consecStr += cCount;
      return consecStr.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    },
    alpha
  );

  const allConsecCounts: Record<string, number> = {};
  historicalData.forEach(d => {
    const sorted = [...(d.numbers || [])].sort((a, b) => a - b);
    let consecStr = '';
    let cCount = 1;
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j] === sorted[j - 1] + 1) {
        cCount++;
      } else {
        consecStr += cCount;
        cCount = 1;
      }
    }
    consecStr += cCount;
    const pattern = consecStr.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    allConsecCounts[pattern] = (allConsecCounts[pattern] || 0) + 1;
  });

  const consecPercentileRes = nominalTailExclusion(allConsecCounts, 0.10);
  const consecExcludedPercentileKeys = consecPercentileRes.excludedKeys;
  const consecExcludedKeys = Array.from(new Set([...consecResult.excludedKeys, ...consecExcludedPercentileKeys]));

  // 8. Entropía de Terminaciones (Rango percentil 5%-95% en N=100)
  const termEntropies = sampleL.map(d => {
    const endingCounts: Record<number, number> = {};
    (d.numbers || []).forEach((n: number) => {
      const ending = n % 10;
      endingCounts[ending] = (endingCounts[ending] || 0) + 1;
    });
    return -Object.values(endingCounts).reduce((s, countVal) => {
      const p = countVal / m;
      return s + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
  }).sort((a, b) => a - b);

  const minEntropyTerm = termEntropies.length > 0 ? percentile(termEntropies, 0.05) : 0;
  const maxEntropyTerm = termEntropies.length > 0 ? percentile(termEntropies, 0.95) : 0;
  const entTermRange = { min: minEntropyTerm, max: maxEntropyTerm };

  // 9. Entropía de Intervalos (Rango percentil 5%-95% en N=100)
  const intervalEntropies = sampleL.map(d => {
    const sortedCombo = [...(d.numbers || [])].sort((a, b) => a - b);
    const intervalCounts: Record<number, number> = {};
    for (let idx = 0; idx < sortedCombo.length - 1; idx++) {
      const diff = sortedCombo[idx + 1] - sortedCombo[idx];
      intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
    }
    const numIntervals = m - 1;
    if (numIntervals <= 0) return 0;
    return -Object.values(intervalCounts).reduce((s, countVal) => {
      const p = countVal / numIntervals;
      return s + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
  }).sort((a, b) => a - b);

  const minEntropyInt = intervalEntropies.length > 0 ? percentile(intervalEntropies, 0.05) : 0;
  const maxEntropyInt = intervalEntropies.length > 0 ? percentile(intervalEntropies, 0.95) : 0;
  const entIntRange = { min: minEntropyInt, max: maxEntropyInt };

  return {
    excludedNumbers,
    excludedStars,
    excludedParImparKeys: parImparExcludedKeys,
    excludedBajosAltosKeys: bajosAltosExcludedKeys,
    sumRange,
    excludedTerminaciones,
    excludedTermKeys,
    excludedAgrupDecenas: agrupExcludedKeys,
    excludedConsecutivos: consecExcludedKeys,
    entropiaTerminacionesRange: entTermRange,
    entropiaIntervalosRange: entIntRange,
    nLarga,
    nCorta,
    alpha,

    // Detailed breakdown
    numResult: numbersResult,
    starResult: starsResult,
    parImparResult,
    parImparPercentileKeys,
    parImparExcludedKeys,
    bajosAltosResult,
    bajosAltosPercentileKeys,
    bajosAltosExcludedKeys,
    excludedTermKeysRecency,
    excludedTermKeysPercentile,
    termDetails,
    distinctTermResult,
    distExcludedPercentileKeys,
    distinctExcludedKeys,
    agrupResult,
    agrupExcludedPercentileKeys,
    agrupExcludedKeys,
    consecResult,
    consecExcludedPercentileKeys,
    consecExcludedKeys,
    entTermRange,
    entIntRange
  };
}

