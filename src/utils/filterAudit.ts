import { generateRandomCombination, hasGeometricPattern, isSpaced, getCoordsLookup } from './geometry';

export interface FilterComparisonItem {
  id: string;
  name: string;
  configured: string;
  actual: string;
  passed: boolean;
}

export interface AuditResultCategory {
  name: string;
  count: number;
  passed: number;
  percent: number;
}

export interface FilterAuditOutput {
  results: Record<string, AuditResultCategory>;
  actualSampleSize: number;
}

export function runFilterAudit(
  sampleSize: number = 500,
  availableUniverse: number[],
  availableStars: number[],
  currentGame: {
    maxNumbers: number;
    maxStars: number;
    numberRange: number;
    starRange: number;
    gridCols: number;
    id: string;
    numbersLayout?: any;
    numbersStartAt?: number;
    startAt?: number;
  },
  filters: any,
  primes: Set<number>
): FilterAuditOutput {
  const maxNumbers = currentGame.maxNumbers;
  const maxStars = currentGame.maxStars;

  const results: Record<string, AuditResultCategory> = {
    sum: { name: 'Rango de Suma Total', count: 0, passed: 0, percent: 100 },
    terminacionesDistintas: { name: 'Variedad de Terminaciones', count: 0, passed: 0, percent: 100 },
    parImpar: { name: 'Balance Par/Impar', count: 0, passed: 0, percent: 100 },
    bajosAltos: { name: 'Balance Bajos/Altos', count: 0, passed: 0, percent: 100 },
    primos: { name: 'Cantidad de Primos', count: 0, passed: 0, percent: 100 },
    distancia: { name: 'Distancia entre Números', count: 0, passed: 0, percent: 100 },
    sumaDigitos: { name: 'Suma de Dígitos', count: 0, passed: 0, percent: 100 },
    consecutivos: { name: 'Bloques Consecutivos', count: 0, passed: 0, percent: 100 },
    agrupDecenas: { name: 'Agrupación por Decenas', count: 0, passed: 0, percent: 100 },
    desviacion: { name: 'Desviación Estándar', count: 0, passed: 0, percent: 100 },
    positionRange: { name: 'Rango Óptimo por Posición', count: 0, passed: 0, percent: 100 },
    entropyTerminaciones: { name: 'Entropía (Terminaciones)', count: 0, passed: 0, percent: 100 },
    entropyIntervalos: { name: 'Entropía (Intervalos)', count: 0, passed: 0, percent: 100 },
    geometric: { name: 'Exclusión Geométrica', count: 0, passed: 0, percent: 100 },
    excluirDecenas: { name: 'Exclusión de Decenas', count: 0, passed: 0, percent: 100 },
    excluirTerminaciones: { name: 'Exclusión de Terminaciones', count: 0, passed: 0, percent: 100 }
  };

  if (maxStars > 0) {
    results.excluirStarDecades = { name: 'Exclusión de Decenas (Estrellas)', count: 0, passed: 0, percent: 100 };
    results.starSum = { name: 'Suma de Estrellas', count: 0, passed: 0, percent: 100 };
    results.starParImpar = { name: 'Estrellas Par/Impar', count: 0, passed: 0, percent: 100 };
    results.starBajosAltos = { name: 'Estrellas Bajos/Altos', count: 0, passed: 0, percent: 100 };
    results.starSumaDigitos = { name: 'Estrellas Suma de Dígitos', count: 0, passed: 0, percent: 100 };
    results.starPrimos = { name: 'Estrellas Primos', count: 0, passed: 0, percent: 100 };
    results.starConsecutivos = { name: 'Estrellas Consecutivas', count: 0, passed: 0, percent: 100 };
    results.starDistancia = { name: 'Estrellas Distancia', count: 0, passed: 0, percent: 100 };
    if (maxStars >= 2) {
      results.starPositionRange = { name: 'Rango Óptimo por Posición (Estrellas)', count: 0, passed: 0, percent: 100 };
    }
  }

  let actualSampleSize = 0;
  for (let i = 0; i < sampleSize; i++) {
    const combo = generateRandomCombination(availableUniverse, maxNumbers, currentGame.id);
    const stars = maxStars > 0 ? generateRandomCombination(availableStars, maxStars, currentGame.id) : [];
    if (combo.length !== maxNumbers) continue;
    if (maxStars > 0 && stars.length !== maxStars) continue;

    actualSampleSize++;

    // Examen de Suma
    let sum = 0;
    for (let j = 0; j < maxNumbers; j++) sum += combo[j];
    if (filters.sum) {
      results.sum.count++;
      if (sum >= filters.sum.min && sum <= filters.sum.max) results.sum.passed++;
    }

    // Variedad terminaciones
    if (filters.terminacionesDistintas && filters.terminacionesDistintas.length > 0) {
      results.terminacionesDistintas.count++;
      const uniqueEndings = new Set(combo.map(n => n % 10)).size;
      if (filters.terminacionesDistintas.includes(uniqueEndings)) results.terminacionesDistintas.passed++;
    }

    // Par Impar
    if (filters.parImpar && filters.parImpar.length > 0) {
      results.parImpar.count++;
      const evens = combo.filter(n => n % 2 === 0).length;
      const parImparKey = `${evens}/${maxNumbers - evens}`;
      if (filters.parImpar.includes(parImparKey)) results.parImpar.passed++;
    }

    // Bajos Altos
    if (filters.bajosAltos && filters.bajosAltos.length > 0) {
      results.bajosAltos.count++;
      const midPoint = Math.floor(currentGame.numberRange / 2);
      const lows = combo.filter(n => n <= midPoint).length;
      const bajosAltosKey = `${lows}/${maxNumbers - lows}`;
      if (filters.bajosAltos.includes(bajosAltosKey)) results.bajosAltos.passed++;
    }

    // Primos
    if (filters.primos) {
      results.primos.count++;
      const primesCount = combo.filter(n => primes.has(n)).length;
      if (primesCount >= filters.primos.min && primesCount <= filters.primos.max) results.primos.passed++;
    }

    // Distancia: comprobar que TODAS las distancias consecutivas estén dentro del rango,
    // coincidiendo con el cálculo histórico corregido y con combinationValidator.ts.
    if (filters.distancia) {
      results.distancia.count++;
      const sortedCombo = [...combo].sort((a, b) => a - b);
      let passDist = true;
      for (let j = 0; j < sortedCombo.length - 1; j++) {
        const diff = sortedCombo[j + 1] - sortedCombo[j];
        if (diff < filters.distancia.min || diff > filters.distancia.max) {
          passDist = false;
          break;
        }
      }
      if (passDist) results.distancia.passed++;
    }

    // Suma Digitos
    if (filters.sumaDigitos) {
      results.sumaDigitos.count++;
      const digitSum = combo.reduce((s, num) => s + (num < 10 ? num : (num % 10 + Math.floor(num / 10))), 0);
      if (digitSum >= filters.sumaDigitos.min && digitSum <= filters.sumaDigitos.max) results.sumaDigitos.passed++;
    }

    // Consecutivos
    if (filters.consecutivos && filters.consecutivos.length > 0) {
      results.consecutivos.count++;
      const sorted = [...combo].sort((a, b) => a - b);
      let consecutivePattern = '';
      let count = 1;
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] === sorted[j - 1] + 1) {
          count++;
        } else {
          consecutivePattern += count;
          count = 1;
        }
      }
      consecutivePattern += count;
      const consecPatternSorted = consecutivePattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
      if (filters.consecutivos.includes(consecPatternSorted)) results.consecutivos.passed++;
    }

    // Decenas
    if (filters.agrupDecenas && filters.agrupDecenas.length > 0) {
      results.agrupDecenas.count++;
      const tens: Record<number, number> = {};
      combo.forEach(n => {
        const ten = Math.floor((n - 1) / 10);
        tens[ten] = (tens[ten] || 0) + 1;
      });
      const tensGroups = Object.values(tens).sort((a, b) => b - a).join('/');
      if (filters.agrupDecenas.includes(tensGroups)) results.agrupDecenas.passed++;
    }

    // Desviacion
    if (filters.desviacion) {
      results.desviacion.count++;
      const mean = sum / maxNumbers;
      const stdDev = Math.sqrt(combo.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / maxNumbers);
      if (stdDev >= filters.desviacion.min && stdDev <= filters.desviacion.max) results.desviacion.passed++;
    }

    // Rango Óptimo por Posición
    if (currentGame.id !== 'nacional' && filters.positionRange?.enabled && Array.isArray(filters.positionRange.ranges)) {
      results.positionRange.count++;
      const sorted = [...combo].sort((a, b) => a - b);
      const ok = filters.positionRange.ranges.every((r: any) => {
        const val = sorted[r.position - 1];
        return val === undefined || (val >= r.min && val <= r.max);
      });
      if (ok) results.positionRange.passed++;
    }

    // Entropía de Terminaciones
    if (filters.entropyTerminaciones) {
      results.entropyTerminaciones.count++;
      const endingCounts: Record<number, number> = {};
      combo.forEach(n => {
        const ending = n % 10;
        endingCounts[ending] = (endingCounts[ending] || 0) + 1;
      });
      const entropyTerm = -Object.values(endingCounts).reduce((s, countVal) => {
        const p = countVal / maxNumbers;
        return s + p * Math.log2(p);
      }, 0);
      if (entropyTerm >= filters.entropyTerminaciones.min && entropyTerm <= filters.entropyTerminaciones.max) {
        results.entropyTerminaciones.passed++;
      }
    }

    // Entropía de Intervalos
    if (filters.entropyIntervalos) {
      results.entropyIntervalos.count++;
      const sortedCombo = [...combo].sort((a, b) => a - b);
      const intervalCounts: Record<number, number> = {};
      for (let idx = 0; idx < sortedCombo.length - 1; idx++) {
        const diff = sortedCombo[idx + 1] - sortedCombo[idx];
        intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
      }
      const numIntervals = maxNumbers - 1;
      const entropyInt = -Object.values(intervalCounts).reduce((s, countVal) => {
        const p = countVal / numIntervals;
        return s + p * Math.log2(p);
      }, 0);
      if (entropyInt >= filters.entropyIntervalos.min && entropyInt <= filters.entropyIntervalos.max) {
        results.entropyIntervalos.passed++;
      }
    }

    // Geometric
    const hasGeomActive = (filters.geometric &&
      ((filters.geometric.exclude && filters.geometric.exclude.length > 0) ||
        (filters.geometric.favor && filters.geometric.favor.length > 0)));
    if (hasGeomActive) {
      results.geometric.count++;
      let comboPassed = true;
      const coordsLookup = currentGame.numbersLayout
        ? getCoordsLookup(currentGame.numbersLayout, currentGame.numberRange, currentGame.startAt ?? currentGame.numbersStartAt ?? 1)
        : (currentGame.gridCols || 7);
      if (filters.geometric.exclude && filters.geometric.exclude.length > 0) {
        if (hasGeometricPattern(combo, filters.geometric.exclude, coordsLookup)) comboPassed = false;
      }
      if (filters.geometric.favor && filters.geometric.favor.includes('espaciados')) {
        if (!isSpaced(combo, coordsLookup)) comboPassed = false;
      }
      if (comboPassed) results.geometric.passed++;
    }

    // Exclusión de Decenas
    if (filters.excluirDecenas && Array.isArray(filters.excluirDecenas) && filters.excluirDecenas.length > 0) {
      results.excluirDecenas.count++;
      const hasExcludedDecade = combo.some(n => {
        const dec = Math.floor((n - 1) / 10);
        return filters.excluirDecenas.includes(dec);
      });
      if (!hasExcludedDecade) results.excluirDecenas.passed++;
    }

    // Exclusión de Terminaciones
    if (filters.excluirTerminaciones && Array.isArray(filters.excluirTerminaciones) && filters.excluirTerminaciones.length > 0) {
      results.excluirTerminaciones.count++;
      const hasExcludedEnding = combo.some(n => filters.excluirTerminaciones.includes(n % 10));
      if (!hasExcludedEnding) results.excluirTerminaciones.passed++;
    }

    // Stars
    if (maxStars > 0) {
      if (filters.excluirStarDecades && Array.isArray(filters.excluirStarDecades) && filters.excluirStarDecades.length > 0) {
        results.excluirStarDecades.count++;
        const hasExcludedStarDecade = stars.some(s => {
          const dec = Math.floor((s - 1) / 10);
          return filters.excluirStarDecades.includes(dec);
        });
        if (!hasExcludedStarDecade) results.excluirStarDecades.passed++;
      }
    }

    if (maxStars > 1) {
      const starSum = stars.reduce((a, b) => a + b, 0);
      if (filters.starSum) {
        results.starSum.count++;
        if (starSum >= filters.starSum.min && starSum <= filters.starSum.max) results.starSum.passed++;
      }
      if (filters.starParImpar && filters.starParImpar.length > 0) {
        results.starParImpar.count++;
        const starEvens = stars.filter(n => n % 2 === 0).length;
        const starParImparKey = `${starEvens}/${maxStars - starEvens}`;
        if (filters.starParImpar.includes(starParImparKey)) results.starParImpar.passed++;
      }
      if (filters.starBajosAltos && filters.starBajosAltos.length > 0) {
        results.starBajosAltos.count++;
        const starMid = Math.floor(currentGame.starRange / 2);
        const starLows = stars.filter(n => n <= starMid).length;
        const starBajosAltosKey = `${starLows}/${maxStars - starLows}`;
        if (filters.starBajosAltos.includes(starBajosAltosKey)) results.starBajosAltos.passed++;
      }
      if (filters.starSumaDigitos) {
        results.starSumaDigitos.count++;
        let starDigitSum = 0;
        stars.forEach(s => {
          const sStr = s.toString();
          for (let j = 0; j < sStr.length; j++) starDigitSum += parseInt(sStr[j]);
        });
        if (starDigitSum >= filters.starSumaDigitos.min && starDigitSum <= filters.starSumaDigitos.max) results.starSumaDigitos.passed++;
      }
      if (filters.starPrimos) {
        results.starPrimos.count++;
        const starPrimosVal = stars.filter(n => primes.has(n)).length;
        if (starPrimosVal >= filters.starPrimos.min && starPrimosVal <= filters.starPrimos.max) results.starPrimos.passed++;
      }
      if (filters.starConsecutivos && filters.starConsecutivos.length > 0) {
        results.starConsecutivos.count++;
        const sortedStars = [...stars].sort((a, b) => a - b);
        let starConsecPattern = '';
        let sCount = 1;
        for (let j = 1; j < sortedStars.length; j++) {
          if (sortedStars[j] === sortedStars[j - 1] + 1) {
            sCount++;
          } else {
            starConsecPattern += sCount;
            sCount = 1;
          }
        }
        starConsecPattern += sCount;
        const starConsecPatternSorted = starConsecPattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
        if (filters.starConsecutivos.includes(starConsecPatternSorted)) results.starConsecutivos.passed++;
      }
      if (filters.starDistancia) {
        results.starDistancia.count++;
        const sortedStars = [...stars].sort((a, b) => a - b);
        let minStarDist = 99;
        for (let j = 0; j < sortedStars.length - 1; j++) {
          const d = sortedStars[j + 1] - sortedStars[j];
          if (d < minStarDist) minStarDist = d;
        }
        if (minStarDist >= filters.starDistancia.min && minStarDist <= filters.starDistancia.max) results.starDistancia.passed++;
      }
      if (currentGame.id !== 'nacional' && maxStars >= 2 && filters.starPositionRange?.enabled && Array.isArray(filters.starPositionRange.ranges)) {
        results.starPositionRange.count++;
        const sortedStars = [...stars].sort((a, b) => a - b);
        const ok = filters.starPositionRange.ranges.every((r: any) => {
          const val = sortedStars[r.position - 1];
          return val === undefined || (val >= r.min && val <= r.max);
        });
        if (ok) results.starPositionRange.passed++;
      }
    }
  }

  for (const key in results) {
    if (results[key].count > 0) {
      results[key].percent = Math.round((results[key].passed / results[key].count) * 100);
    } else {
      results[key].percent = 100;
    }
  }

  return { results, actualSampleSize };
}

