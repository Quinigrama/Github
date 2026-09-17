import { PRIMITIVA_OPTIMIZED_PATTERNS } from '../data/reducedSystemPatterns';
import { FIVE_NUMBER_OPTIMIZED_PATTERNS } from '../data/fiveNumberOptimizedPatterns';
import { ReducedSystem } from '../data/reducedSystems';
import { getGreedyCovering } from './generators';
import { isValidCombination } from './combinationValidator';
import { secureRandom } from './secureRandom';

const SIX_NUMBER_OPTIMIZED_GAMES = ['primitiva', 'bonoloto', 'eurodreams'];
const FIVE_NUMBER_OPTIMIZED_GAMES = ['gordo', 'euromillones', 'powerball', 'megamillions'];

/**
 * Obtiene la matriz de apuestas reducidas correspondiente al juego y sistema seleccionado.
 */
export function getReducedSystemMatrix(
  gameId: string,
  system: ReducedSystem,
  maxNumbers: number
): number[][] {
  if (SIX_NUMBER_OPTIMIZED_GAMES.includes(gameId) && PRIMITIVA_OPTIMIZED_PATTERNS[system.id]) {
    return PRIMITIVA_OPTIMIZED_PATTERNS[system.id];
  }
  if (FIVE_NUMBER_OPTIMIZED_GAMES.includes(gameId) && FIVE_NUMBER_OPTIMIZED_PATTERNS[system.id]) {
    return FIVE_NUMBER_OPTIMIZED_PATTERNS[system.id];
  }
  return getGreedyCovering(
    system.baseNumbersCount,
    maxNumbers,
    system.id.includes('-3-3') ? 3 : (system.id.includes('-4-4') ? 4 : 5),
    system.combinationsCount
  );
}

export interface ReducedBaseAuditResult {
  validCount: number;
  totalBets: number;
  percentage: number;
  bets: { combo: number[]; isValid: boolean }[];
}

/**
 * Audita el cumplimiento de filtros de una base de números dada contra la matriz del sistema reducido.
 */
export function auditReducedBaseCompliance(
  baseNumbers: number[],
  matrix: number[][],
  stars: number[] = [],
  currentGame: any,
  filters: any,
  primes: Set<number> = new Set(),
  historicalData: { numbers: number[] }[] = []
): ReducedBaseAuditResult {
  const sortedBase = [...baseNumbers].sort((a, b) => a - b);
  const totalBets = matrix.length;
  let validCount = 0;
  const bets: { combo: number[]; isValid: boolean }[] = [];

  for (let m = 0; m < totalBets; m++) {
    const indices = matrix[m];
    const combo = indices.map(idx => sortedBase[idx]).sort((a, b) => a - b);
    const isValid = isValidCombination(
      combo,
      stars,
      currentGame,
      filters,
      primes,
      stars.length === 0,
      historicalData
    );
    if (isValid) validCount++;
    bets.push({ combo, isValid });
  }

  const percentage = totalBets > 0 ? Math.round((validCount / totalBets) * 100) : 0;
  return { validCount, totalBets, percentage, bets };
}

export interface OptimizedBaseResult {
  bestPool: number[];
  validCount: number;
  totalBets: number;
  percentage: number;
  attempts: number;
}

/**
 * Optimiza la selección de números base directamente contra la matriz del sistema reducido.
 * Utiliza muestreo Monte Carlo guiado + búsqueda local voraz (hill-climbing) para maximizar
 * la cantidad de boletos reducidos que cumplen simultáneamente todos los filtros activos (hasta el 100%).
 */
