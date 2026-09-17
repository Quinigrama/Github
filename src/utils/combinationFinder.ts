import { generateRandomCombination } from './geometry';
import { getCombinations } from './combinatorial';
import { isValidCombination } from './combinationValidator';
import { calculateOptimizationScore, OptimizationContext } from './optimizer';
import { t } from './i18n';
import { estimateFilterSelectivity, getAllValidNacionalNumbers } from './filterSelectivity';
import { secureRandom } from './secureRandom';
import { selectNacionalPortfolioByMode } from './nacionalPortfolioStrategy';

function convertNacionalNumberToCombo(n: number): number[] {
  const d1 = Math.floor(n / 10000);
  const d2 = Math.floor((n % 10000) / 1000);
  const d3 = Math.floor((n % 1000) / 100);
  const d4 = Math.floor((n % 100) / 10);
  const d5 = n % 10;
  return [10 + d1, 20 + d2, 30 + d3, 40 + d4, 50 + d5];
}

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
  const starSuffix = starCount > currentGame.maxStars ? ` + ${starCount}⭐` : '';
  const label = t('generacion.buscandoMultiple', { numCount, starSuffix });
  onProgress?.(t('generacion.buscandoLabel', { label }));

  const maxNumbers = currentGame.maxNumbers;
  const maxStars = currentGame.maxStars;

  const tolerance = toleranceLevels[numCount] || 0.5;
  const maxAttempts = 50000;

  // Comprobación temprana: si los filtros activos son matemáticamente imposibles o casi
  // imposibles de cumplir, lo detectamos ahora (cálculo exacto o estimado, milisegundos)
  // en vez de gastar hasta 50.000 intentos a ciegas.
  const selectivity = estimateFilterSelectivity(currentGame, filters, universe);
  if (selectivity && selectivity.count < 1) {
    const pctStr = (selectivity.fraction * 100).toFixed(4);
    onProgress?.(t('generacion.filtrosImposibles', { pct: pctStr }));
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt % 100 === 0) {
      onProgress?.(t('generacion.intentoDe', { attempt, maxAttempts }));
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
      onProgress?.(t('generacion.supersetEncontrado'));
      return {
        superset: candidateSuperset.sort((a, b) => a - b),
        stars: candidateStarSuperset.sort((a, b) => a - b),
        validCount,
        totalCount: totalSubCombos
      };
    }
  }

  onProgress?.(t('generacion.busquedaSinExito'));
  return null;
}

