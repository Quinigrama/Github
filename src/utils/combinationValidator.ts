import { hasGeometricPattern, isSpaced } from './geometry';
import { passesNashStrictFilter } from './optimizer';

const DEFAULT_PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);

export function isValidCombination(
  combination: number[],
  stars: number[] = [],
  currentGame: any,
  filters: any,
  primes: Set<number> = DEFAULT_PRIMES,
  skipStarCheck: boolean = false,
  historicalData: { numbers: number[] }[] = []
): boolean {
  if (!currentGame || !filters) return true;

  const maxNumbers = currentGame.maxNumbers;
  const maxStars = skipStarCheck ? 0 : currentGame.maxStars;
  
  if (combination.length !== maxNumbers) return false;
  if (maxStars > 0 && stars.length !== maxStars) return false;

  // Filtro de exclusión de coincidencias con categorías principales del histórico
  if (currentGame.id !== 'nacional' && (filters.excludeHistoricalMatchFull || filters.excludeHistoricalMatchNearFull) && historicalData && historicalData.length > 0) {
    const comboSet = new Set(combination);
    for (const draw of historicalData) {
      if (!draw.numbers || draw.numbers.length !== maxNumbers) continue;
      let shared = 0;
      for (const n of draw.numbers) {
        if (comboSet.has(n)) shared++;
      }
      if (filters.excludeHistoricalMatchFull && shared === maxNumbers) return false;
      if (filters.excludeHistoricalMatchNearFull && shared === maxNumbers - 1) return false;
    }
  }

  if (currentGame.id === 'nacional') {
      const colsCount = [0, 0, 0, 0, 0];
      for (let i = 0; i < combination.length; i++) {
          const col = Math.floor(combination[i] / 10) - 1;
          if (col < 0 || col >= 5) return false;
          colsCount[col]++;
      }
      if (colsCount.some(c => c !== 1)) return false;

      // Extract ordered digits
      const sorted = [...combination].sort((a, b) => a - b);
      const digits = sorted.map(num => num % 10);
      const d1 = digits[0];
      const d2 = digits[1];
      const d3 = digits[2];
      const d4 = digits[3];
      const d5 = digits[4];
      const numString = digits.join('');
      const numValue = parseInt(numString, 10);

      const isPrimeNumber = (n: number): boolean => {
          if (n < 2) return false;
          if (n === 2 || n === 3) return true;
          if (n % 2 === 0 || n % 3 === 0) return false;
          const limit = Math.sqrt(n);
          for (let i = 5; i <= limit; i += 6) {
              if (n % i === 0 || n % (i + 2) === 0) return false;
          }
          return true;
      };

      // 1. Suma de dígitos
      if (filters.nacionalSumaDigitos) {
          const sumVal = d1 + d2 + d3 + d4 + d5;
          if (sumVal < filters.nacionalSumaDigitos.min || sumVal > filters.nacionalSumaDigitos.max) return false;
      }

      // 2. Capicúa
      if (filters.nacionalCapicua && filters.nacionalCapicua !== 'all') {
          const isCapicua = d1 === d5 && d2 === d4;
          if (filters.nacionalCapicua === 'yes' && !isCapicua) return false;
          if (filters.nacionalCapicua === 'no' && isCapicua) return false;
      }

      // 3. Primalidad
      if (filters.nacionalPrimo && filters.nacionalPrimo !== 'all') {
          const isPrime = isPrimeNumber(numValue);
          if (filters.nacionalPrimo === 'yes' && !isPrime) return false;
          if (filters.nacionalPrimo === 'no' && isPrime) return false;
      }

      // 4. Cuadrado / Cubo perfecto
      if (filters.nacionalCuadradoCubo && filters.nacionalCuadradoCubo !== 'all') {
          const isSquare = Math.floor(Math.sqrt(numValue)) ** 2 === numValue;
          const isCube = Math.floor(Math.cbrt(numValue)) ** 3 === numValue;
          const isPerf = isSquare || isCube;
          if (filters.nacionalCuadradoCubo === 'yes' && !isPerf) return false;
          if (filters.nacionalCuadradoCubo === 'no' && isPerf) return false;
      }

      // 5. Repdigits
      if (filters.nacionalRepdigits && filters.nacionalRepdigits !== 'all') {
          const isRepdigit = d1 === d2 && d2 === d3 && d3 === d4 && d4 === d5;
          if (filters.nacionalRepdigits === 'yes' && !isRepdigit) return false;
          if (filters.nacionalRepdigits === 'no' && isRepdigit) return false;
      }

      // 6. Múltiplo de N
      if (filters.nacionalMultiploDe && filters.nacionalMultiploDe > 1) {
          if (numValue % filters.nacionalMultiploDe !== 0) return false;
      }

      // 7. Rango por franja
      if (filters.nacionalFranja) {
          if (numValue < filters.nacionalFranja.min || numValue > filters.nacionalFranja.max) return false;
      }

      // 8. Distancia a objetivo
      if (filters.nacionalObjetivo && filters.nacionalDistanciaObjetivo) {
          const targetVal = parseInt(filters.nacionalObjetivo, 10);
          if (!isNaN(targetVal)) {
              const diff = Math.abs(numValue - targetVal);
              if (diff < filters.nacionalDistanciaObjetivo.min || diff > filters.nacionalDistanciaObjetivo.max) return false;
          }
      }

      // 9. Paridad por posición
      if (filters.nacionalParidad) {
          for (let i = 0; i < 5; i++) {
              const rule = filters.nacionalParidad[i];
              if (rule === 'par' && digits[i] % 2 !== 0) return false;
              if (rule === 'imp' && digits[i] % 2 === 0) return false;
          }
      }

      // 10. Alto/bajo por posición
      if (filters.nacionalAltoBajo) {
          for (let i = 0; i < 5; i++) {
              const rule = filters.nacionalAltoBajo[i];
              if (rule === 'bajo' && digits[i] > 4) return false;
              if (rule === 'alto' && digits[i] < 5) return false;
          }
      }

      // 11. Secuencias consecutivas
      let isAsc = true;
      let isDesc = true;
      for (let i = 1; i < 5; i++) {
          if (digits[i] !== digits[i - 1] + 1) isAsc = false;
          if (digits[i] !== digits[i - 1] - 1) isDesc = false;
      }
      if (filters.nacionalConsecutivos && filters.nacionalConsecutivos !== 'all') {
          if (filters.nacionalConsecutivos === 'yes_asc' && !isAsc) return false;
          if (filters.nacionalConsecutivos === 'yes_desc' && !isDesc) return false;
          if (filters.nacionalConsecutivos === 'any_consec' && !isAsc && !isDesc) return false;
          if (filters.nacionalConsecutivos === 'no' && (isAsc || isDesc)) return false;
      }

      // 12. Suma de mitades
      if (filters.nacionalSumaMitades && filters.nacionalSumaMitades !== 'all') {
          const sum1 = d1 + d2;
          const sum2 = d4 + d5;
          if (filters.nacionalSumaMitades === 'equal' && sum1 !== sum2) return false;
          if (filters.nacionalSumaMitades === 'greater' && sum1 <= sum2) return false;
          if (filters.nacionalSumaMitades === 'less' && sum1 >= sum2) return false;
      }

      // 13. Pares/Impares por conteo
      if (filters.nacionalParesConteo && filters.nacionalParesConteo.length > 0) {
          const evensCount = digits.filter(d => d % 2 === 0).length;
          const oddsCount = 5 - evensCount;
          const category = `${evensCount}P/${oddsCount}I`;
          if (!filters.nacionalParesConteo.includes(category)) return false;
      }

      // 14. Altos/Bajos por conteo
      if (filters.nacionalAltosConteo && filters.nacionalAltosConteo.length > 0) {
          const highsCount = digits.filter(d => d >= 5).length;
          const lowsCount = 5 - highsCount;
          const category = `${highsCount}A/${lowsCount}B`;
          if (!filters.nacionalAltosConteo.includes(category)) return false;
      }

      // 15. Variedad de cifras (únicos)
      if (filters.nacionalUnicos && filters.nacionalUnicos.length > 0) {
          const uniqueCount = new Set(digits).size;
          if (!filters.nacionalUnicos.includes(uniqueCount)) return false;
      }

      // 16. Moda (Repeticiones Máximas)
      if (filters.nacionalModaRepeticiones) {
          const counts: { [key: number]: number } = {};
          digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
          const maxRep = Math.max(...Object.values(counts));
          if (maxRep < filters.nacionalModaRepeticiones.min || maxRep > filters.nacionalModaRepeticiones.max) return false;
      }

      // 17. Cantidad de ceros
      if (filters.nacionalCeros && filters.nacionalCeros.length > 0) {
          const zeroCount = digits.filter(d => d === 0).length;
          let zeroKey = String(zeroCount);
          if (zeroCount >= 3) zeroKey = '3+';
          if (!filters.nacionalCeros.includes(zeroKey)) return false;
      }

      // 18. Primos entre dígitos
      if (filters.nacionalPrimosDigitos) {
          const primesSet = new Set([2, 3, 5, 7]);
          const primesCount = digits.filter(d => primesSet.has(d)).length;
          if (primesCount < filters.nacionalPrimosDigitos.min || primesCount > filters.nacionalPrimosDigitos.max) return false;
      }

      // 19. Rango interno
      if (filters.nacionalRangoInterno) {
          const maxVal = Math.max(...digits);
          const minVal = Math.min(...digits);
          const diff = maxVal - minVal;
          if (diff < filters.nacionalRangoInterno.min || diff > filters.nacionalRangoInterno.max) return false;
      }

      // 20. Desviación típica
      if (filters.nacionalDesviacion) {
          const mean = digits.reduce((s, x) => s + x, 0) / 5;
          const variance = digits.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / 5;
          const stdDev = Math.sqrt(variance);
          if (stdDev < filters.nacionalDesviacion.min || stdDev > filters.nacionalDesviacion.max) return false;
      }

      // 21. Entropía de Shannon
      if (filters.nacionalEntropiaDigitos) {
          const counts: { [key: number]: number } = {};
          digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
          let entropy = 0;
          Object.values(counts).forEach(count => {
              const p = count / 5;
              entropy -= p * Math.log2(p);
          });
          entropy = Number(entropy.toFixed(3));
          if (entropy < filters.nacionalEntropiaDigitos.min || entropy > filters.nacionalEntropiaDigitos.max) return false;
      }

      return true; // Passed all Lotería Nacional checks!
  }

  // 0a. EXCLUIR DECENAS Y TERMINACIONES
  if (currentGame.id !== 'nacional') {
      if (filters.excluirDecenas && filters.excluirDecenas.length > 0) {
          for (let i = 0; i < maxNumbers; i++) {
              const decade = Math.floor((combination[i] - 1) / 10);
              if (filters.excluirDecenas.includes(decade)) return false;
          }
      }
      if (filters.excluirTerminaciones && filters.excluirTerminaciones.length > 0) {
          for (let i = 0; i < maxNumbers; i++) {
              const ending = combination[i] % 10;
              if (filters.excluirTerminaciones.includes(ending)) return false;
          }
      }
  }

  if (maxStars > 0 && stars.length === maxStars && filters.excluirStarDecades && filters.excluirStarDecades.length > 0) {
      for (let i = 0; i < maxStars; i++) {
          const decade = Math.floor((stars[i] - 1) / 10);
          if (filters.excluirStarDecades.includes(decade)) return false;
      }
  }

  // 1. SUM: extremely cheap to check
  let sum = 0;
  for (let i = 0; i < maxNumbers; i++) sum += combination[i];
  if (filters.sum) {
      if (sum < filters.sum.min || sum > filters.sum.max) return false;
  }

  // 1b. RANGO ÓPTIMO POR POSICIÓN (Estadísticos de Orden)
  if (currentGame.id !== 'nacional' && filters.positionRange && filters.positionRange.enabled && Array.isArray(filters.positionRange.ranges)) {
      const sortedCombo = [...combination].sort((a, b) => a - b);
      for (const r of filters.positionRange.ranges) {
          const val = sortedCombo[r.position - 1];
          if (val !== undefined && (val < r.min || val > r.max)) return false;
      }
  }

  // 1c. RANGO ÓPTIMO POR POSICIÓN ESTRELLAS
  if (currentGame.id !== 'nacional' && maxStars >= 2 && filters.starPositionRange && filters.starPositionRange.enabled && Array.isArray(filters.starPositionRange.ranges)) {
      const sortedStars = [...stars].sort((a, b) => a - b);
      for (const r of filters.starPositionRange.ranges) {
          const val = sortedStars[r.position - 1];
          if (val !== undefined && (val < r.min || val > r.max)) return false;
      }
  }

  // 2. TERMINACIONES DISTINTAS: very cheap, uses set map
  if (filters.terminacionesDistintas && filters.terminacionesDistintas.length > 0) {
      const uniqueEndings = new Set(combination.map(n => n % 10)).size;
      if (!filters.terminacionesDistintas.includes(uniqueEndings)) return false;
  }

  // 3. PAR IMPAR: very cheap, single-pass loop
  if (filters.parImpar && filters.parImpar.length > 0) {
      const evens = combination.filter(n => n % 2 === 0).length;
      const parImparKey = `${evens}/${maxNumbers - evens}`;
      if (!filters.parImpar.includes(parImparKey)) return false;
  }

  // 4. BAJOS ALTOS: very cheap, single-pass loop
  if (filters.bajosAltos && filters.bajosAltos.length > 0) {
      const midPoint = Math.floor(currentGame.numberRange / 2);
      const lows = combination.filter(n => n <= midPoint).length;
      const bajosAltosKey = `${lows}/${maxNumbers - lows}`;
      if (!filters.bajosAltos.includes(bajosAltosKey)) return false;
  }

  // 5. PRIMOS: cheap set lookups
  if (filters.primos) {
      const primesCount = combination.filter(n => primes.has(n)).length;
      if (primesCount < filters.primos.min || primesCount > filters.primos.max) return false;
  }

  // 6. DISTANCIA: cheap sequential checks
  if (filters.distancia) {
      const sortedCombo = [...combination].sort((a,b) => a-b);
      for (let i = 0; i < sortedCombo.length - 1; i++) {
          const diff = sortedCombo[i+1] - sortedCombo[i];
          if (diff < filters.distancia.min || diff > filters.distancia.max) return false;
      }
  }

  // 7. SUMA DÍGITOS: moderately cheap single-pass
  if (filters.sumaDigitos) {
      const digitSum = combination.reduce((sumVal, num) => sumVal + (num < 10 ? num : (num % 10 + Math.floor(num/10))), 0);
      if (digitSum < filters.sumaDigitos.min || digitSum > filters.sumaDigitos.max) return false;
  }

  // 8. CONSECUTIVOS: sorting and simple match
  if (filters.consecutivos && filters.consecutivos.length > 0) {
      const sorted = [...combination].sort((a,b)=>a-b);
      let consecutivePattern = '';
      let count = 1;
      for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === sorted[i-1] + 1) {
              count++;
          } else {
              consecutivePattern += count;
              count = 1;
          }
      }
      consecutivePattern += count;
      const consecPatternSorted = consecutivePattern.split('').sort((a,b)=>Number(b)-Number(a)).join('/');
      if (!filters.consecutivos.includes(consecPatternSorted)) return false;
  }

  // 9. AGRUPAMIENTO DECENAS: decade groupings
  if (filters.agrupDecenas && filters.agrupDecenas.length > 0) {
      const tens: { [key: number]: number } = {};
      combination.forEach(n => {
          const ten = Math.floor((n-1)/10);
          tens[ten] = (tens[ten] || 0) + 1;
      });
      const tensGroups = Object.values(tens).sort((a,b)=>b-a).join('/');
      if (!filters.agrupDecenas.includes(tensGroups)) return false;
  }

  // 10. DESVIACIÓN ESTÁNDAR: computationally heavier
  if (filters.desviacion) {
      const mean = sum / maxNumbers;
      const stdDev = Math.sqrt(combination.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / maxNumbers);
      if (stdDev < filters.desviacion.min || stdDev > filters.desviacion.max) return false;
  }

  // 11. ENTROPÍA DE TERMINACIONES (SHANNON)
  if (filters.entropyTerminaciones) {
      const endingCounts: { [key: number]: number } = {};
      combination.forEach(n => {
          const ending = n % 10;
          endingCounts[ending] = (endingCounts[ending] || 0) + 1;
      });
      const entropyTerm = -Object.values(endingCounts).reduce((s, countVal) => {
          const p = countVal / maxNumbers;
          return s + p * Math.log2(p);
      }, 0);
      if (entropyTerm < filters.entropyTerminaciones.min || entropyTerm > filters.entropyTerminaciones.max) return false;
  }

  // 11.5. ENTROPÍA DE INTERVALOS (SHANNON)
  if (filters.entropyIntervalos) {
      const sortedCombo = [...combination].sort((a,b) => a-b);
      const intervalCounts: { [key: number]: number } = {};
      for (let idx = 0; idx < sortedCombo.length - 1; idx++) {
          const diff = sortedCombo[idx+1] - sortedCombo[idx];
          intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
      }
      const numIntervals = maxNumbers - 1;
      const entropyInt = -Object.values(intervalCounts).reduce((s, countVal) => {
          const p = countVal / numIntervals;
          return s + p * Math.log2(p);
      }, 0);
      if (entropyInt < filters.entropyIntervalos.min || entropyInt > filters.entropyIntervalos.max) return false;
  }

  // 12. GEOMÉTRICOS: grid loops
  if (filters.geometric) {
      if (filters.geometric.exclude && filters.geometric.exclude.length > 0) {
          if (hasGeometricPattern(combination, filters.geometric.exclude, currentGame.gridCols || 7)) return false;
      }
      if (filters.geometric.favor && filters.geometric.favor.includes('espaciados')) {
          if (!isSpaced(combination, currentGame.gridCols || 7)) return false;
      }
  }

  // 12.5 NASH STRICT MODE
  if (filters.nashStrictMode) {
      if (!passesNashStrictFilter(combination, currentGame.numberRange, filters.nashMinScore ?? 0, filters.nashMaxScore ?? 10)) return false;
  }

  // 13. ESTRELLAS: checked in similar lazy order
  if (maxStars > 1 && stars.length === maxStars) {
      const starSum = stars.reduce((a, b) => a + b, 0);
      if (filters.starSum) {
          if (starSum < filters.starSum.min || starSum > filters.starSum.max) return false;
      }

      if (filters.starParImpar && filters.starParImpar.length > 0) {
          const starEvens = stars.filter(n => n % 2 === 0).length;
          const starParImparKey = `${starEvens}/${maxStars-starEvens}`;
          if (!filters.starParImpar.includes(starParImparKey)) return false;
      }

      if (filters.starBajosAltos && filters.starBajosAltos.length > 0) {
          const starMid = Math.floor(currentGame.starRange / 2);
          const starLows = stars.filter(n => n <= starMid).length;
          const starBajosAltosKey = `${starLows}/${maxStars-starLows}`;
          if (!filters.starBajosAltos.includes(starBajosAltosKey)) return false;
      }

      if (filters.starSumaDigitos) {
          let starDigitSum = 0;
          stars.forEach(s => {
              const sStr = s.toString();
              for (let i = 0; i < sStr.length; i++) starDigitSum += parseInt(sStr[i]);
          });
          if (starDigitSum < filters.starSumaDigitos.min || starDigitSum > filters.starSumaDigitos.max) return false;
      }

      if (filters.starPrimos) {
          const starPrimosCount = stars.filter(n => primes.has(n)).length;
          if (starPrimosCount < filters.starPrimos.min || starPrimosCount > filters.starPrimos.max) return false;
      }

      if (filters.starConsecutivos && filters.starConsecutivos.length > 0) {
          const sortedStars = [...stars].sort((a,b)=>a-b);
          let starConsecPattern = '';
          let sCount = 1;
          for (let i = 1; i < sortedStars.length; i++) {
              if (sortedStars[i] === sortedStars[i-1] + 1) {
                  sCount++;
              } else {
                  starConsecPattern += sCount;
                  sCount = 1;
              }
          }
          starConsecPattern += sCount;
          const starConsecPatternSorted = starConsecPattern.split('').sort((a,b)=>Number(b)-Number(a)).join('/');
          if (!filters.starConsecutivos.includes(starConsecPatternSorted)) return false;
      }

      if (filters.starDistancia) {
          const sortedStars = [...stars].sort((a,b)=>a-b);
          let minStarDist = 99;
          for (let i = 0; i < sortedStars.length - 1; i++) {
              const d = sortedStars[i+1] - sortedStars[i];
              if (d < minStarDist) minStarDist = d;
          }
          if (minStarDist < filters.starDistancia.min || minStarDist > filters.starDistancia.max) return false;
      }
  }

  return true;
}
