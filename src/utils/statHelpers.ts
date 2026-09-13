/**
 * Aproximación de la función error (Abramowitz-Stegun 7.1.26, precisión ~1.5e-7).
 * Base para calcular la CDF de la normal estándar sin dependencias externas.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/**
 * Función de distribución acumulada de la normal estándar N(0,1).
 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * P-valor de cola superior de un estadístico chi-cuadrado, usando la misma
 * aproximación de Wilson-Hilferty que ya usa chiSquareCriticalValue en
 * regression.ts para el valor crítico — aquí se invierte para dar un p-valor
 * real en vez de solo un booleano de "supera el umbral".
 */
export function chiSquarePValue(chiSquare: number, df: number): number {
  if (df <= 0) return 1;
  const term = Math.pow(chiSquare / df, 1 / 3) - (1 - 2 / (9 * df));
  const z = term / Math.sqrt(2 / (9 * df));
  return Math.max(0, Math.min(1, 1 - normalCdf(z)));
}

/**
 * P-valor de cola superior de una distribución de Poisson: P(X >= k | lambda).
 * Recurrencia numéricamente estable (evita overflow de factoriales para k grande).
 */
export function poissonUpperTailPValue(k: number, lambda: number): number {
  if (lambda <= 0) return k > 0 ? 0 : 1;
  let pmf = Math.exp(-lambda);
  let cdf = pmf;
  for (let i = 1; i < k; i++) {
    pmf *= lambda / i;
    cdf += pmf;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

/**
 * Corrección de Benjamini-Hochberg (FDR): dado el p-valor de un test, su
 * posición (1-based, ordenado de menor a mayor p-valor) dentro de la familia
 * completa de tests, y el total de tests de esa familia (no solo los que se
 * muestran en pantalla), indica si sobrevive la corrección al nivel alpha.
 */
export function passesBenjaminiHochberg(pValue: number, rank: number, totalTests: number, alpha: number = 0.05): boolean {
  if (totalTests <= 0 || rank <= 0) return false;
  return pValue <= (rank / totalTests) * alpha;
}
