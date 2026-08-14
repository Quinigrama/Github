import { generateRandomCombination } from './geometry';
import { getCombinations } from './combinatorial';
import { isValidCombination } from './combinationValidator';
import { calculateOptimizationScore, OptimizationContext } from './optimizer';

export const DEFAULT_TOLERANCE_LEVELS: { [key: number]: number } = {
  7: 0.70,
  8: 0.50,
  9: 0.35,
  10: 0.25,
  11: 0.20,
  12: 0.16,
  13: 0.13,
  14: 0.11,
  15: 0.09
};

export function findValidCombinations(
  universe: number[],
  count: number,
  maxAttempts: number,
  currentGame: any,
  filters: any,
  primes?: Set<number>
): number[][] {
  const validCombinations: number[][] = [];
  const maxNumbers = currentGame.maxNumbers;
  for (let i = 0; i < maxAttempts && validCombinations.length < count; i++) {
    const combo = generateRandomCombination(universe, maxNumbers, currentGame?.id);
    if (isValidCombination(combo, [], currentGame, filters, primes)) {
      validCombinations.push(combo);
    }
  }
  return validCombinations;
}

export async function findValidSuperset(
  universe: number[],
  numCount: number,
  starCount: number = 0,
  currentGame: any,
  filters: any,
  availableStars: number[] = [],
  toleranceLevels: { [key: number]: number } = DEFAULT_TOLERANCE_LEVELS,
  primes?: Set<number>,
  onProgress?: (msg: string) => void
): Promise<{ superset: number[], stars: number[], validCount: number, totalCount: number } | null> {
  const label = starCount > currentGame.maxStars ? `Múltiple de ${numCount} + ${starCount}⭐` : `Múltiple de ${numCount}`;
  onProgress?.(`Buscando ${label}...`);

  const maxNumbers = currentGame.maxNumbers;
  const maxStars = currentGame.maxStars;

  const tolerance = toleranceLevels[numCount] || 0.5;
  const maxAttempts = 50000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt % 100 === 0) {
      onProgress?.(`Intento ${attempt} de ${maxAttempts}...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const candidateSuperset = generateRandomCombination(universe, numCount, currentGame?.id);
    let subCombinations: number[][] = [];
    if (numCount === 5 && maxNumbers === 6) {
      const extraNumbers = universe.filter(n => !candidateSuperset.includes(n));
      subCombinations = extraNumbers.map(extra => [...candidateSuperset, extra].sort((a, b) => a - b));
    } else {
      subCombinations = getCombinations(candidateSuperset, maxNumbers);
    }

    let candidateStarSuperset: number[] = [];
    let starSubCombinations: number[][] = [[]];

    if (maxStars > 0) {
      const actualStarCount = starCount || maxStars;
      candidateStarSuperset = generateRandomCombination(availableStars, actualStarCount, currentGame?.id);
      starSubCombinations = getCombinations(candidateStarSuperset, maxStars);
    }

    const totalSubCombos = subCombinations.length * starSubCombinations.length;
    const requiredValidCount = Math.ceil(totalSubCombos * tolerance);

    let validCount = 0;
    for (const subCombo of subCombinations) {
      for (const subStar of starSubCombinations) {
        if (isValidCombination(subCombo, subStar, currentGame, filters, primes)) {
          validCount++;
        }
      }
    }

    if (validCount >= requiredValidCount) {
      onProgress?.(`¡Superconjunto válido encontrado!`);
      return {
        superset: candidateSuperset.sort((a, b) => a - b),
        stars: candidateStarSuperset.sort((a, b) => a - b),
        validCount,
        totalCount: totalSubCombos
      };
    }
  }

  onProgress?.(`Búsqueda finalizada sin éxito.`);
  return null;
}

export async function findAndRankWinningCombinations(
  universe: number[],
  generateCount: number,
  playCount: number,
  currentGame: any,
  filters: any,
  availableStars: number[],
  optimizationContext: OptimizationContext,
  onProgress?: (msg: string) => void
): Promise<{ combo: number[], stars: number[] }[]> {
  onProgress?.(`Buscando ${generateCount} válidas...`);

  const validPairs: { combo: number[], stars: number[] }[] = [];
  const maxNumbers = currentGame.maxNumbers;
  const maxStars = currentGame.maxStars;
  const maxAttempts = Math.max(500000, generateCount * 100);

  for (let i = 0; i < maxAttempts && validPairs.length < generateCount; i++) {
    if (i % 500 === 0) {
      onProgress?.(`${validPairs.length} / ${generateCount} encontradas... (Intento ${i})`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const combo = generateRandomCombination(universe, maxNumbers, currentGame?.id);
    const stars = maxStars > 0 ? generateRandomCombination(availableStars, maxStars, currentGame?.id) : [];
    if (isValidCombination(combo, stars, currentGame, filters, optimizationContext.primes)) {
      validPairs.push({ combo, stars });
    }
  }

  if (validPairs.length === 0) {
    throw new Error('No se encontraron combinaciones válidas. Intenta flexibilizar los filtros.');
  }

  onProgress?.('Puntuando y ordenando...');
  onProgress?.(`Puntuando ${validPairs.length} combinaciones...`);
  await new Promise(resolve => setTimeout(resolve, 0));

  const scoredPairs = validPairs.map(pair => ({
    pair,
    score: calculateOptimizationScore(pair.combo, pair.stars, optimizationContext)
  }));

  scoredPairs.sort((a, b) => b.score - a.score);
  return scoredPairs.slice(0, playCount).map(item => item.pair);
}
