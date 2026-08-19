import { GridLayout } from "./src/utils/geometry";

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
  restaurarFiltrosLevel?: { pLow: number; pHigh: number };
  numbersLayout?: GridLayout;
  numbersStartAt?: number;
  startAt?: number;
  secondaryLayout?: GridLayout;
  secondaryStartAt?: number;

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
  restaurarFiltrosLevel?: { pLow: number; pHigh: number };
  numbersLayout?: GridLayout;
  numbersStartAt?: number;
  secondaryLayout?: GridLayout;
  secondaryStartAt?: number;

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
    restaurarFiltrosLevel?: { pLow: number; pHigh: number };
    numbersLayout?: GridLayout;
    numbersStartAt?: number;
    secondaryLayout?: GridLayout;
    secondaryStartAt?: number;
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
    this.restaurarFiltrosLevel = opts.restaurarFiltrosLevel;
    this.numbersLayout = opts.numbersLayout;
    this.numbersStartAt = opts.numbersStartAt;
    this.secondaryLayout = opts.secondaryLayout;
    this.secondaryStartAt = opts.secondaryStartAt;
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

    if (this.id !== 'nacional') {
      baseFilters.positionRange = {
        enabled: false,
        confidenceLevel: 1.645,
        ranges: []
      };
      if (this.maxStars >= 2) {
        baseFilters.starPositionRange = {
          enabled: false,
          confidenceLevel: 1.645,
          ranges: []
        };
      }
    }


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

export const NATIONAL_FLAGS: { [gameId: string]: string } = {
  powerball: '🇺🇸',
  megamillions: '🇺🇸',
  euromillones: '🇪🇺',
  eurodreams: '🇪🇺',
  bonoloto: '🇪🇸',
  primitiva: '🇪🇸',
  gordo: '🇪🇸',
  nacional: '🇪🇸',
};

export interface GameColorPalette {
  cardBg: string;           // fondo de la tarjeta cuando el ticket está validado
  cardBorderThick: string;  // borde de la tarjeta validada (normalmente 1.5px)
  cardBorderThin: string;   // borde de la tarjeta NO validada (normalmente 1px)
  headerText: string;       // color del texto de cabecera / nombre de categoría con premio
  accentText: string;       // color usado para el nº de apuestas ganadoras cuando count > 0
  rowHighlightBg: string;   // fondo de la fila de la tabla de premios cuando esa categoría tiene ganadoras
  neutralText: string;      // color de texto cuando count === 0 (#64748b en todos los bloques)
  secondaryEmoji: string;   // emoji de la segunda matriz: 🔴, 🟡, ⭐, 🌙, 🔑, ''
  badgeBg: string;          // fondo de la etiqueta de cabecera (p. ej. "Desglose por Categorías" / "Múltiple de X")
  badgeText: string;        // color de texto de la etiqueta de cabecera
  tableHeaderBg: string;    // fondo del encabezado (thead) de la tabla de desglose
  tableHeaderColor: string; // color de texto del encabezado (thead) de la tabla de desglose
  tableBorder: string;      // borde de las celdas de la tabla de premios
  totalBannerBg: string;    // fondo del banner de total de apuestas premiadas
  totalBannerText: string;  // color de texto del banner total
  totalBannerValue: string; // color del número total en el banner
  ballWinningBg: string;    // fondo del número principal cuando es acierto
  ballWinningText: string;  // color de texto del número principal cuando es acierto
  secondaryWinningBg: string;    // fondo del número secundario cuando es acierto
  secondaryWinningText: string;  // texto del número secundario cuando es acierto
  secondaryDefaultBg: string;    // fondo del número secundario cuando no es acierto (vista validada)
  secondaryDefaultText: string;  // texto del número secundario cuando no es acierto
  secondaryLabelColor: string;   // color del texto "+ PB:", "+ MB:", "+ ⭐:", "+ 🌙:", "+ 🔑:"
}

export const SHARED_BALL_COLORS = {
  defaultBg: '#f1f5f9',
  defaultText: '#1e293b',
  neutralText: '#64748b',
  starDefaultBg: '#fbbf24',
  starDefaultText: '#000000',
  starWinningGradient: 'linear-gradient(135deg, #ffd700, #ffa000)',
};

