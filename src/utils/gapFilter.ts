import { normalCdf } from './statHelpers';

export interface GapAnalysis {
  numero: number;
  huecoActual: number;
  percentil: number; // 0-100
  nGaps: number; // huecos históricos disponibles para este número
}

/**
 * Calcula, para un número dado, la lista de huecos históricos (sorteos entre
 * apariciones consecutivas) y el hueco actual (sorteos desde la última aparición
 * hasta el final del histórico cargado).
 */
export function calcularGaps(historicalData: any[], numero: number): { gaps: number[]; huecoActual: number } {
  const apariciones: number[] = [];
  historicalData.forEach((sorteo, idx) => {
    const nums = sorteo.numbers || [];
    if (nums.includes(numero)) apariciones.push(idx);
  });
  const gaps: number[] = [];
  for (let i = 1; i < apariciones.length; i++) {
    gaps.push(apariciones[i] - apariciones[i - 1]);
  }
  const huecoActual = apariciones.length > 0
    ? historicalData.length - 1 - apariciones[apariciones.length - 1]
    : historicalData.length;
  return { gaps, huecoActual };
}

/**
 * Percentil del hueco actual dentro de la distribución histórica de huecos
 * del propio número (0-100). Si no hay huecos suficientes, devuelve 50 (neutro).
 */
export function percentilHueco(gaps: number[], huecoActual: number): number {
  if (!gaps.length) return 50;
  const menores = gaps.filter(g => g <= huecoActual).length;
  return Number(((menores / gaps.length) * 100).toFixed(1));
}

/**
 * Analiza todos los números del rango del juego (1..numberRange).
 * minGapsRequeridos: exige un mínimo de huecos históricos por número (default 8)
 * para que el percentil tenga sentido estadístico; si no llega, nGaps queda por
 * debajo del mínimo y ese número se considera "no elegible" para el filtro.
 */
export function analizarTodosLosNumeros(
  historicalData: any[],
  numberRange: number,
  minGapsRequeridos: number = 8
): GapAnalysis[] {
  const resultado: GapAnalysis[] = [];
  for (let n = 1; n <= numberRange; n++) {
    const { gaps, huecoActual } = calcularGaps(historicalData, n);
    resultado.push({
      numero: n,
      huecoActual,
      percentil: percentilHueco(gaps, huecoActual),
      nGaps: gaps.length,
    });
  }
  return resultado;
}

/**
 * Filtro de exclusión: excluye números cuyo percentil de hueco actual >= umbralPercentil.
 * FAILSAFE: si excluiría más del 60% de los números elegibles, no aplica el filtro
 * (devuelve excluidos: [] y failsafe: true) — mismo criterio que
 * orderedPercentileExclusion en roberTheorem.ts, para no vaciar el generador.
 */
export function aplicarFiltroGap(
  analisis: GapAnalysis[],
  umbralPercentil: number,
  minGapsRequeridos: number = 8
): { excluidos: number[]; failsafe: boolean } {
  const elegibles = analisis.filter(a => a.nGaps >= minGapsRequeridos);
  if (elegibles.length === 0) return { excluidos: [], failsafe: false };
  const excluidos = elegibles.filter(a => a.percentil >= umbralPercentil).map(a => a.numero);
  if (excluidos.length > elegibles.length * 0.6) {
    return { excluidos: [], failsafe: true };
  }
  return { excluidos, failsafe: false };
}

export interface GapHistogramRow {
  rangoLabel: string; // ej. "1-3"
  empirico: number;   // frecuencia real de huecos en ese rango
  teorico: number;    // frecuencia esperada según distribución geométrica
}

/**
 * Agrupa los huecos históricos de un número en buckets, y calcula en paralelo
 * la frecuencia esperada bajo una distribución geométrica teórica con
 * probabilidad p = maxNumbers / numberRange del juego activo.
 */
export function construirHistogramaGaps(
  gaps: number[],
  maxNumbers: number,
  numberRange: number,
  nBucketsObjetivo: number = 14
): GapHistogramRow[] {
  const p = maxNumbers / numberRange;
  const maxGap = gaps.length ? Math.max(...gaps) : 30;
  const bucketSize = Math.max(1, Math.ceil((maxGap + 1) / nBucketsObjetivo));
  const nBuckets = Math.ceil((maxGap + 1) / bucketSize);

  const counts = new Array(nBuckets).fill(0);
  gaps.forEach(g => {
    const b = Math.min(nBuckets - 1, Math.floor(g / bucketSize));
    counts[b]++;
  });

  return counts.map((c, idx) => {
    let probTeorica = 0;
    for (let k = idx * bucketSize + 1; k <= (idx + 1) * bucketSize; k++) {
      probTeorica += Math.pow(1 - p, k - 1) * p;
    }
    return {
      rangoLabel: `${idx * bucketSize + 1}-${(idx + 1) * bucketSize}`,
      empirico: c,
      teorico: Number((probTeorica * gaps.length).toFixed(2)),
    };
  });
}

export interface RunsTestResult {
  z: number;
  pValue: number;
  nApariciones: number;
  nAusencias: number;
}

/**
 * Runs test de Wald-Wolfowitz: convierte la aparición/no-aparición de un
 * número en cada sorteo en una secuencia binaria y comprueba si el número
 * de "rachas" (bloques consecutivos del mismo valor) es compatible con una
 * secuencia aleatoria, o si está anormalmente agrupado/alternado.
 * Devuelve null si la muestra es demasiado pequeña para la aproximación
 * normal del test (menos de 5 apariciones o menos de 5 ausencias).
 */
export function testRachasWaldWolfowitz(historicalData: any[], numero: number): RunsTestResult | null {
  const secuencia: boolean[] = historicalData.map(sorteo => (sorteo.numbers || []).includes(numero));
  const n1 = secuencia.filter(Boolean).length;
  const n2 = secuencia.length - n1;
  if (n1 < 5 || n2 < 5) return null;

  let runs = 1;
  for (let i = 1; i < secuencia.length; i++) {
    if (secuencia[i] !== secuencia[i - 1]) runs++;
  }

  const n = n1 + n2;
  const meanRuns = (2 * n1 * n2) / n + 1;
  const varRuns = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  if (varRuns <= 0) return null;

  const z = (runs - meanRuns) / Math.sqrt(varRuns);
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  return {
    z: Number(z.toFixed(2)),
    pValue: Number(pValue.toFixed(4)),
    nApariciones: n1,
    nAusencias: n2,
  };
}

