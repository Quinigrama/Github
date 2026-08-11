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

// Serie 2: tendencia de frecuencia individual por número, en bloques (windowSize sorteos por bloque)
export function getNumberTrendScore(
  combination: number[],
  historicalData: any[],
  windowSize: number,
  bonusWeight: number
): number {
  if (!historicalData || historicalData.length < windowSize * 3) return 0;
  const blocks: number[][] = [];
  for (let i = 0; i < historicalData.length; i += windowSize) {
    blocks.push(historicalData.slice(i, i + windowSize).flatMap(d => d.numbers || []));
  }
  const xs = blocks.map((_, i) => i);
  let score = 0;
  combination.forEach(n => {
    const ys = blocks.map(block => block.filter(num => num === n).length);
    const { slope } = linearRegression(xs, ys);
    score += slope * bonusWeight;
  });
  return score;
}
