/**
 * Calculadora de selectividad de filtros: qué fracción de todas las combinaciones posibles
 * de un juego cumple los filtros actualmente activos sobre los números principales.
 *
 * Para los filtros "numéricos simples" (suma, suma de dígitos, huecos entre números
 * consecutivos, cantidad de números primos, bajos/altos, pares/impares) el cálculo es
 * EXACTO mediante programación dinámica — verificado por fuerza bruta en universos
 * pequeños antes de aplicarse aquí, y contrastado con los valores reales de Primitiva.
 *
 * Si además hay algún filtro "estructural" activo (geométrico, Nash, consecutivos,
 * entropía, agrupación por decenas, terminaciones distintas, rango por posición,
 * exclusión histórica) que no se presta a una fórmula cerrada, se usa una muestra
 * aleatoria grande (Monte Carlo) evaluada con la función real `isValidCombination`,
 * y se reporta el margen de error estadístico junto al resultado.
 */

import { isValidCombination } from './combinationValidator';
import { generateRandomCombination } from './geometry';

function digitSumOf(n: number): number {
  if (n < 10) return n;
  return (n % 10) + Math.floor(n / 10);
}

function isPrimeNumber(n: number): boolean {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

export interface SelectivityResult {
  fraction: number;
  count: number;
  total: number;
  isExact: boolean;
  sampleSize?: number;
  marginOfError?: number;
}

const HARD_FILTER_KEYS = [
  'terminacionesDistintas', 'consecutivos', 'agrupDecenas', 'desviacion',
  'entropyTerminaciones', 'entropyIntervalos', 'geometric', 'nashStrictMode',
  'excludeHistoricalMatchFull', 'excludeHistoricalMatchNearFull',
  'excluirDecenas', 'excluirTerminaciones'
];

function hasHardFilters(filters: any): boolean {
  if (!filters) return false;
  if (HARD_FILTER_KEYS.some(k => {
    const v = filters[k];
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  })) return true;
  if (filters.positionRange && filters.positionRange.enabled) return true;
  return false;
}

function parseAllowedFirstValue(list: string[] | undefined): Set<number> | null {
  if (!list || list.length === 0) return null;
  return new Set(list.map(s => parseInt(s.split('/')[0], 10)));
}

function exactCombinationCount(N: number, k: number, filters: any): number {
  const midpoint = Math.floor(N / 2);
  const primesSet = new Set<number>();
  for (let i = 1; i <= N; i++) if (isPrimeNumber(i)) primesSet.add(i);

  const sumRange = filters.sum ? [filters.sum.min, filters.sum.max] : null;
  const digitSumRange = filters.sumaDigitos ? [filters.sumaDigitos.min, filters.sumaDigitos.max] : null;
  const gapRange = filters.distancia ? [filters.distancia.min, filters.distancia.max] : null;
  const primeRange = filters.primos ? [filters.primos.min, filters.primos.max] : null;
  const lowSet = parseAllowedFirstValue(filters.bajosAltos);
  const evenSet = parseAllowedFirstValue(filters.parImpar);

  const useLastPos = !!gapRange, usePrimes = !!primeRange, useLows = !!lowSet, useEvens = !!evenSet,
        useDigitSum = !!digitSumRange, useRawSum = !!sumRange;
  const maxLow = useLows ? Math.max(...Array.from(lowSet!)) : null;
  const maxEven = useEvens ? Math.max(...Array.from(evenSet!)) : null;

  let dp = new Map<string, number>();
  const key0 = [useLastPos ? 0 : null, 0, usePrimes ? 0 : null, useLows ? 0 : null, useEvens ? 0 : null, useDigitSum ? 0 : null, useRawSum ? 0 : null].join(',');
  dp.set(key0, 1);

  for (let pos = 1; pos <= N; pos++) {
    const newDp = new Map<string, number>();
    const pFlag = primesSet.has(pos) ? 1 : 0;
    const lFlag = pos <= midpoint ? 1 : 0;
    const eFlag = pos % 2 === 0 ? 1 : 0;
    const dVal = digitSumOf(pos);

    for (const [key, ways] of dp) {
      newDp.set(key, (newDp.get(key) || 0) + ways);
      const parts = key.split(',').map(x => x === 'null' ? null : parseInt(x, 10));
      const lastPos = parts[0], count = parts[1] as number, pr = parts[2], low = parts[3], ev = parts[4], ds = parts[5], rs = parts[6];
      if (count < k) {
        let gapOk = true;
        if (useLastPos && count > 0) {
          const gap = pos - (lastPos as number);
          if (gap < gapRange![0] || gap > gapRange![1]) gapOk = false;
        }
        if (gapOk) {
          const newPr = usePrimes ? (pr as number) + pFlag : null;
          const newLow = useLows ? (low as number) + lFlag : null;
          const newEv = useEvens ? (ev as number) + eFlag : null;
          const newDs = useDigitSum ? (ds as number) + dVal : null;
          const newRs = useRawSum ? (rs as number) + pos : null;
          if (usePrimes && newPr! > primeRange![1]) continue;
          if (useLows && newLow! > maxLow!) continue;
          if (useEvens && newEv! > maxEven!) continue;
          if (useDigitSum && newDs! > digitSumRange![1]) continue;
          if (useRawSum && newRs! > sumRange![1]) continue;
          const newKey = [useLastPos ? pos : null, count + 1, newPr, newLow, newEv, newDs, newRs].join(',');
          newDp.set(newKey, (newDp.get(newKey) || 0) + ways);
        }
      }
    }
    dp = newDp;
  }

  let total = 0;
  for (const [key, ways] of dp) {
    const parts = key.split(',').map(x => x === 'null' ? null : parseInt(x, 10));
    const count = parts[1] as number, pr = parts[2], low = parts[3], ev = parts[4], ds = parts[5], rs = parts[6];
    if (count !== k) continue;
    if (usePrimes && ((pr as number) < primeRange![0] || (pr as number) > primeRange![1])) continue;
    if (useLows && !lowSet!.has(low as number)) continue;
    if (useEvens && !evenSet!.has(ev as number)) continue;
    if (useDigitSum && ((ds as number) < digitSumRange![0] || (ds as number) > digitSumRange![1])) continue;
    if (useRawSum && ((rs as number) < sumRange![0] || (rs as number) > sumRange![1])) continue;
    total += ways;
  }
  return total;
}

function nCrLocal(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let result = 1;
  for (let i = 0; i < r; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

/**
 * Estima (o calcula exactamente) qué fracción de todas las combinaciones posibles de un juego
 * cumple los filtros actualmente activos sobre los números principales.
 */
export function estimateFilterSelectivity(
  currentGame: any,
  filters: any,
  universe: number[]
): SelectivityResult {
  const N = currentGame.numberRange;
  const k = currentGame.maxNumbers;
  const total = nCrLocal(N, k);

  if (!filters || hasHardFilters(filters)) {
    const sampleSize = 25000;
    let valid = 0;
    for (let i = 0; i < sampleSize; i++) {
      const combo = generateRandomCombination(universe, k, currentGame?.id);
      if (isValidCombination(combo, [], currentGame, filters, undefined, true)) valid++;
    }
    const fraction = valid / sampleSize;
    const marginOfError = 1.96 * Math.sqrt((fraction * (1 - fraction)) / sampleSize);
    return {
      fraction,
      count: Math.round(fraction * total),
      total,
      isExact: false,
      sampleSize,
      marginOfError
    };
  }

  const hasAnySimpleFilter = !!(filters.sum || filters.sumaDigitos || filters.distancia ||
    filters.primos || (filters.bajosAltos && filters.bajosAltos.length) || (filters.parImpar && filters.parImpar.length));

  if (!hasAnySimpleFilter) {
    return { fraction: 1, count: total, total, isExact: true };
  }

  const exact = exactCombinationCount(N, k, filters);
  return { fraction: exact / total, count: exact, total, isExact: true };
}
