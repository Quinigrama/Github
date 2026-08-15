import { getCombinationStats } from './combinatorial';
import { isSpaced, getNumberCoords, isLine, getCoordsLookup } from './geometry';
import { getPopularityWeight, getNashScoreAverage } from './popularity';
import { getSumTrendScore, getNumberTrendScore } from './regression';

export interface OptimizationContext {
  hotNumbers: Set<number>;
  coldNumbers: Set<number>;
  absentNumbers: Set<number>;
  favoriteNumbers: Set<number>;
  hotStars: Set<number>;
  favoriteStars: Set<number>;
  filters: any;
  historicalData: any[];
  currentGame: { maxNumbers: number; numberRange: number; starRange: number; gridCols?: number; numbersLayout?: any; startAt?: number };
  primes: Set<number>;
}

export function getMarkovScore(
  combination: number[],
  filters: any,
  historicalData: any[]
): number {
  if (!historicalData || !filters?.ai?.markovDepth || historicalData.length < filters.ai.markovDepth) return 0;
  let score = 0;
  const lastDraws = historicalData.slice(-filters.ai.markovDepth).flatMap(d => d.numbers || []);
  const lastDrawsSet = new Set(lastDraws);
  combination.forEach(n => {
    if (lastDrawsSet.has(n)) score += lastDraws.filter(d => d === n).length;
  });
  return score;
}

export function getNashPenalty(
  combination: number[],
  numberRange: number,
  gridCols: number = 10
): number {
  let penalty = 0;
  combination.forEach(n => {
    penalty += getPopularityWeight(n, numberRange) / 10; // 0-10 en vez de 0/2 binario
    const { row, col } = getNumberCoords(n, gridCols);
    if (row === 0 || row === 6 || col === 0 || col === 6) penalty += 1;
  });
  if (isLine(combination.map(n => getNumberCoords(n, gridCols)))) penalty += 10;
  return penalty;
}

export function passesNashStrictFilter(
  combination: number[],
  numberRange: number,
  minScore: number,
  maxScore: number
): boolean {
  const score = getNashScoreAverage(combination, numberRange);
  return score >= minScore && score <= maxScore;
}

export function calculateOptimizationScore(
  combination: number[],
  stars: number[] = [],
  context: OptimizationContext
): number {
  let score = 0;
  combination.forEach(n => {
    if (context.hotNumbers.has(n)) score += 2;
    // Only penalize cold numbers if regression filter is OFF
    if (!context.filters.useRegression && context.coldNumbers.has(n)) score -= 1;

    // Favorite Bonus - Huge Priority
    if (context.favoriteNumbers.has(n)) score += 50;
  });

  if (stars.length > 0) {
    stars.forEach(n => {
      if (context.hotStars.has(n)) score += 5;
      if (context.favoriteStars.has(n)) score += 50;
    });
    const stats = getCombinationStats(combination, stars, context.currentGame, context.primes);
    if (stats.estrellas) {
      if (stats.estrellas.parImpar === '1/1') score += 15;
      if (stats.estrellas.suma >= 8 && stats.estrellas.suma <= 18) score += 10;
    }
  }

  if (context.filters?.geometric?.favor?.includes('espaciados')) {
    const coordsLookup = context.currentGame?.numbersLayout
      ? getCoordsLookup(context.currentGame.numbersLayout, context.currentGame.numberRange, context.currentGame.startAt ?? 1)
      : (context.currentGame?.gridCols || 10);
    if (isSpaced(combination, coordsLookup)) {
      score += 15;
    }
  }
  if (context.filters?.useMarkov) {
    score += getMarkovScore(combination, context.filters, context.historicalData);
  }
  if (context.filters?.useNash) {
    score -= getNashPenalty(combination, context.currentGame?.numberRange || 49, context.currentGame?.gridCols || 10) * (context.filters?.ai?.nashWeight || 1);
  }
  if (context.filters?.useRegression) {
    score += getSumTrendScore(
      combination.reduce((a, b) => a + b, 0),
      context.historicalData,
      context.filters?.ai?.regressionBonus || 0
    );
    score += getNumberTrendScore(
      combination,
      context.historicalData,
      context.filters?.ai?.regressionWindow || 20,
      context.filters?.ai?.regressionBonus || 0
    );
  }
  return score;
}