export function compareFiltersAgainstCombination(
  winningNumbers: number[],
  winningStars: number[] | undefined,
  filters: any,
  currentGame: {
    maxNumbers: number;
    maxStars: number;
    numberRange: number;
    starRange: number;
    gridCols: number;
    id: string;
    numbersLayout?: any;
    numbersStartAt?: number;
    startAt?: number;
  },
  primes: Set<number>
): FilterComparisonItem[] {
  const items: FilterComparisonItem[] = [];
  if (!winningNumbers || winningNumbers.length === 0 || !filters) return items;

  const maxNumbers = currentGame.maxNumbers || winningNumbers.length;
  const maxStars = currentGame.maxStars || 0;

  // 1. Rango de Suma Total
  if (filters.sum) {
    const sum = winningNumbers.reduce((a, b) => a + b, 0);
    const passed = sum >= filters.sum.min && sum <= filters.sum.max;
    items.push({
      id: 'sum',
      name: 'Rango de Suma Total',
      configured: `${filters.sum.min} - ${filters.sum.max}`,
      actual: `${sum}`,
      passed
    });
  }

  // 2. Variedad de Terminaciones
  if (filters.terminacionesDistintas && Array.isArray(filters.terminacionesDistintas) && filters.terminacionesDistintas.length > 0) {
    const uniqueEndings = new Set(winningNumbers.map(n => n % 10)).size;
    const passed = filters.terminacionesDistintas.includes(uniqueEndings);
    items.push({
      id: 'terminacionesDistintas',
      name: 'Variedad de Terminaciones',
      configured: filters.terminacionesDistintas.join(', '),
      actual: `${uniqueEndings} distintas`,
      passed
    });
  }

  // 3. Balance Par/Impar
  if (filters.parImpar && Array.isArray(filters.parImpar) && filters.parImpar.length > 0) {
    const evens = winningNumbers.filter(n => n % 2 === 0).length;
    const key = `${evens}/${maxNumbers - evens}`;
    const passed = filters.parImpar.includes(key);
    items.push({
      id: 'parImpar',
      name: 'Balance Par/Impar',
      configured: filters.parImpar.join(', '),
      actual: key,
      passed
    });
  }

  // 4. Balance Bajos/Altos
  if (filters.bajosAltos && Array.isArray(filters.bajosAltos) && filters.bajosAltos.length > 0) {
    const midPoint = Math.floor(currentGame.numberRange / 2);
    const lows = winningNumbers.filter(n => n <= midPoint).length;
    const key = `${lows}/${maxNumbers - lows}`;
    const passed = filters.bajosAltos.includes(key);
    items.push({
      id: 'bajosAltos',
      name: 'Balance Bajos/Altos',
      configured: filters.bajosAltos.join(', '),
      actual: key,
      passed
    });
  }

  // 5. Cantidad de Primos
  if (filters.primos) {
    const primesCount = winningNumbers.filter(n => primes.has(n)).length;
    const passed = primesCount >= filters.primos.min && primesCount <= filters.primos.max;
    items.push({
      id: 'primos',
      name: 'Cantidad de Primos',
      configured: `${filters.primos.min} - ${filters.primos.max}`,
      actual: `${primesCount}`,
      passed
    });
  }

  // 6. Distancia entre Números
  if (filters.distancia) {
    const sorted = [...winningNumbers].sort((a, b) => a - b);
    let passDist = true;
    const dists: number[] = [];
    for (let j = 0; j < sorted.length - 1; j++) {
      const diff = sorted[j + 1] - sorted[j];
      dists.push(diff);
      if (diff < filters.distancia.min || diff > filters.distancia.max) {
        passDist = false;
      }
    }
    const distRangeStr = dists.length > 0 ? `${Math.min(...dists)} a ${Math.max(...dists)}` : '-';
    items.push({
      id: 'distancia',
      name: 'Distancia entre Números',
      configured: `${filters.distancia.min} - ${filters.distancia.max}`,
      actual: distRangeStr,
      passed: passDist
    });
  }

  // 7. Suma de Dígitos
  if (filters.sumaDigitos) {
    const digitSum = winningNumbers.reduce((s, num) => s + (num < 10 ? num : (num % 10 + Math.floor(num / 10))), 0);
    const passed = digitSum >= filters.sumaDigitos.min && digitSum <= filters.sumaDigitos.max;
    items.push({
      id: 'sumaDigitos',
      name: 'Suma de Dígitos',
      configured: `${filters.sumaDigitos.min} - ${filters.sumaDigitos.max}`,
      actual: `${digitSum}`,
      passed
    });
  }

  // 8. Bloques Consecutivos
  if (filters.consecutivos && Array.isArray(filters.consecutivos) && filters.consecutivos.length > 0) {
    const sorted = [...winningNumbers].sort((a, b) => a - b);
    let consecutivePattern = '';
    let count = 1;
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j] === sorted[j - 1] + 1) {
        count++;
      } else {
        consecutivePattern += count;
        count = 1;
      }
    }
    consecutivePattern += count;
    const consecPatternSorted = consecutivePattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    const passed = filters.consecutivos.includes(consecPatternSorted);
    items.push({
      id: 'consecutivos',
      name: 'Bloques Consecutivos',
      configured: filters.consecutivos.join(', '),
      actual: consecPatternSorted,
      passed
    });
  }

  // 9. Agrupación por Decenas
  if (filters.agrupDecenas && Array.isArray(filters.agrupDecenas) && filters.agrupDecenas.length > 0) {
    const tens: Record<number, number> = {};
    winningNumbers.forEach(n => {
      const ten = Math.floor((n - 1) / 10);
      tens[ten] = (tens[ten] || 0) + 1;
    });
    const tensGroups = Object.values(tens).sort((a, b) => b - a).join('/');
    const passed = filters.agrupDecenas.includes(tensGroups);
    items.push({
      id: 'agrupDecenas',
      name: 'Agrupación por Decenas',
      configured: filters.agrupDecenas.join(', '),
      actual: tensGroups,
      passed
    });
  }

  // 10. Desviación Estándar
  if (filters.desviacion) {
    const sum = winningNumbers.reduce((a, b) => a + b, 0);
    const mean = sum / maxNumbers;
    const stdDev = Math.sqrt(winningNumbers.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / maxNumbers);
    const passed = stdDev >= filters.desviacion.min && stdDev <= filters.desviacion.max;
    items.push({
      id: 'desviacion',
      name: 'Desviación Estándar',
      configured: `${filters.desviacion.min} - ${filters.desviacion.max}`,
      actual: stdDev.toFixed(2),
      passed
    });
  }

  // 11. Rango Óptimo por Posición
  if (currentGame.id !== 'nacional' && filters.positionRange?.enabled && Array.isArray(filters.positionRange.ranges)) {
    const sorted = [...winningNumbers].sort((a, b) => a - b);
    const ok = filters.positionRange.ranges.every((r: any) => {
      const val = sorted[r.position - 1];
      return val === undefined || (val >= r.min && val <= r.max);
    });
    items.push({
      id: 'positionRange',
      name: 'Rango Óptimo por Posición',
      configured: `${filters.positionRange.ranges.length} posiciones`,
      actual: sorted.join(', '),
      passed: ok
    });
  }

  // 12. Entropía (Terminaciones)
  if (filters.entropyTerminaciones) {
    const endingCounts: Record<number, number> = {};
    winningNumbers.forEach(n => {
      const ending = n % 10;
      endingCounts[ending] = (endingCounts[ending] || 0) + 1;
    });
    const entropyTerm = -Object.values(endingCounts).reduce((s, countVal) => {
      const p = countVal / maxNumbers;
      return s + p * Math.log2(p);
    }, 0);
    const passed = entropyTerm >= filters.entropyTerminaciones.min && entropyTerm <= filters.entropyTerminaciones.max;
    items.push({
      id: 'entropyTerminaciones',
      name: 'Entropía (Terminaciones)',
      configured: `${filters.entropyTerminaciones.min} - ${filters.entropyTerminaciones.max}`,
      actual: entropyTerm.toFixed(2),
      passed
    });
  }

  // 13. Entropía (Intervalos)
  if (filters.entropyIntervalos) {
    const sortedCombo = [...winningNumbers].sort((a, b) => a - b);
    const intervalCounts: Record<number, number> = {};
    for (let idx = 0; idx < sortedCombo.length - 1; idx++) {
      const diff = sortedCombo[idx + 1] - sortedCombo[idx];
      intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
    }
    const numIntervals = maxNumbers - 1;
    const entropyInt = -Object.values(intervalCounts).reduce((s, countVal) => {
      const p = countVal / numIntervals;
      return s + p * Math.log2(p);
    }, 0);
    const passed = entropyInt >= filters.entropyIntervalos.min && entropyInt <= filters.entropyIntervalos.max;
    items.push({
      id: 'entropyIntervalos',
      name: 'Entropía (Intervalos)',
      configured: `${filters.entropyIntervalos.min} - ${filters.entropyIntervalos.max}`,
      actual: entropyInt.toFixed(2),
      passed
    });
  }

  // 14. Exclusión Geométrica
  const hasGeomActive = (filters.geometric &&
    ((filters.geometric.exclude && filters.geometric.exclude.length > 0) ||
      (filters.geometric.favor && filters.geometric.favor.length > 0)));
  if (hasGeomActive) {
    let comboPassed = true;
    const coordsLookup = currentGame.numbersLayout
      ? getCoordsLookup(currentGame.numbersLayout, currentGame.numberRange, currentGame.startAt ?? currentGame.numbersStartAt ?? 1)
      : (currentGame.gridCols || 7);
    if (filters.geometric.exclude && filters.geometric.exclude.length > 0) {
      if (hasGeometricPattern(winningNumbers, filters.geometric.exclude, coordsLookup)) comboPassed = false;
    }
    if (filters.geometric.favor && filters.geometric.favor.includes('espaciados')) {
      if (!isSpaced(winningNumbers, coordsLookup)) comboPassed = false;
    }
    items.push({
      id: 'geometric',
      name: 'Exclusión Geométrica',
      configured: `${filters.geometric.exclude?.join(', ') || ''} ${filters.geometric.favor?.includes('espaciados') ? '(Espaciados)' : ''}`.trim(),
      actual: comboPassed ? 'Válido' : 'Patrón detectado',
      passed: comboPassed
    });
  }

  // 15. Exclusión de Decenas
  if (filters.excluirDecenas && Array.isArray(filters.excluirDecenas) && filters.excluirDecenas.length > 0) {
    const hasExcludedDecade = winningNumbers.some(n => {
      const dec = Math.floor((n - 1) / 10);
      return filters.excluirDecenas.includes(dec);
    });
    const foundDecades = Array.from(new Set(winningNumbers.map(n => Math.floor((n - 1) / 10)).filter(d => filters.excluirDecenas.includes(d))));
    items.push({
      id: 'excluirDecenas',
      name: 'Exclusión de Decenas',
      configured: filters.excluirDecenas.map((d: number) => `D${d}`).join(', '),
      actual: foundDecades.length > 0 ? `Contiene D${foundDecades.join(', D')}` : 'Sin decenas excluidas',
      passed: !hasExcludedDecade
    });
  }

  // 16. Exclusión de Terminaciones
  if (filters.excluirTerminaciones && Array.isArray(filters.excluirTerminaciones) && filters.excluirTerminaciones.length > 0) {
    const hasExcludedEnding = winningNumbers.some(n => filters.excluirTerminaciones.includes(n % 10));
    const foundEndings = Array.from(new Set(winningNumbers.map(n => n % 10).filter(t => filters.excluirTerminaciones.includes(t))));
    items.push({
      id: 'excluirTerminaciones',
      name: 'Exclusión de Terminaciones',
      configured: filters.excluirTerminaciones.map((t: number) => `*${t}`).join(', '),
      actual: foundEndings.length > 0 ? `Contiene *${foundEndings.join(', *')}` : 'Sin terminaciones excluidas',
      passed: !hasExcludedEnding
    });
  }

  // 17. Stars
  if (maxStars > 0 && Array.isArray(winningStars) && winningStars.length > 0) {
    if (filters.excluirStarDecades && Array.isArray(filters.excluirStarDecades) && filters.excluirStarDecades.length > 0) {
      const hasExcludedStarDecade = winningStars.some(s => {
        const dec = Math.floor((s - 1) / 10);
        return filters.excluirStarDecades.includes(dec);
      });
      items.push({
        id: 'excluirStarDecades',
        name: 'Exclusión de Decenas (Estrellas)',
        configured: filters.excluirStarDecades.map((d: number) => `D${d}`).join(', '),
        actual: hasExcludedStarDecade ? 'Contiene decenas excluidas' : 'Sin decenas excluidas',
        passed: !hasExcludedStarDecade
      });
    }

    if (maxStars > 1) {
      const starSum = winningStars.reduce((a, b) => a + b, 0);
      if (filters.starSum) {
        items.push({
          id: 'starSum',
          name: 'Suma de Estrellas',
          configured: `${filters.starSum.min} - ${filters.starSum.max}`,
          actual: `${starSum}`,
          passed: starSum >= filters.starSum.min && starSum <= filters.starSum.max
        });
      }

      if (filters.starParImpar && Array.isArray(filters.starParImpar) && filters.starParImpar.length > 0) {
        const starEvens = winningStars.filter(n => n % 2 === 0).length;
        const starParImparKey = `${starEvens}/${maxStars - starEvens}`;
        items.push({
          id: 'starParImpar',
          name: 'Estrellas Par/Impar',
          configured: filters.starParImpar.join(', '),
          actual: starParImparKey,
          passed: filters.starParImpar.includes(starParImparKey)
        });
      }

      if (filters.starBajosAltos && Array.isArray(filters.starBajosAltos) && filters.starBajosAltos.length > 0) {
        const starMid = Math.floor(currentGame.starRange / 2);
        const starLows = winningStars.filter(n => n <= starMid).length;
        const starBajosAltosKey = `${starLows}/${maxStars - starLows}`;
        items.push({
          id: 'starBajosAltos',
          name: 'Estrellas Bajos/Altos',
          configured: filters.starBajosAltos.join(', '),
          actual: starBajosAltosKey,
          passed: filters.starBajosAltos.includes(starBajosAltosKey)
        });
      }

      if (filters.starSumaDigitos) {
        let starDigitSum = 0;
        winningStars.forEach(s => {
          const sStr = s.toString();
          for (let j = 0; j < sStr.length; j++) starDigitSum += parseInt(sStr[j]);
        });
        items.push({
          id: 'starSumaDigitos',
          name: 'Estrellas Suma de Dígitos',
          configured: `${filters.starSumaDigitos.min} - ${filters.starSumaDigitos.max}`,
          actual: `${starDigitSum}`,
          passed: starDigitSum >= filters.starSumaDigitos.min && starDigitSum <= filters.starSumaDigitos.max
        });
      }

      if (filters.starPrimos) {
        const starPrimosVal = winningStars.filter(n => primes.has(n)).length;
        items.push({
          id: 'starPrimos',
          name: 'Estrellas Primos',
          configured: `${filters.starPrimos.min} - ${filters.starPrimos.max}`,
          actual: `${starPrimosVal}`,
          passed: starPrimosVal >= filters.starPrimos.min && starPrimosVal <= filters.starPrimos.max
        });
      }

      if (filters.starConsecutivos && Array.isArray(filters.starConsecutivos) && filters.starConsecutivos.length > 0) {
        const sortedStars = [...winningStars].sort((a, b) => a - b);
        let starConsecPattern = '';
        let sCount = 1;
        for (let j = 1; j < sortedStars.length; j++) {
          if (sortedStars[j] === sortedStars[j - 1] + 1) {
            sCount++;
          } else {
            starConsecPattern += sCount;
            sCount = 1;
          }
        }
        starConsecPattern += sCount;
        const starConsecPatternSorted = starConsecPattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
        items.push({
          id: 'starConsecutivos',
          name: 'Estrellas Consecutivas',
          configured: filters.starConsecutivos.join(', '),
          actual: starConsecPatternSorted,
          passed: filters.starConsecutivos.includes(starConsecPatternSorted)
        });
      }

      if (filters.starDistancia) {
        const sortedStars = [...winningStars].sort((a, b) => a - b);
        let minStarDist = 99;
        for (let j = 0; j < sortedStars.length - 1; j++) {
          const d = sortedStars[j + 1] - sortedStars[j];
          if (d < minStarDist) minStarDist = d;
        }
        items.push({
          id: 'starDistancia',
          name: 'Estrellas Distancia',
          configured: `${filters.starDistancia.min} - ${filters.starDistancia.max}`,
          actual: `${minStarDist}`,
          passed: minStarDist >= filters.starDistancia.min && minStarDist <= filters.starDistancia.max
        });
      }

      if (currentGame.id !== 'nacional' && filters.starPositionRange?.enabled && Array.isArray(filters.starPositionRange.ranges)) {
        const sortedStars = [...winningStars].sort((a, b) => a - b);
        const ok = filters.starPositionRange.ranges.every((r: any) => {
          const val = sortedStars[r.position - 1];
          return val === undefined || (val >= r.min && val <= r.max);
        });
        items.push({
          id: 'starPositionRange',
          name: 'Rango Óptimo por Posición (Estrellas)',
          configured: `${filters.starPositionRange.ranges.length} posiciones`,
          actual: sortedStars.join(', '),
          passed: ok
        });
      }
    }
  }

  return items;
}

export interface FilterAggregateStat {
  id: string;
  name: string;
  totalEvaluated: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
}

export function aggregateFilterStats(allTicketResults: FilterComparisonItem[][]): FilterAggregateStat[] {
  const statsMap: Record<string, { id: string; name: string; totalEvaluated: number; passedCount: number; failedCount: number; }> = {};

  for (const ticketResults of allTicketResults) {
    for (const item of ticketResults) {
      if (!statsMap[item.id]) {
        statsMap[item.id] = {
          id: item.id,
          name: item.name,
          totalEvaluated: 0,
          passedCount: 0,
          failedCount: 0
        };
      }
      statsMap[item.id].totalEvaluated++;
      if (item.passed) {
        statsMap[item.id].passedCount++;
      } else {
        statsMap[item.id].failedCount++;
      }
    }
  }

  const stats: FilterAggregateStat[] = Object.values(statsMap).map(s => ({
    ...s,
    passRate: s.totalEvaluated > 0 ? (s.passedCount / s.totalEvaluated) * 100 : 0
  }));

  // Ordenados de peor a mejor tasa de acierto (menor porcentaje primero)
  stats.sort((a, b) => a.passRate - b.passRate || b.failedCount - a.failedCount);

  return stats;
}