// Selección greedy: en cada paso, elige la combinación candidata que maximiza
// (score - penalización por solapamiento con las ya elegidas). No es una
// optimización exacta de cartera, pero evita boletos casi idénticos.
function seleccionarCarteraDiversificada(
  scoredPairs: { pair: { combo: number[]; stars: number[] }; score: number }[],
  playCount: number
): { combo: number[]; stars: number[] }[] {
  if (scoredPairs.length === 0) return [];

  const seleccionadas: { pair: { combo: number[]; stars: number[] }; score: number }[] = [];
  const restantes = [...scoredPairs];

  // La primera combinación es siempre la de mejor score puro.
  restantes.sort((a, b) => b.score - a.score);
  seleccionadas.push(restantes.shift()!);

  const solapamiento = (a: number[], b: number[]): number =>
    a.filter(n => b.includes(n)).length;

  while (seleccionadas.length < playCount && restantes.length > 0) {
    let mejorIdx = 0;
    let mejorScoreAjustado = -Infinity;

    restantes.forEach((candidata, idx) => {
      const maxSolapamiento = Math.max(
        ...seleccionadas.map(s => solapamiento(candidata.pair.combo, s.pair.combo))
      );
      // Penalización: cada número compartido con la combinación más parecida
      // ya elegida resta valor proporcional al score máximo del pool.
      const penalizacion = maxSolapamiento * (scoredPairs[0].score * 0.1);
      const scoreAjustado = candidata.score - penalizacion;
      if (scoreAjustado > mejorScoreAjustado) {
        mejorScoreAjustado = scoreAjustado;
        mejorIdx = idx;
      }
    });

    seleccionadas.push(restantes.splice(mejorIdx, 1)[0]);
  }

  return seleccionadas.map(item => item.pair);
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
  // Manejador ultra-optimizado específico para Lotería Nacional (Cero Descartes)
  if (currentGame?.id === 'nacional') {
    onProgress?.(t('generacion.buscandoNValidas', { generateCount }));
    const validNumbers = getAllValidNacionalNumbers(filters, universe);

    if (validNumbers.length === 0) {
      const detail = `Solo 0 de 100.000 combinaciones posibles (0,0000%) cumplen estos filtros. `;
      const err = new Error(`No se encontraron combinaciones válidas. ${detail}Intenta flexibilizar los filtros.`);
      (err as any).i18nKey = 'generacion.sinCombinacionesValidas';
      (err as any).selectivity = { fraction: 0, count: 0, total: 100000, isExact: true };
      throw err;
    }

    let sampleNumbers: number[] = [];
    if (validNumbers.length <= generateCount) {
      sampleNumbers = validNumbers;
    } else {
      const pool = [...validNumbers];
      const countToSample = Math.min(generateCount, pool.length);
      for (let i = 0; i < countToSample; i++) {
        const j = i + Math.floor(secureRandom() * (pool.length - i));
        const temp = pool[i];
        pool[i] = pool[j];
        pool[j] = temp;
        sampleNumbers.push(pool[i]);
      }
    }

    onProgress?.(t('generacion.puntuandoOrdenando'));
    onProgress?.(t('generacion.puntuandoNCombinaciones', { count: sampleNumbers.length }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const scoredPairs = sampleNumbers.map(n => {
      const combo = convertNacionalNumberToCombo(n);
      return {
        pair: { combo, stars: [] },
        score: calculateOptimizationScore(combo, [], optimizationContext),
        ending: n % 10
      };
    });

    scoredPairs.sort((a, b) => b.score - a.score);

    // Estrategias avanzadas de terminaciones y cobertura de reintegros para Lotería Nacional
    const portfolioMode = filters?.nacionalPortfolioMode || (filters?.nacionalGarantiaReintegros !== false ? 'complete_reintegros' : 'standard');

    if (portfolioMode !== 'standard') {
      return selectNacionalPortfolioByMode(scoredPairs, playCount, portfolioMode);
    }

    if (filters?.diversifyPortfolio && playCount > 1) {
      return seleccionarCarteraDiversificada(scoredPairs, playCount);
    }

    return scoredPairs.slice(0, playCount).map(item => item.pair);
  }

  onProgress?.(t('generacion.buscandoNValidas', { generateCount }));

  const validPairs: { combo: number[], stars: number[] }[] = [];
  const maxNumbers = currentGame.maxNumbers;
  const maxStars = currentGame.maxStars;
  const maxAttempts = Math.max(500000, generateCount * 100);
  const selectivity = estimateFilterSelectivity(currentGame, filters, universe);

  for (let i = 0; i < maxAttempts && validPairs.length < generateCount; i++) {
    if (i % 500 === 0) {
      onProgress?.(t('generacion.progresoEncontradas', { found: validPairs.length, generateCount, attempt: i }));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const combo = generateRandomCombination(universe, maxNumbers, currentGame?.id);
    const stars = maxStars > 0 ? generateRandomCombination(availableStars, maxStars, currentGame?.id) : [];
    if (isValidCombination(combo, stars, currentGame, filters, optimizationContext.primes)) {
      validPairs.push({ combo, stars });
    }
  }

  if (validPairs.length === 0) {
    let detail = '';
    if (selectivity) {
      const pctStr = (selectivity.fraction * 100).toFixed(4);
      detail = selectivity.isExact
        ? `Solo ${selectivity.count.toLocaleString('es-ES')} de ${selectivity.total.toLocaleString('es-ES')} combinaciones posibles (${pctStr}%) cumplen estos filtros. `
        : `Se estima que aproximadamente el ${pctStr}% de las combinaciones posibles cumplen estos filtros. `;
    }
    const err = new Error(`No se encontraron combinaciones válidas. ${detail}Intenta flexibilizar los filtros.`);
    (err as any).i18nKey = 'generacion.sinCombinacionesValidas';
    if (selectivity) (err as any).selectivity = selectivity;
    throw err;
  }

  onProgress?.(t('generacion.puntuandoOrdenando'));
  onProgress?.(t('generacion.puntuandoNCombinaciones', { count: validPairs.length }));
  await new Promise(resolve => setTimeout(resolve, 0));

  const scoredPairs = validPairs.map(pair => ({
    pair,
    score: calculateOptimizationScore(pair.combo, pair.stars, optimizationContext)
  }));

  scoredPairs.sort((a, b) => b.score - a.score);

  if (filters?.diversifyPortfolio && playCount > 1) {
    return seleccionarCarteraDiversificada(scoredPairs, playCount);
  }

  return scoredPairs.slice(0, playCount).map(item => item.pair);
}