export async function optimizeReducedBasePool(
  universe: number[],
  countNeeded: number,
  matrix: number[][],
  stars: number[] = [],
  currentGame: any,
  filters: any,
  primes: Set<number> = new Set(),
  historicalData: { numbers: number[] }[] = [],
  maxRandomAttempts: number = 3000,
  onProgress?: (attempt: number, bestValid: number, total: number) => void
): Promise<OptimizedBaseResult> {
  const totalBets = matrix.length;
  if (universe.length < countNeeded) {
    return {
      bestPool: universe.slice(0, countNeeded),
      validCount: 0,
      totalBets,
      percentage: 0,
      attempts: 0
    };
  }

  const maxNumbers = currentGame?.maxNumbers || 6;
  const targetSumMean = (maxNumbers * ((currentGame?.numberRange || 49) + 1)) / 2;

  // Función de evaluación interna de un pool candidato
  const evaluateCandidate = (poolSorted: number[]): { validCount: number; qualityScore: number } => {
    let valid = 0;
    let sumDevTotal = 0;

    for (let m = 0; m < totalBets; m++) {
      const indices = matrix[m];
      const combo = indices.map(idx => poolSorted[idx]).sort((a, b) => a - b);
      const ok = isValidCombination(
        combo,
        stars,
        currentGame,
        filters,
        primes,
        stars.length === 0,
        historicalData
      );
      if (ok) valid++;

      let s = 0;
      for (let k = 0; k < combo.length; k++) s += combo[k];
      sumDevTotal += Math.abs(s - targetSumMean);
    }

    // Puntuación de desempate: a menor desviación de suma, mejor distribución
    const qualityScore = valid * 10000 - sumDevTotal;
    return { validCount: valid, qualityScore };
  };

  let bestPool: number[] = [];
  let bestValid = -1;
  let bestScore = -Infinity;
  let totalAttempts = 0;

  // FASE 1: Exploración Monte Carlo guiada
  const chunkSize = 150;
  for (let attempt = 1; attempt <= maxRandomAttempts; attempt++) {
    totalAttempts++;

    // Ceder el hilo para no bloquear la interfaz
    if (attempt % chunkSize === 0) {
      if (onProgress) onProgress(attempt, bestValid, totalBets);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Barajado Fisher-Yates rápido
    const shuffled = [...universe];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(secureRandom() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    const candidate = shuffled.slice(0, countNeeded).sort((a, b) => a - b);
    const { validCount, qualityScore } = evaluateCandidate(candidate);

    if (validCount > bestValid || (validCount === bestValid && qualityScore > bestScore)) {
      bestValid = validCount;
      bestScore = qualityScore;
      bestPool = candidate;

      // Si alcanzamos el 100% de cumplimiento en todos los boletos de la matriz, terminamos anticipadamente
      if (bestValid === totalBets) {
        break;
      }
    }
  }

  // FASE 2: Búsqueda Local (Hill-Climbing) si no se alcanzó el 100%
  if (bestValid < totalBets && bestPool.length === countNeeded) {
    let improved = true;
    let hillSteps = 0;
    const maxHillSteps = 40;

    while (improved && hillSteps < maxHillSteps && bestValid < totalBets) {
      improved = false;
      hillSteps++;

      if (hillSteps % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const poolSet = new Set(bestPool);
      const unused = universe.filter(n => !poolSet.has(n));

      // Probar intercambios de 1 número de la base con uno libre
      for (let i = 0; i < bestPool.length; i++) {
        for (let u = 0; u < unused.length; u++) {
          const neighbor = [...bestPool];
          neighbor[i] = unused[u];
          neighbor.sort((a, b) => a - b);

          const { validCount, qualityScore } = evaluateCandidate(neighbor);
          if (validCount > bestValid || (validCount === bestValid && qualityScore > bestScore + 50)) {
            bestValid = validCount;
            bestScore = qualityScore;
            bestPool = neighbor;
            improved = true;
            break;
          }
        }
        if (bestValid === totalBets || improved) break;
      }
    }
  }

  const percentage = totalBets > 0 ? Math.round((bestValid / totalBets) * 100) : 0;
  return {
    bestPool,
    validCount: bestValid,
    totalBets,
    percentage,
    attempts: totalAttempts
  };
}
