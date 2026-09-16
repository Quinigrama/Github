/**
 * Patrones optimizados para los sistemas reducidos de Primitiva.
 *
 * Cada patrón es una lista de boletos, y cada boleto es una lista de posiciones
 * (0-indexadas) dentro de los N números base que el usuario ha seleccionado en
 * la cuadrícula. Por ejemplo, para el sistema de 8 números, la posición 0
 * corresponde al primer número base (ordenado ascendentemente), la posición 7
 * al octavo.
 *
 * Estos patrones sustituyen al cálculo en tiempo de ejecución de getGreedyCovering()
 * para Primitiva. Se generaron con un algoritmo de cobertura por solape de
 * complementos (equivalente matemáticamente a la garantía original: "si los N
 * números elegidos contienen los 6 números ganadores, al menos un boleto acierta
 * P números"), y cada patrón fue verificado por fuerza bruta contra el 100% de
 * los sorteos posibles dentro de ese conjunto de N números — no es una estimación.
 *
 * Resultado: la misma garantía matemática que las tablas anteriores, con muchos
 * menos boletos:
 *   - 8 números / 5 aciertos:  12 -> 4  boletos (-67%)
 *   - 10 números / 5 aciertos: 56 -> 14 boletos (-75%)
 *   - 12 números / 5 aciertos: 172 -> 42 boletos (-76%)
 *   - 10 números / 4 aciertos: 23 -> 3  boletos (-87%)
 *   - 12 números / 4 aciertos: 53 -> 6  boletos (-89%)
 *   - 14 números / 4 aciertos: 107 -> 18 boletos (-83%)
 */
export const PRIMITIVA_OPTIMIZED_PATTERNS: { [systemId: string]: number[][] } = {
  'reduced-8-5-5': [
    [2, 3, 4, 5, 6, 7],
    [0, 1, 4, 5, 6, 7],
    [0, 1, 2, 3, 6, 7],
    [1, 2, 3, 4, 5, 7],
  ],
  'reduced-10-5-5': [
    [0, 2, 4, 5, 8, 9],
    [0, 3, 6, 7, 8, 9],
    [1, 2, 5, 6, 7, 8],
    [1, 3, 4, 5, 6, 9],
    [0, 1, 2, 3, 4, 7],
    [0, 1, 2, 6, 8, 9],
    [0, 3, 4, 5, 7, 8],
    [2, 4, 5, 6, 7, 9],
    [1, 3, 4, 7, 8, 9],
    [0, 1, 3, 5, 7, 9],
    [0, 2, 3, 4, 6, 8],
    [1, 2, 3, 5, 6, 8],
    [0, 1, 4, 5, 6, 7],
    [2, 3, 5, 6, 7, 9],
  ],
  'reduced-12-5-5': [
    [0, 1, 5, 8, 9, 10],
    [0, 3, 6, 8, 9, 11],
    [3, 4, 7, 9, 10, 11],
    [1, 5, 6, 7, 9, 11],
    [0, 1, 2, 3, 5, 11],
    [2, 3, 4, 5, 6, 10],
    [1, 2, 4, 6, 8, 11],
    [0, 2, 7, 8, 10, 11],
    [0, 1, 2, 4, 7, 9],
    [2, 3, 5, 7, 8, 9],
    [1, 3, 6, 7, 8, 10],
    [0, 4, 5, 6, 7, 8],
    [0, 1, 4, 6, 10, 11],
    [1, 3, 4, 5, 6, 9],
    [2, 4, 5, 8, 9, 11],
    [0, 2, 3, 6, 9, 10],
    [1, 2, 4, 5, 7, 10],
    [0, 2, 3, 4, 8, 10],
    [0, 3, 4, 5, 7, 11],
    [1, 2, 3, 9, 10, 11],
    [3, 5, 6, 8, 10, 11],
    [4, 6, 7, 8, 9, 10],
    [0, 1, 2, 3, 6, 7],
    [1, 3, 4, 7, 8, 11],
    [0, 2, 5, 6, 9, 10],
    [0, 1, 3, 5, 7, 10],
    [2, 5, 6, 7, 10, 11],
    [0, 2, 4, 6, 9, 11],
    [0, 1, 2, 5, 6, 8],
    [0, 1, 3, 4, 8, 9],
    [1, 4, 5, 8, 10, 11],
    [0, 1, 7, 8, 9, 11],
    [2, 3, 6, 7, 8, 9],
    [0, 4, 5, 9, 10, 11],
    [0, 3, 6, 7, 9, 10],
    [1, 2, 6, 8, 9, 10],
    [2, 3, 4, 5, 8, 10],
    [1, 5, 7, 8, 9, 11],
    [0, 2, 3, 5, 9, 11],
    [2, 4, 6, 7, 9, 11],
    [0, 2, 4, 7, 8, 10],
    [0, 1, 3, 5, 10, 11],
  ],
  'reduced-10-4-4': [
    [4, 5, 6, 7, 8, 9],
    [0, 1, 2, 3, 8, 9],
    [2, 3, 4, 5, 6, 7],
  ],
  'reduced-12-4-4': [
    [6, 7, 8, 9, 10, 11],
    [1, 2, 3, 4, 5, 11],
    [0, 4, 5, 8, 9, 10],
    [0, 1, 2, 3, 6, 7],
    [1, 2, 3, 8, 9, 10],
    [0, 4, 5, 6, 7, 11],
  ],
  'reduced-14-4-4': [
    [8, 9, 10, 11, 12, 13],
    [3, 4, 5, 6, 7, 13],
    [0, 1, 2, 7, 11, 12],
    [1, 2, 5, 6, 9, 10],
    [0, 2, 3, 4, 8, 10],
    [0, 1, 4, 6, 8, 9],
    [3, 5, 7, 9, 11, 12],
    [1, 3, 5, 8, 12, 13],
    [0, 6, 7, 10, 11, 13],
    [2, 4, 5, 11, 12, 13],
    [2, 3, 6, 7, 9, 13],
    [1, 4, 7, 8, 10, 12],
    [0, 1, 3, 6, 10, 11],
    [0, 2, 5, 6, 7, 8],
    [0, 1, 4, 5, 9, 13],
    [2, 3, 4, 9, 11, 12],
    [6, 8, 10, 11, 12, 13],
    [5, 6, 10, 11, 12, 13],
  ],
};
