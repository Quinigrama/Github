export interface FilterBounds {
  min: number;
  max: number;
}

export interface GameFilterLimits {
  sum: FilterBounds;
  sumaDigitos: FilterBounds;
  desviacion: FilterBounds;
  primos: FilterBounds;
  distancia: FilterBounds;
  entropyTerminaciones: FilterBounds;
  entropyIntervalos: FilterBounds;
  starSum: FilterBounds;
  starSumaDigitos: FilterBounds;
  starPrimos: FilterBounds;
  starDistancia: FilterBounds;
  terminacionesDistintas: number[];
}

export interface GameTheoreticalLimits {
  minSum: number;
  maxSum: number;
  minDigitSum: number;
  maxDigitSum: number;
  maxStdDev: number;
  maxDistance: number;
  maxTermEntropy: number;
  maxIntEntropy: number;
  minStarSum: number;
  maxStarSum: number;
  minStarDigitSum: number;
  maxStarDigitSum: number;
  maxStarDistance: number;
}

export interface GameConfig {
  id: string;
  name: string;
  fullName: string;
  titleHeader: string;
  flag: string;
  currency: string;
  costPerBet: number;
  csvUrl: string;
  playUrl?: string;
  maxNumbers: number;
  numberRange: number;
  maxStars: number;
  starRange: number;
  starName: string;
  gridCols: number;
  allowedDays: number[]; // 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
  drawDays: number[];
  theoreticalProbabilities: { [tier: string]: number };
  jackpotThresholds: { excellent: number; good: number };
  customFilterLimits?: Partial<GameFilterLimits>;

  getTheoreticalLimits(): GameTheoreticalLimits;
  getDefaultFilters(): any;
}

export function computeTheoreticalLimits(
  maxNumbers: number,
  numberRange: number,
  maxStars: number,
  starRange: number
): GameTheoreticalLimits {
  let minSum = 0;
  for (let i = 1; i <= maxNumbers; i++) minSum += i;

  let maxSum = 0;
  for (let i = 0; i < maxNumbers; i++) maxSum += numberRange - i;

  let minDigitSum = 0;
  for (let i = 1; i <= maxNumbers; i++) {
    minDigitSum += i < 10 ? i : (i % 10) + Math.floor(i / 10);
  }

  let maxDigitSum = 0;
  for (let i = 0; i < maxNumbers; i++) {
    const n = numberRange - i;
    maxDigitSum += n < 10 ? n : (n % 10) + Math.floor(n / 10);
  }

  const lowHalf = Array.from({ length: Math.floor(maxNumbers / 2) }, (_, i) => i + 1);
  const highHalf = Array.from({ length: Math.ceil(maxNumbers / 2) }, (_, i) => numberRange - i);
  const extremeCombo = [...lowHalf, ...highHalf];
  const mean = extremeCombo.reduce((a, b) => a + b, 0) / maxNumbers;
  const maxStdDev = parseFloat(
    Math.ceil(
      Math.sqrt(extremeCombo.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / maxNumbers)
    ).toFixed(1)
  );

  const maxDistance = numberRange - 1;
  const maxTermEntropy = parseFloat(Math.log2(maxNumbers).toFixed(3));
  const maxIntEntropy = parseFloat(Math.log2(Math.max(1, maxNumbers - 1)).toFixed(3));

  let minStarSum = 0;
  let maxStarSum = 0;
  let minStarDigitSum = 0;
  let maxStarDigitSum = 0;
  let maxStarDistance = 0;

  if (maxStars === 1) {
    minStarSum = 1;
    maxStarSum = starRange;
    minStarDigitSum = 1;
    maxStarDigitSum = starRange > 9 ? 1 + (starRange % 10) : starRange;
  } else if (maxStars > 1) {
    minStarSum = 3;
    maxStarSum = starRange + (starRange - 1);
    minStarDigitSum = 2;
    maxStarDigitSum = 18;
    maxStarDistance = starRange - 1;
  }

  return {
    minSum,
    maxSum,
    minDigitSum,
    maxDigitSum,
    maxStdDev,
    maxDistance,
    maxTermEntropy,
    maxIntEntropy,
    minStarSum,
    maxStarSum,
    minStarDigitSum,
    maxStarDigitSum,
    maxStarDistance,
  };
}

