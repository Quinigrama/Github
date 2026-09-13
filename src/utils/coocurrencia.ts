import { poissonUpperTailPValue, passesBenjaminiHochberg } from './statHelpers';

export interface ParFrecuencia {
  a: number;
  b: number;
  count: number;
  pctSobreSorteos: number;
  esperado: number;
  ratio: number;
  pValue: number;
  significativo: boolean;
}

export interface TrioFrecuencia {
  a: number;
  b: number;
  c: number;
  count: number;
  pctSobreSorteos: number;
  esperado: number;
  ratio: number;
  pValue: number;
  significativo: boolean;
}

const combinaciones = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let res = 1;
  for (let i = 0; i < k; i++) res = (res * (n - i)) / (i + 1);
  return res;
};

export function construirMatrizPares(historicalData: any[], numberRange: number): number[][] {
  const matriz: number[][] = Array.from({ length: numberRange + 1 }, () => new Array(numberRange + 1).fill(0));
  historicalData.forEach(sorteo => {
    const nums: number[] = (sorteo.numbers || []).slice().sort((a: number, b: number) => a - b);
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        if (nums[i] <= numberRange && nums[j] <= numberRange) {
          matriz[nums[i]][nums[j]]++;
          matriz[nums[j]][nums[i]]++;
        }
      }
    }
  });
  return matriz;
}

export function rankingPares(
  matriz: number[][],
  totalSorteos: number,
  maxNumbers: number,
  numberRange: number,
  topN: number = 20
): ParFrecuencia[] {
  if (totalSorteos <= 0) return [];

  const probParJunto = maxNumbers >= 2
    ? combinaciones(numberRange - 2, maxNumbers - 2) / combinaciones(numberRange, maxNumbers)
    : 0;
  const esperado = totalSorteos * probParJunto;

  const pares: Array<Omit<ParFrecuencia, 'pValue' | 'significativo'>> = [];
  for (let a = 1; a <= numberRange; a++) {
    for (let b = a + 1; b <= numberRange; b++) {
      const count = matriz[a][b];
      if (count > 0) {
        pares.push({
          a, b, count,
          pctSobreSorteos: Number(((count / totalSorteos) * 100).toFixed(2)),
          esperado: Number(esperado.toFixed(2)),
          ratio: esperado > 0 ? Number((count / esperado).toFixed(2)) : 0,
        });
      }
    }
  }
  const topPares = pares.sort((x, y) => y.count - x.count).slice(0, topN);
  const totalTestsPares = combinaciones(numberRange, 2);
  return topPares.map((p, idx): ParFrecuencia => {
    const pValue = poissonUpperTailPValue(p.count, esperado);
    return {
      ...p,
      pValue: Number(pValue.toFixed(4)),
      significativo: passesBenjaminiHochberg(pValue, idx + 1, totalTestsPares),
    };
  });
}

export function rankingTrios(
  historicalData: any[],
  maxNumbers: number,
  numberRange: number,
  topN: number = 20
): TrioFrecuencia[] {
  if (historicalData.length === 0) return [];
  const dataset = historicalData.length > 2000 ? historicalData.slice(-2000) : historicalData;
  const counts = new Map<string, number>();
  dataset.forEach(sorteo => {
    const nums: number[] = (sorteo.numbers || []).slice().sort((a: number, b: number) => a - b);
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        for (let k = j + 1; k < nums.length; k++) {
          if (nums[k] <= numberRange) {
            const key = `${nums[i]}-${nums[j]}-${nums[k]}`;
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
    }
  });

  const probTrioJunto = maxNumbers >= 3
    ? combinaciones(numberRange - 3, maxNumbers - 3) / combinaciones(numberRange, maxNumbers)
    : 0;
  const esperado = dataset.length * probTrioJunto;

  const trios: Array<Omit<TrioFrecuencia, 'pValue' | 'significativo'>> = [];
  counts.forEach((count, key) => {
    const [a, b, c] = key.split('-').map(Number);
    trios.push({
      a, b, c, count,
      pctSobreSorteos: Number(((count / dataset.length) * 100).toFixed(2)),
      esperado: Number(esperado.toFixed(2)),
      ratio: esperado > 0 ? Number((count / esperado).toFixed(2)) : 0,
    });
  });
  const topTrios = trios.sort((x, y) => y.count - x.count).slice(0, topN);
  const totalTestsTrios = combinaciones(numberRange, 3);
  return topTrios.map((tItem, idx): TrioFrecuencia => {
    const pValue = poissonUpperTailPValue(tItem.count, esperado);
    return {
      ...tItem,
      pValue: Number(pValue.toFixed(4)),
      significativo: passesBenjaminiHochberg(pValue, idx + 1, totalTestsTrios),
    };
  });
}
