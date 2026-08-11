export function computePopularityWeight(n: number, numberRange: number): number {
  let weight = 30; // base: popularidad neutra

  if (n <= 31) weight += 30; // rango de fechas (día del mes)
  if (n <= 12) weight += 10; // rango de meses, boost adicional
  if (n % 7 === 0) weight += 8; // múltiplos de 7 ("número de la suerte")

  // Cuanto mayor es numberRange respecto a 31, menos domina el sesgo de
  // calendario proporcionalmente (aplica sobre todo a Powerball/MegaMillions,
  // con numberRange 69/70 frente a los ~49/50 de los juegos españoles).
  const calendarShare = 31 / numberRange;
  weight = weight * (0.5 + 0.5 * calendarShare);

  return Math.max(0, Math.min(100, Math.round(weight)));
}

export function getPopularityWeight(n: number, numberRange: number): number {
  return computePopularityWeight(n, numberRange);
}

// Media de popularidad de una apuesta, en escala 0-10 (familiar, similar a
// la escala 0.0-9.9 que usan otros programas del sector para este concepto).
export function getNashScoreAverage(combination: number[], numberRange: number): number {
  if (!combination || combination.length === 0) return 0;
  const avg = combination.reduce((sum, n) => sum + getPopularityWeight(n, numberRange), 0) / combination.length;
  return Math.round((avg / 10) * 10) / 10; // 0.0 - 10.0
}
