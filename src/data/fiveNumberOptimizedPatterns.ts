/**
 * Patrones optimizados para los sistemas reducidos de los juegos de 5 números:
 * Euromillones, El Gordo, Powerball y MegaMillions (todos comparten los mismos
 * presets de números base: 8, 10, 12 y 15).
 *
 * Mismo principio que PRIMITIVA_OPTIMIZED_PATTERNS (ver src/data/reducedSystemPatterns.ts):
 * cada patrón es una lista de boletos, cada boleto una lista de posiciones 0-indexadas
 * dentro de los N números base elegidos por el usuario. Verificados por fuerza bruta
 * contra el 100% de los sorteos posibles de cada sistema.
 *
 * Resultado: misma garantía matemática que las tablas anteriores, con muchos menos boletos:
 *   - 8 números / 4 aciertos:  23 -> 5  boletos (-78%)
 *   - 10 números / 4 aciertos: 53 -> 14 boletos (-74%)
 *   - 12 números / 4 aciertos: 132 -> 39 boletos (-70%)
 *   - 10 números / 3 aciertos: 19 -> 2  boletos (-89%)
 *   - 12 números / 3 aciertos: 33 -> 6  boletos (-82%)
 *   - 15 números / 3 aciertos: 62 -> 14 boletos (-77%)
 */
export const FIVE_NUMBER_OPTIMIZED_PATTERNS: { [systemId: string]: number[][] } = {
  'reduced-8-4-4': [
    [3, 4, 5, 6, 7],
    [0, 1, 2, 6, 7],
    [1, 2, 3, 4, 5],
    [0, 3, 4, 5, 7],
    [0, 3, 4, 5, 6],
  ],
  'reduced-10-4-4': [
    [0, 2, 5, 7, 8],
    [1, 3, 4, 5, 6],
    [1, 6, 7, 8, 9],
    [0, 2, 3, 4, 9],
    [1, 2, 3, 5, 7],
    [0, 4, 6, 8, 9],
    [0, 1, 3, 8, 9],
    [0, 3, 5, 6, 7],
    [2, 4, 6, 7, 9],
    [1, 2, 4, 5, 8],
    [2, 3, 6, 8, 9],
    [0, 1, 2, 5, 6],
    [3, 4, 5, 7, 8],
    [0, 1, 4, 7, 9],
  ],
  'reduced-12-4-4': [
    [0, 1, 4, 6, 10],
    [1, 2, 7, 8, 9],
    [2, 3, 4, 9, 10],
    [1, 5, 6, 9, 11],
    [3, 7, 8, 10, 11],
    [0, 2, 3, 6, 11],
    [0, 2, 5, 7, 10],
    [0, 4, 5, 8, 11],
    [1, 3, 4, 5, 7],
    [0, 1, 3, 8, 9],
    [3, 5, 6, 8, 10],
    [4, 6, 7, 9, 11],
    [2, 4, 6, 7, 8],
    [1, 2, 5, 10, 11],
    [0, 5, 6, 7, 9],
    [0, 8, 9, 10, 11],
    [0, 1, 2, 4, 9],
    [1, 3, 6, 7, 10],
    [2, 3, 5, 8, 9],
    [1, 3, 4, 8, 11],
    [4, 5, 7, 9, 10],
    [0, 1, 7, 8, 11],
    [1, 2, 5, 6, 8],
    [0, 3, 4, 7, 8],
    [0, 3, 4, 5, 11],
    [2, 4, 7, 10, 11],
    [2, 6, 8, 9, 10],
    [2, 3, 7, 9, 11],
    [0, 1, 3, 9, 10],
    [3, 4, 6, 8, 9],
    [2, 4, 5, 6, 11],
    [1, 4, 5, 8, 10],
    [1, 2, 3, 6, 7],
    [6, 7, 8, 10, 11],
    [3, 5, 6, 10, 11],
    [2, 5, 8, 9, 11],
    [0, 2, 3, 8, 10],
    [4, 7, 9, 10, 11],
    [0, 1, 2, 3, 5],
  ],
  'reduced-10-3-3': [
    [5, 6, 7, 8, 9],
    [0, 1, 2, 3, 4],
  ],
  'reduced-12-3-3': [
    [7, 8, 9, 10, 11],
    [2, 3, 4, 5, 6],
    [0, 1, 6, 10, 11],
    [0, 1, 7, 8, 9],
    [3, 4, 5, 10, 11],
    [0, 1, 2, 10, 11],
  ],
  'reduced-15-3-3': [
    [0, 3, 4, 8, 13],
    [2, 6, 7, 10, 12],
    [1, 5, 9, 11, 14],
    [0, 2, 5, 10, 11],
    [1, 4, 7, 12, 13],
    [3, 6, 8, 9, 14],
    [0, 7, 9, 12, 14],
    [4, 5, 6, 11, 13],
    [1, 2, 3, 8, 10],
    [3, 5, 8, 12, 13],
    [0, 1, 6, 7, 13],
    [2, 4, 7, 9, 14],
    [3, 8, 11, 12, 13],
    [4, 7, 9, 10, 14],
  ],
};