export class BaseGameConfig implements GameConfig {
  id: string;
  name: string;
  fullName: string;
  titleHeader: string;
  flag: string;
  currency: string;
  costPerBet: number;
  csvUrl: string;
  playUrl?: string;
  maxNumbers: number;
  numberRange: number;
  maxStars: number;
  starRange: number;
  starName: string;
  gridCols: number;
  allowedDays: number[];
  theoreticalProbabilities: { [tier: string]: number };
  jackpotThresholds: { excellent: number; good: number };
  customFilterLimits?: Partial<GameFilterLimits>;

  constructor(opts: {
    id: string;
    name: string;
    fullName?: string;
    titleHeader?: string;
    flag?: string;
    currency?: string;
    costPerBet?: number;
    csvUrl?: string;
    playUrl?: string;
    maxNumbers: number;
    numberRange: number;
    maxStars: number;
    starRange: number;
    starName?: string;
    gridCols: number;
    allowedDays: number[];
    theoreticalProbabilities: { [tier: string]: number };
    jackpotThresholds?: { excellent: number; good: number };
    customFilterLimits?: Partial<GameFilterLimits>;
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.fullName = opts.fullName || `${opts.name} España`;
    this.titleHeader = opts.titleHeader || `${opts.name} ${opts.maxNumbers}/${opts.numberRange}`;
    this.flag = opts.flag || '🇪🇸';
    this.currency = opts.currency || '€';
    this.costPerBet = opts.costPerBet || 1.0;
    this.csvUrl = opts.csvUrl || '';
    this.playUrl = opts.playUrl || '';
    this.maxNumbers = opts.maxNumbers;
    this.numberRange = opts.numberRange;
    this.maxStars = opts.maxStars;
    this.starRange = opts.starRange;
    this.starName = opts.starName || (opts.maxStars > 1 ? 'Estrellas' : 'Especial');
    this.gridCols = opts.gridCols;
    this.allowedDays = opts.allowedDays;
    this.theoreticalProbabilities = opts.theoreticalProbabilities;
    this.jackpotThresholds = opts.jackpotThresholds || { excellent: 5000000, good: 2000000 };
    this.customFilterLimits = opts.customFilterLimits;
  }

  get drawDays(): number[] {
    return this.allowedDays;
  }

  getTheoreticalLimits(): GameTheoreticalLimits {
    return computeTheoreticalLimits(
      this.maxNumbers,
      this.numberRange,
      this.maxStars,
      this.starRange
    );
  }

  getDefaultFilters(): any {
    const lims = this.getTheoreticalLimits();
    const range = lims.maxSum - lims.minSum;
    const defaultSumMin = Math.floor(lims.minSum + range * 0.3);
    const defaultSumMax = Math.floor(lims.minSum + range * 0.7);

    const defaultDigitMin = Math.floor(this.maxNumbers * 5.0);
    const defaultDigitMax = Math.floor(this.maxNumbers * 9.5);

    const defaultTermDist = [this.maxNumbers - 2, this.maxNumbers - 1, this.maxNumbers].filter(v => v >= 2);

    const baseFilters: any = {
      terminaciones: [],
      terminacionesDistintas: defaultTermDist,
      sum: { min: defaultSumMin, max: defaultSumMax },
      parImpar: [],
      bajosAltos: [],
      primos: { min: 0, max: this.maxNumbers },
      consecutivos: [],
      distancia: { min: 1, max: Math.floor(this.numberRange / 2) },
      agrupDecenas: [],
      sumaDigitos: { min: defaultDigitMin, max: defaultDigitMax },
      desviacion: { min: 10.0, max: 22.0 },
      entropyTerminaciones: { min: 1.000, max: lims.maxTermEntropy },
      entropyIntervalos: { min: 1.000, max: lims.maxIntEntropy },
      geometric: { exclude: [], favor: [] },
      starSum: { min: lims.minStarSum, max: lims.maxStarSum },
      starParImpar: [],
      starBajosAltos: [],
      starSumaDigitos: { min: lims.minStarDigitSum, max: lims.maxStarDigitSum },
      starPrimos: { min: 0, max: this.maxStars },
      starConsecutivos: [],
      starDistancia: { min: this.maxStars > 1 ? 1 : 0, max: lims.maxStarDistance },
      useMarkov: false,
      useNash: false,
      useRegression: false,
      ai: { markovDepth: 5, nashWeight: 1, regressionBonus: 3 }
    };

    if (this.customFilterLimits) {
      if (this.customFilterLimits.sum) baseFilters.sum = { ...this.customFilterLimits.sum };
      if (this.customFilterLimits.sumaDigitos) baseFilters.sumaDigitos = { ...this.customFilterLimits.sumaDigitos };
      if (this.customFilterLimits.desviacion) baseFilters.desviacion = { ...this.customFilterLimits.desviacion };
      if (this.customFilterLimits.primos) baseFilters.primos = { ...this.customFilterLimits.primos };
      if (this.customFilterLimits.distancia) baseFilters.distancia = { ...this.customFilterLimits.distancia };
      if (this.customFilterLimits.starSum) baseFilters.starSum = { ...this.customFilterLimits.starSum };
      if (this.customFilterLimits.starSumaDigitos) baseFilters.starSumaDigitos = { ...this.customFilterLimits.starSumaDigitos };
      if (this.customFilterLimits.starPrimos) baseFilters.starPrimos = { ...this.customFilterLimits.starPrimos };
      if (this.customFilterLimits.starDistancia) baseFilters.starDistancia = { ...this.customFilterLimits.starDistancia };
      if (this.customFilterLimits.terminacionesDistintas) baseFilters.terminacionesDistintas = [...this.customFilterLimits.terminacionesDistintas];
    }

    if (this.id === 'nacional') {
      return {
        ...baseFilters,
        sum: { min: 0, max: 99999 },
        distancia: { min: 0, max: 99999 },
        sumaDigitos: { min: 0, max: 45 },
        nacionalSumaDigitos: { min: 15, max: 30 },
        nacionalCapicua: 'all',
        nacionalPrimo: 'all',
        nacionalCuadradoCubo: 'all',
        nacionalRepdigits: 'all',
        nacionalMultiploDe: 1,
        nacionalFranja: { min: 0, max: 99999 },
        nacionalObjetivo: '00000',
        nacionalDistanciaObjetivo: { min: 0, max: 99999 },
        nacionalParidad: ['any', 'any', 'any', 'any', 'any'],
        nacionalAltoBajo: ['any', 'any', 'any', 'any', 'any'],
        nacionalConsecutivos: 'all',
        nacionalSumaMitades: 'all',
        nacionalParesConteo: ['5P/0I', '4P/1I', '3P/2I', '2P/3I', '1P/4I', '0P/5I'],
        nacionalAltosConteo: ['5A/0B', '4A/1B', '3A/2B', '2A/3B', '1A/4B', '0A/5B'],
        nacionalUnicos: [1, 2, 3, 4, 5],
        nacionalModaRepeticiones: { min: 1, max: 5 },
        nacionalCeros: ['0', '1', '2', '3+'],
        nacionalPrimosDigitos: { min: 0, max: 5 },
        nacionalRangoInterno: { min: 0, max: 9 },
        nacionalDesviacion: { min: 0.00, max: 4.50 },
        nacionalEntropiaDigitos: { min: 0.000, max: 2.322 }
      };
    }

    return baseFilters;
  }
}

export const GAMES: { [key: string]: GameConfig } = {
  'powerball': new BaseGameConfig({
    id: 'powerball',
    name: 'Powerball',
    fullName: 'Powerball EE. UU.',
    titleHeader: 'Powerball 5/69 🔴 1/26',
    flag: '🇺🇸',
    currency: '$',
    costPerBet: 2.0,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGYYrOpTTcTyUyOM7ggIr7hxrAVZunaAgl9yMX31RR-gDM6PLCOsmclEGtHtvYhjwAhX52btdhAGsm/pub?output=csv',
    maxNumbers: 5,
    numberRange: 69,
    maxStars: 1,
    starRange: 26,
    starName: 'Powerball',
    gridCols: 10,
    allowedDays: [1, 3, 6],
    theoreticalProbabilities: { '5': 0.0000085, '4': 0.0028, '3': 0.17, '<=2': 99.82 },
    jackpotThresholds: { excellent: 200000000, good: 100000000 },
    customFilterLimits: {
      sum: { min: 140, max: 210 },
      sumaDigitos: { min: 28, max: 52 },
      desviacion: { min: 12.0, max: 28.0 },
      primos: { min: 0, max: 5 },
      distancia: { min: 1, max: 34 },
      starSum: { min: 1, max: 26 },
      starSumaDigitos: { min: 1, max: 15 },
      starPrimos: { min: 0, max: 1 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [3, 4, 5]
    }
  }),
  'megamillions': new BaseGameConfig({
    id: 'megamillions',
    name: 'Mega Millions',
    fullName: 'Mega Millions EE. UU.',
    titleHeader: 'Mega Millions 5/70 🟡 1/25',
    flag: '🇺🇸',
    currency: '$',
    costPerBet: 2.0,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGYYrOpTTcTyUyOM7ggIr7hxrAVZunaAgl9yMX31RR-gDM6PLCOsmclEGtHtvYhjwAhX52btdhAGsm/pub?output=csv',
    maxNumbers: 5,
    numberRange: 70,
    maxStars: 1,
    starRange: 25,
    starName: 'Mega Ball',
    gridCols: 10,
    allowedDays: [2, 5],
    theoreticalProbabilities: { '5': 0.0000033, '4': 0.0011, '3': 0.068, '<=2': 99.93 },
    jackpotThresholds: { excellent: 200000000, good: 100000000 },
    customFilterLimits: {
      sum: { min: 140, max: 215 },
      sumaDigitos: { min: 28, max: 54 },
      desviacion: { min: 12.0, max: 28.0 },
      primos: { min: 0, max: 5 },
      distancia: { min: 1, max: 35 },
      starSum: { min: 1, max: 25 },
      starSumaDigitos: { min: 1, max: 15 },
      starPrimos: { min: 0, max: 1 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [3, 4, 5]
    }
  }),
  'bonoloto': new BaseGameConfig({
    id: 'bonoloto',
    name: 'Bonoloto',
    fullName: 'Bonoloto España',
    titleHeader: 'Bonoloto 6/49',
    flag: '🇪🇸',
    currency: '€',
    costPerBet: 0.50,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQoIJeLcb9AcK8E6o_aw41gseUzNHl3518Etam-O60x-I9m8Ta6zMcg5TwZCznXzmWzxU18i-bYX81D/pub?output=csv',
    maxNumbers: 6,
    numberRange: 49,
    maxStars: 0,
    starRange: 0,
    starName: '',
    gridCols: 7,
    allowedDays: [0, 1, 2, 3, 4, 5, 6],
    theoreticalProbabilities: { '6': 0.00000715, '5': 0.00184, '4': 0.0969, '3': 1.765, '<=2': 98.136 },
    jackpotThresholds: { excellent: 2000000, good: 1000000 },
    customFilterLimits: {
      sum: { min: 121, max: 190 },
      sumaDigitos: { min: 28, max: 52 },
      desviacion: { min: 10.0, max: 22.0 },
      primos: { min: 0, max: 6 },
      distancia: { min: 1, max: 24 },
      starSum: { min: 0, max: 0 },
      starSumaDigitos: { min: 0, max: 0 },
      starPrimos: { min: 0, max: 0 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [4, 5, 6]
    }
  }),
  'primitiva': new BaseGameConfig({
    id: 'primitiva',
    name: 'Primitiva',
    fullName: 'La Primitiva España',
    titleHeader: 'La Primitiva 6/49',
    flag: '🇪🇸',
    currency: '€',
    costPerBet: 1.00,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSmhAHqGSrFFNqbugQz_CK9X-pT2diofnrYy_Wus7_MyPlDjJVk-8n1MGIat9phYSzeY0vz7kKjw-tC/pub?output=csv',
    maxNumbers: 6,
    numberRange: 49,
    maxStars: 0,
    starRange: 0,
    starName: 'Reintegro',
    gridCols: 7,
    allowedDays: [1, 4, 6],
    theoreticalProbabilities: { '6': 0.00000715, '5': 0.00184, '4': 0.0969, '3': 1.765, '<=2': 98.136 },
    jackpotThresholds: { excellent: 10000000, good: 5000000 },
    customFilterLimits: {
      sum: { min: 121, max: 190 },
      sumaDigitos: { min: 28, max: 52 },
      desviacion: { min: 10.0, max: 22.0 },
      primos: { min: 0, max: 6 },
      distancia: { min: 1, max: 24 },
      starSum: { min: 0, max: 0 },
      starSumaDigitos: { min: 0, max: 0 },
      starPrimos: { min: 0, max: 0 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [4, 5, 6]
    }
  }),
  'gordo': new BaseGameConfig({
    id: 'gordo',
    name: 'El Gordo',
    fullName: 'El Gordo de la Primitiva',
    titleHeader: 'El Gordo 5/54 🟡 1/10',
    flag: '🏆',
    currency: '€',
    costPerBet: 1.50,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_2jIvMo4_HmGowBdT0oRAB0fQOCW28JDtgxc_Rm_u9YBUTx1_D7pQ3-NuMh7KvuCJNpoP7bzgAzPc/pub?output=csv',
    maxNumbers: 5,
    numberRange: 54,
    maxStars: 1,
    starRange: 10,
    starName: 'Número Clave',
    gridCols: 9,
    allowedDays: [0],
    theoreticalProbabilities: { '5': 0.000032, '4': 0.0077, '3': 0.372, '<=2': 99.62 },
    jackpotThresholds: { excellent: 15000000, good: 7000000 },
    customFilterLimits: {
      sum: { min: 110, max: 170 },
      sumaDigitos: { min: 24, max: 46 },
      desviacion: { min: 10.0, max: 24.0 },
      primos: { min: 0, max: 5 },
      distancia: { min: 1, max: 27 },
      starSum: { min: 0, max: 9 },
      starSumaDigitos: { min: 0, max: 9 },
      starPrimos: { min: 0, max: 1 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [3, 4, 5]
    }
  }),
  'euromillones': new BaseGameConfig({
    id: 'euromillones',
    name: 'Euromillones',
    fullName: 'Euromillones Europa',
    titleHeader: 'Euromillones 5/50 ⭐ 2/12',
    flag: '🇪🇺',
    currency: '€',
    costPerBet: 2.50,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9LdJPVydRU1ohhiCuUeVb0nFTnFdZG_4JJhD8K7dJzrhHVOLUNB1SDF4TkbkqXSqrF_LGbhYQGgl6/pub?output=csv',
    maxNumbers: 5,
    numberRange: 50,
    maxStars: 2,
    starRange: 12,
    starName: 'Estrellas',
    gridCols: 10,
    allowedDays: [2, 5],
    theoreticalProbabilities: { '5': 0.000047, '4': 0.0106, '3': 0.467, '<=2': 99.52 },
    jackpotThresholds: { excellent: 50000000, good: 25000000 },
    customFilterLimits: {
      sum: { min: 100, max: 160 },
      sumaDigitos: { min: 23, max: 45 },
      desviacion: { min: 10.0, max: 22.0 },
      primos: { min: 0, max: 5 },
      distancia: { min: 1, max: 25 },
      starSum: { min: 8, max: 15 },
      starSumaDigitos: { min: 3, max: 12 },
      starPrimos: { min: 0, max: 2 },
      starDistancia: { min: 1, max: 11 },
      terminacionesDistintas: [3, 4, 5]
    }
  }),
  'eurodreams': new BaseGameConfig({
    id: 'eurodreams',
    name: 'EuroDreams',
    fullName: 'EuroDreams Europa',
    titleHeader: 'EuroDreams 6/40 🌙 1/5',
    flag: '🌙',
    currency: '€',
    costPerBet: 2.50,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9UhEkG1_cHAMDvBsmhkzqjpismGFGhouomp9PV3QN4YfIAsdvQF4A5d1iOddnjbz8CKkN3xFC-jjf/pub?output=csv',
    maxNumbers: 6,
    numberRange: 40,
    maxStars: 1,
    starRange: 5,
    starName: 'Sueño',
    gridCols: 10,
    allowedDays: [1, 4],
    theoreticalProbabilities: { '6': 0.000026, '5': 0.0053, '4': 0.219, '3': 3.118, '<=2': 96.657 },
    jackpotThresholds: { excellent: 20000, good: 10000 },
    customFilterLimits: {
      sum: { min: 100, max: 150 },
      sumaDigitos: { min: 25, max: 48 },
      desviacion: { min: 9.0, max: 20.0 },
      primos: { min: 0, max: 6 },
      distancia: { min: 1, max: 20 },
      starSum: { min: 1, max: 5 },
      starSumaDigitos: { min: 1, max: 5 },
      starPrimos: { min: 0, max: 1 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: [4, 5, 6]
    }
  }),
  'nacional': new BaseGameConfig({
    id: 'nacional',
    name: 'Lotería Nacional',
    fullName: 'Lotería Nacional España',
    titleHeader: 'Lotería Nacional 5/59',
    flag: '🇪🇸',
    currency: '€',
    costPerBet: 3.00,
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNOVmWdMXMTnHaBa9XiYUkkjaXCkqo0c59Hsgp_AVd1wFlmUWZPb6WML5MNHxZCQptlmyhRvwPVyGg/pub?output=csv',
    maxNumbers: 5,
    numberRange: 59,
    maxStars: 0,
    starRange: 0,
    starName: '',
    gridCols: 10,
    allowedDays: [4, 6],
    theoreticalProbabilities: { '5': 0.001, '4': 0.045, '3': 0.81, '<=2': 99.144 },
    jackpotThresholds: { excellent: 300000, good: 150000 },
    customFilterLimits: {
      sum: { min: 0, max: 99999 },
      sumaDigitos: { min: 0, max: 45 },
      desviacion: { min: 0, max: 20 },
      primos: { min: 0, max: 5 },
      distancia: { min: 0, max: 99999 },
      starSum: { min: 0, max: 0 },
      starSumaDigitos: { min: 0, max: 0 },
      starPrimos: { min: 0, max: 0 },
      starDistancia: { min: 0, max: 0 },
      terminacionesDistintas: []
    }
  })
};

export function getGameConfig(gameId: string): GameConfig {
  return GAMES[gameId] || GAMES['bonoloto'];
}

export function getDefaultFiltersForGame(gameId: string): any {
  const config = getGameConfig(gameId);
  return config.getDefaultFilters();
}

export function getAllGames(): GameConfig[] {
  return Object.values(GAMES);
}
