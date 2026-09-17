/**
 * Algoritmos para distribución y estructuración de terminaciones (reintegros 0-9)
 * en carteras de décimos de Lotería Nacional.
 */

export interface ScoredPairNacional {
  pair: { combo: number[]; stars: number[] };
  score: number;
  ending: number;
}

/**
 * Selecciona una cartera de apuestas respetando el modo de terminaciones elegido:
 * - 'complete_reintegros': Asigna las terminaciones 0-9 para maximizar cobertura y garantizar reintegro
 * - 'consecutive': Selecciona décimos cuyas terminaciones forman secuencias consecutivas (ej. 3, 4, 5, 6...)
 * - 'alternating_parity': Alterna terminaciones pares e impares de forma equilibrada (ej. par, impar, par, impar...)
 * - 'standard': Selección basada en la puntuación individual o diversificación estándar
 */
export function selectNacionalPortfolioByMode(
  scoredPairs: ScoredPairNacional[],
  playCount: number,
  mode: 'complete_reintegros' | 'consecutive' | 'alternating_parity' | 'standard' = 'complete_reintegros'
): { combo: number[]; stars: number[] }[] {
  if (scoredPairs.length === 0) return [];
  if (playCount <= 1 || mode === 'standard') {
    return scoredPairs.slice(0, playCount).map(item => item.pair);
  }

  const usedCombos = new Set<string>();
  const selected: { combo: number[]; stars: number[] }[] = [];

  // Modo 1: Cobertura completa de reintegros (0 al 9)
  if (mode === 'complete_reintegros') {
    for (let ending = 0; ending <= 9 && selected.length < playCount; ending++) {
      const bestForEnding = scoredPairs.find(p => p.ending === ending && !usedCombos.has(p.pair.combo.join('-')));
      if (bestForEnding) {
        selected.push(bestForEnding.pair);
        usedCombos.add(bestForEnding.pair.combo.join('-'));
      }
    }
  }
  // Modo 2: Terminaciones consecutivas en escalera (ej. para 5 décimos: 2, 3, 4, 5, 6)
  else if (mode === 'consecutive') {
    // Buscar la secuencia consecutiva que tenga el mayor score promedio disponible
    let bestStartDigit = 0;
    let bestAvgScore = -Infinity;

    for (let start = 0; start <= 9; start++) {
      let currentSeqScore = 0;
      let validForSeq = true;

      for (let step = 0; step < playCount; step++) {
        const targetEnding = (start + step) % 10;
        const candidate = scoredPairs.find(p => p.ending === targetEnding);
        if (candidate) {
          currentSeqScore += candidate.score;
        } else {
          validForSeq = false;
          break;
        }
      }

      if (validForSeq && currentSeqScore > bestAvgScore) {
        bestAvgScore = currentSeqScore;
        bestStartDigit = start;
      }
    }

    // Insertar la secuencia encontrada
    for (let step = 0; step < playCount; step++) {
      const targetEnding = (bestStartDigit + step) % 10;
      const bestCandidate = scoredPairs.find(p => p.ending === targetEnding && !usedCombos.has(p.pair.combo.join('-')));
      if (bestCandidate) {
        selected.push(bestCandidate.pair);
        usedCombos.add(bestCandidate.pair.combo.join('-'));
      }
    }
  }
  // Modo 3: Terminaciones alternas par/impar (ej. 2, 5, 4, 7, 0, 9...)
  else if (mode === 'alternating_parity') {
    const evens = scoredPairs.filter(p => p.ending % 2 === 0);
    const odds = scoredPairs.filter(p => p.ending % 2 !== 0);

    let evenIdx = 0;
    let oddIdx = 0;

    for (let i = 0; i < playCount; i++) {
      const wantEven = i % 2 === 0;
      if (wantEven && evenIdx < evens.length) {
        const item = evens[evenIdx++];
        if (!usedCombos.has(item.pair.combo.join('-'))) {
          selected.push(item.pair);
          usedCombos.add(item.pair.combo.join('-'));
        }
      } else if (!wantEven && oddIdx < odds.length) {
        const item = odds[oddIdx++];
        if (!usedCombos.has(item.pair.combo.join('-'))) {
          selected.push(item.pair);
          usedCombos.add(item.pair.combo.join('-'));
        }
      }
    }
  }

  // Si quedan plazas por llenar (porque algún dígito o secuencia no tenía candidatos), rellenar con los mejores restantes
  for (const item of scoredPairs) {
    if (selected.length >= playCount) break;
    const key = item.pair.combo.join('-');
    if (!usedCombos.has(key)) {
      selected.push(item.pair);
      usedCombos.add(key);
    }
  }

  return selected;
}
