export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

export interface ScatterPoint {
  x: number;
  y: number;
  date?: string;
}

export function getSumSeriesWithRegression(historicalData: any[], locale: string = 'es-ES'): {
  points: ScatterPoint[];
  slope: number;
  intercept: number;
} {
  const points: ScatterPoint[] = (historicalData || []).map((d, i) => {
    const rawDate = d.date || d.fecha;
    let dateStr = '';
    if (rawDate instanceof Date) {
      dateStr = rawDate.toLocaleDateString(locale);
    } else if (typeof rawDate === 'string' && rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime()) && (rawDate.includes('T') || rawDate.includes('-'))) {
        dateStr = parsed.toLocaleDateString(locale);
      } else {
        dateStr = rawDate;
      }
    }
    return {
      x: i,
      y: (d.numbers || []).reduce((a: number, b: number) => a + b, 0),
      date: dateStr
    };
  });
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const { slope, intercept } = linearRegression(xs, ys);
  return { points, slope, intercept };
}

// Serie 1: tendencia de la SUMA total de la combinación ganadora por sorteo
export function getSumTrendScore(candidateSum: number, historicalData: any[], bonusWeight: number): number {
  if (!historicalData || historicalData.length < 5) return 0;
  const sums = historicalData.map(d => (d.numbers || []).reduce((a: number, b: number) => a + b, 0));
  const xs = sums.map((_, i) => i);
  const { slope, intercept } = linearRegression(xs, sums);
  const predictedNext = slope * sums.length + intercept;
  const distance = Math.abs(candidateSum - predictedNext);
  const maxSum = Math.max(...sums), minSum = Math.min(...sums);
  const range = Math.max(1, maxSum - minSum);
  return bonusWeight * Math.max(0, 1 - distance / range);
}

export function computeChiSquare(
  observedCounts: number[],
  expectedPerCategory: number
): { chiSquare: number; degreesOfFreedom: number } {
  if (observedCounts.length === 0 || expectedPerCategory <= 0) {
    return { chiSquare: 0, degreesOfFreedom: 0 };
  }
  const chiSquare = observedCounts.reduce(
    (sum, o) => sum + Math.pow(o - expectedPerCategory, 2) / expectedPerCategory,
    0
  );
  const degreesOfFreedom = observedCounts.length - 1;
  return { chiSquare, degreesOfFreedom };
}

export function chiSquareCriticalValue(df: number, zAlpha: number = 1.645): number {
  if (df <= 0) return 0;
  const term = 1 - (2 / (9 * df)) + zAlpha * Math.sqrt(2 / (9 * df));
  return df * Math.pow(term, 3);
}

// Descarta sorteos anteriores al cambio de formato vigente, para no mezclar
// épocas con rangos de números incompatibles en cálculos que asumen homogeneidad.
export function filtrarPorEraVigente(historicalData: any[], eraStartDate?: string): any[] {
  if (!eraStartDate || !historicalData) return historicalData;
  const cutoff = new Date(eraStartDate);
  return historicalData.filter(d => {
    const fecha = d.date instanceof Date ? d.date : new Date(d.date || d.fecha);
    return fecha >= cutoff;
  });
}

// Test de homogeneidad: compara la frecuencia de cada número en el ciclo corto
// (últimos `shortCycleSize` sorteos) frente al ciclo largo (el resto del histórico).
// Devuelve true solo si la diferencia es estadísticamente significativa (no ruido).
export function esTendenciaSignificativa(
  historicalData: any[],
  numberRange: number,
  shortCycleSize: number = 100,
  eraStartDate?: string
): boolean {
  const datosVigentes = filtrarPorEraVigente(historicalData, eraStartDate);
  if (!datosVigentes || datosVigentes.length < shortCycleSize * 2) return false;

  const shortCycle = datosVigentes.slice(-shortCycleSize);
  const longCycle = datosVigentes.slice(0, -shortCycleSize);

  const countFrequencies = (draws: any[]): number[] => {
    const freq: Record<number, number> = {};
    for (let n = 1; n <= numberRange; n++) freq[n] = 0;
    draws.forEach(d => (d.numbers || []).forEach((n: number) => {
      if (freq[n] !== undefined) freq[n]++;
    }));
    return Object.values(freq);
  };

  const shortFreqs = countFrequencies(shortCycle);
  const longFreqs = countFrequencies(longCycle);

  // Normaliza el ciclo largo a la misma escala de sorteos que el corto,
  // para comparar proporciones y no volúmenes absolutos distintos.
  const scaleFactor = shortCycle.length / Math.max(1, longCycle.length);
  const expectedFromLongCycle = longFreqs.map(f => f * scaleFactor);

  const totalExpected = expectedFromLongCycle.reduce((a, b) => a + b, 0);
  const avgExpected = totalExpected / expectedFromLongCycle.length;
  if (avgExpected <= 0) return false;

  const { chiSquare, degreesOfFreedom } = computeChiSquare(shortFreqs, avgExpected);
  const criticalValue = chiSquareCriticalValue(degreesOfFreedom, 1.645);

  return chiSquare > criticalValue;
}

// Serie 2: tendencia de frecuencia individual por número, en bloques (windowSize sorteos por bloque)
export function getNumberTrendScore(
  combination: number[],
  historicalData: any[],
  windowSize: number,
  bonusWeight: number,
  numberRange: number = 49,
  eraStartDate?: string
): number {
  const datosVigentes = filtrarPorEraVigente(historicalData, eraStartDate);
  if (!datosVigentes || datosVigentes.length < windowSize * 3) return 0;

  // Candado estadístico: si el ciclo corto no difiere del largo de forma
  // significativa (chi-cuadrado), no hay señal real — el bonus se anula.
  if (!esTendenciaSignificativa(datosVigentes, numberRange, 100)) return 0;

  const blocks: number[][] = [];
  for (let i = 0; i < datosVigentes.length; i += windowSize) {
    blocks.push(datosVigentes.slice(i, i + windowSize).flatMap(d => d.numbers || []));
  }
  const xs = blocks.map((_, i) => i);
  let score = 0;
  const maxBonusPerNumber = bonusWeight * 0.15; // tope 15%, igual que hot/cold
  combination.forEach(n => {
    const ys = blocks.map(block => block.filter(num => num === n).length);
    const { slope } = linearRegression(xs, ys);
    const rawBonus = slope * bonusWeight;
    score += Math.max(-maxBonusPerNumber, Math.min(maxBonusPerNumber, rawBonus));
  });
  return score;
}