export const GAME_COLORS: { [gameId: string]: GameColorPalette } = {
  powerball: {
    cardBg: '#fff1f2',
    cardBorderThick: '#fecdd3',
    cardBorderThin: '#fecdd3',
    headerText: '#9f1239',
    accentText: '#be123c',
    rowHighlightBg: '#ffe4e6',
    neutralText: '#64748b',
    secondaryEmoji: '🔴',
    badgeBg: '#be123c',
    badgeText: '#ffffff',
    tableHeaderBg: '#ffe4e6',
    tableHeaderColor: '#881337',
    tableBorder: '#fecdd3',
    totalBannerBg: '#9f1239',
    totalBannerText: '#ffffff',
    totalBannerValue: '#fef08a',
    ballWinningBg: '#e11d48',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#9f1239',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#fda4af', // Nota: en vista no validada usa #e11d48
    secondaryDefaultText: '#ffffff',
    secondaryLabelColor: '#be123c',
  },
  megamillions: {
    cardBg: '#fefce8',
    cardBorderThick: '#fde047',
    cardBorderThin: '#fde047',
    headerText: '#854d0e',
    accentText: '#ca8a04',
    rowHighlightBg: '#fefce8',
    neutralText: '#64748b',
    secondaryEmoji: '🟡',
    badgeBg: '#ca8a04',
    badgeText: '#ffffff',
    tableHeaderBg: '#fef08a',
    tableHeaderColor: '#854d0e',
    tableBorder: '#fde047',
    totalBannerBg: '#a16207',
    totalBannerText: '#ffffff',
    totalBannerValue: '#fef08a',
    ballWinningBg: '#eab308',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#854d0e',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#fde047',
    secondaryDefaultText: '#854d0e',
    secondaryLabelColor: '#a16207',
  },
  euromillones: {
    cardBg: '#fefce8',
    cardBorderThick: '#fde047',
    cardBorderThin: '#fde047',
    headerText: '#854d0e',
    accentText: '#a16207',
    rowHighlightBg: '#fefce8',
    neutralText: '#64748b',
    secondaryEmoji: '⭐',
    badgeBg: '#eab308',
    badgeText: '#000000',
    tableHeaderBg: '#fef08a',
    tableHeaderColor: '#713f12',
    tableBorder: '#fde047',
    totalBannerBg: '#ca8a04',
    totalBannerText: '#ffffff',
    totalBannerValue: '#ffffff',
    ballWinningBg: '#2563eb',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#eab308',
    secondaryWinningText: '#000000',
    secondaryDefaultBg: '#fef08a',
    secondaryDefaultText: '#854d0e',
    secondaryLabelColor: '#d97706',
  },
  eurodreams: {
    cardBg: '#f0f9ff',
    cardBorderThick: '#38bdf8',
    cardBorderThin: '#bae6fd', // Borde más claro en no-validado
    headerText: '#0369a1',
    accentText: '#0284c7',
    rowHighlightBg: '#f0f9ff',
    neutralText: '#64748b',
    secondaryEmoji: '🌙',
    badgeBg: '#38bdf8',
    badgeText: '#ffffff',
    tableHeaderBg: '#bae6fd',
    tableHeaderColor: '#0369a1',
    tableBorder: '#bae6fd', // Nota: en <thead> del código original se usó border: 1px solid #7dd3fc
    totalBannerBg: '#0284c7',
    totalBannerText: '#ffffff',
    totalBannerValue: '#ffffff',
    ballWinningBg: '#0284c7',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#38bdf8',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#e0f2fe',
    secondaryDefaultText: '#0369a1',
    secondaryLabelColor: '#0284c7',
  },
  gordo: {
    cardBg: '#faf5ff',
    cardBorderThick: '#c084fc',
    cardBorderThin: '#e9d5ff', // Borde más claro en no-validado
    headerText: '#6b21a8',
    accentText: '#7e22ce',
    rowHighlightBg: '#faf5ff',
    neutralText: '#64748b',
    secondaryEmoji: '🔑',
    badgeBg: '#a855f7',
    badgeText: '#ffffff',
    tableHeaderBg: '#e9d5ff',
    tableHeaderColor: '#6b21a8',
    tableBorder: '#e9d5ff', // Nota: en <thead> del código original se usó border: 1px solid #d8b4fe
    totalBannerBg: '#7e22ce',
    totalBannerText: '#ffffff',
    totalBannerValue: '#ffffff',
    ballWinningBg: '#7e22ce',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#a855f7',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#f3e8ff',
    secondaryDefaultText: '#6b21a8',
    secondaryLabelColor: '#7e22ce',
  },
  bonoloto: {
    cardBg: '#ecfdf5',
    cardBorderThick: '#6ee7b7',
    cardBorderThin: '#6ee7b7',
    headerText: '#065f46',
    accentText: '#059669',
    rowHighlightBg: '#d1fae5',
    neutralText: '#64748b',
    secondaryEmoji: '',
    badgeBg: '#059669',
    badgeText: '#ffffff',
    tableHeaderBg: '#d1fae5',
    tableHeaderColor: '#065f46',
    tableBorder: '#6ee7b7',
    totalBannerBg: '#059669',
    totalBannerText: '#ffffff',
    totalBannerValue: '#fef08a',
    ballWinningBg: 'var(--secondary)',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#059669',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#d1fae5',
    secondaryDefaultText: '#065f46',
    secondaryLabelColor: '#059669',
  },
  primitiva: {
    cardBg: '#fff7ed',
    cardBorderThick: '#fdba74',
    cardBorderThin: '#fdba74',
    headerText: '#9a3412',
    accentText: '#ea580c',
    rowHighlightBg: '#ffedd5',
    neutralText: '#64748b',
    secondaryEmoji: '',
    badgeBg: '#ea580c',
    badgeText: '#ffffff',
    tableHeaderBg: '#ffedd5',
    tableHeaderColor: '#9a3412',
    tableBorder: '#fdba74',
    totalBannerBg: '#ea580c',
    totalBannerText: '#ffffff',
    totalBannerValue: '#fef08a',
    ballWinningBg: 'var(--secondary)',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#ea580c',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#ffedd5',
    secondaryDefaultText: '#9a3412',
    secondaryLabelColor: '#ea580c',
  },
  nacional: {
    cardBg: '#eef2ff',
    cardBorderThick: '#c7d2fe',
    cardBorderThin: '#c7d2fe',
    headerText: '#3730a3',
    accentText: '#4f46e5',
    rowHighlightBg: '#e0e7ff',
    neutralText: '#64748b',
    secondaryEmoji: '',
    badgeBg: '#4f46e5',
    badgeText: '#ffffff',
    tableHeaderBg: '#e0e7ff',
    tableHeaderColor: '#3730a3',
    tableBorder: '#c7d2fe',
    totalBannerBg: '#4f46e5',
    totalBannerText: '#ffffff',
    totalBannerValue: '#fef08a',
    ballWinningBg: 'var(--secondary)',
    ballWinningText: '#ffffff',
    secondaryWinningBg: '#4f46e5',
    secondaryWinningText: '#ffffff',
    secondaryDefaultBg: '#e0e7ff',
    secondaryDefaultText: '#3730a3',
    secondaryLabelColor: '#4f46e5',
  },
};

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
    numbersLayout: { type: 'sequential', columns: 7 },
    secondaryLayout: { type: 'sequential', columns: 7 },
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
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTldnVc-SYBtpoaZtQpvTL3kZXgjkjgudBHFoX8b_GUaNy096j840hXQY4DSVCiGlvDeSYgfLYJGkfl/pub?output=csv',
    maxNumbers: 5,
    numberRange: 70,
    maxStars: 1,
    starRange: 25,
    starName: 'Mega Ball',
    gridCols: 10,
    numbersLayout: { type: 'column-chunk', chunkSize: 14 },
    secondaryLayout: { type: 'column-chunk', chunkSize: 5 },
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
    numbersLayout: { type: 'column-chunk', chunkSize: 9 },
    secondaryLayout: { type: 'column-chunk', chunkSize: 4 },
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
    numbersLayout: { type: 'sequential', columns: 5 },
    secondaryLayout: { type: 'sequential', columns: 3 },
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
    numbersLayout: { type: 'decade-column' },
    secondaryLayout: { type: 'sequential', columns: 10 },
    secondaryStartAt: 0,
    allowedDays: [0, 1, 2, 3, 4, 5, 6],
    theoreticalProbabilities: { '6': 0.00000715, '5': 0.00184, '4': 0.0969, '3': 1.765, '<=2': 98.136 },
    jackpotThresholds: { excellent: 2000000, good: 1000000 },
    restaurarFiltrosLevel: { pLow: 0.10, pHigh: 0.90 },
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
    numbersLayout: { type: 'decade-column' },
    secondaryLayout: { type: 'sequential', columns: 10 },
    secondaryStartAt: 0,
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
    numbersLayout: { type: 'decade-column' },
    secondaryLayout: { type: 'sequential', columns: 5 },
    secondaryStartAt: 0,
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
