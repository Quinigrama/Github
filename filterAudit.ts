import { generateRandomCombination, hasGeometricPattern, isSpaced } from './geometry';

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
    entropyTerminaciones: { name: 'Entropía (Terminaciones)', count: 0, passed: 0, percent: 100 },
    entropyIntervalos: { name: 'Entropía (Intervalos)', count: 0, passed: 0, percent: 100 },
    geometric: { name: 'Exclusión Geométrica', count: 0, passed: 0, percent: 100 }
  };

  if (maxStars > 0) {
    results.starSum = { name: 'Suma de Estrellas', count: 0, passed: 0, percent: 100 };
    results.starParImpar = { name: 'Estrellas Par/Impar', count: 0, passed: 0, percent: 100 };
    results.starBajosAltos = { name: 'Estrellas Bajos/Altos', count: 0, passed: 0, percent: 100 };
    results.starSumaDigitos = { name: 'Estrellas Suma de Dígitos', count: 0, passed: 0, percent: 100 };
    results.starPrimos = { name: 'Estrellas Primos', count: 0, passed: 0, percent: 100 };
    results.starConsecutivos = { name: 'Estrellas Consecutivas', count: 0, passed: 0, percent: 100 };
    results.starDistancia = { name: 'Estrellas Distancia', count: 0, passed: 0, percent: 100 };
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

    // Distancia
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
      if (filters.geometric.exclude && filters.geometric.exclude.length > 0) {
        if (hasGeometricPattern(combo, filters.geometric.exclude, currentGame.gridCols)) comboPassed = false;
      }
      if (filters.geometric.favor && filters.geometric.favor.includes('espaciados')) {
        if (!isSpaced(combo, currentGame.gridCols)) comboPassed = false;
      }
      if (comboPassed) results.geometric.passed++;
    }

    // Stars
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
