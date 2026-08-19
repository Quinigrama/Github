// ============================================
// SISTEMA DE ALMACENAMIENTO PERSISTENTE
// ============================================
import { GAMES, GameConfig, getGameConfig, getDefaultFiltersForGame, getAllGames } from "./game-configs";
import { Draw, Ticket, Penia, PeniaAlert, PeniaChatMessage, PositionRangeFilter, PositionRangeConfig } from './src/types';
import {
  nCr,
  getCombinations,
  calculateTicketCost,
  calculatePowerballCascade,
  calculateMegaMillionsCascade,
  calculateEuromillonesCascade,
  calculateEurodreamsCascade,
  calculateGordoCascade,
  calculateDrawPrize,
  getMultipleCombinationsCount as getMultipleCombinationsCountUtil,
  getCommonConsecutivePatterns as getCommonConsecutivePatternsUtil,
  getTicketValidationData as getTicketValidationDataUtil,
  getWinningTicketInfo as getWinningTicketInfoUtil,
  getTicketWinningTiers,
  getTicketPrizeSummary as getTicketPrizeSummaryUtil,
  classifyNumbers as classifyNumbersUtil
} from './src/utils/combinatorial';
import {
  generate6CharPeniaCode,
  serializePeniaForFirestore,
  deserializePeniaFromFirestore,
  savePeniaToFirestore as savePeniaToFirestoreService,
  fetchPeniaByCode,
  deletePeniaFromFirestore,
  subscribeToPenias
} from './src/services/peniaService';
import {
  GridLayout,
  getLayoutDimensions,
  getNumberAtPosition,
  getNumberCoords,
  buildCoordsLookup,
  getCoordsLookup,
  isLine,
  isDiagonal,
  isSpaced,
  hasGeometricPattern,
  generateRandomCombination
} from './src/utils/geometry';
import { runFilterAudit } from './src/utils/filterAudit';
import { t, initI18n, setLocale, getLocale } from './src/utils/i18n';
import { getCombinationStats, calculateTicketMetrics } from './src/utils/combinatorial';
import { calculateOptimizationScore } from './src/utils/optimizer';
import { getPopularityWeight, getNashScoreAverage } from './src/utils/popularity';
import { getSumSeriesWithRegression } from './src/utils/regression';
import { analizarTodosLosNumeros, aplicarFiltroGap, calcularGaps, percentilHueco, construirHistogramaGaps } from './src/utils/gapFilter';
import { construirMatrizPares, rankingPares, rankingTrios } from './src/utils/coocurrencia';
import {
  orderedPercentileExclusion,
  nominalActivationSet
} from './src/utils/roberTheorem';
import { isValidCombination as validateCombination, isValidCombination } from './src/utils/combinationValidator';
import {
  DEFAULT_TOLERANCE_LEVELS,
  findValidCombinations as runFindValidCombinations,
  findValidSuperset as runFindValidSuperset,
  findAndRankWinningCombinations as runFindAndRankWinningCombinations
} from './src/utils/combinationFinder';
import { calculateAllPositionRanges, percentile } from './src/utils/orderStatistics';
import {
  saveAppStateToStorage,
  loadAppStateFromStorage,
  loadFilterPresetFromStorage,
  APP_STATE_KEY,
  FILTER_PRESET_KEY
} from './src/utils/storage';

export type { Draw, Ticket, Penia, PeniaAlert, PeniaChatMessage };
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  onSnapshot,
  getDocs,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig);
export function showConfirmModal(title: string, message: string, confirmText: string = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('genericConfirmModal');
    const titleEl = document.getElementById('genericConfirmTitle');
    const messageEl = document.getElementById('genericConfirmMessage');
    const okBtn = document.getElementById('genericConfirmOkBtn');
    const cancelBtn = document.getElementById('genericConfirmCancelBtn');
    const closeBtn = document.getElementById('genericConfirmCloseBtn');

    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn || !closeBtn) {
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmText;

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);

    modal.style.display = 'block';
  });
}

export const firebaseAuth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp, (firebaseConfig as any).firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo: firebaseAuth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Filters {
  terminaciones: number[];
  excluirDecenas?: number[];
  excluirTerminaciones?: number[];
  excluirStarDecades?: number[];
  terminacionesDistintas: number[];
  sum: { min: number; max: number };
  parImpar: string[];
  bajosAltos: string[];
  primos: { min: number; max: number };
  consecutivos: string[];
  distancia: { min: number; max: number };
  agrupDecenas: string[];
  sumaDigitos: { min: number; max: number };
  desviacion: { min: number; max: number };
  entropyTerminaciones: { min: number; max: number };
  entropyIntervalos: { min: number; max: number };
  geometric: { exclude: string[]; favor: string[] };
  positionRange?: PositionRangeFilter;
  excludeHistoricalMatchFull?: boolean;
  excludeHistoricalMatchNearFull?: boolean;
  // Star filters
  starSum: { min: number; max: number };
  starParImpar: string[];
  starBajosAltos: string[];
  starSumaDigitos: { min: number; max: number };
  starPrimos: { min: number; max: number };
  starConsecutivos: string[];
  starDistancia: { min: number; max: number };
  starPositionRange?: PositionRangeFilter;
  useMarkov: boolean;
  useNash: boolean;
  useRegression: boolean;
  gapPercentilEnabled?: boolean;
  gapPercentilUmbral?: number;
  nashStrictMode?: boolean;
  nashMinScore?: number;
  nashMaxScore?: number;
  ai: {
    markovDepth: number;
    nashWeight: number;
    regressionBonus: number;
  };
  // Lotería Nacional specific filters
  nacionalSumaDigitos?: { min: number; max: number };
  nacionalCapicua?: string;
  nacionalPrimo?: string;
  nacionalCuadradoCubo?: string;
  nacionalRepdigits?: string;
  nacionalMultiploDe?: number;
  nacionalFranja?: { min: number; max: number };
  nacionalObjetivo?: string;
  nacionalDistanciaObjetivo?: { min: number; max: number };
  nacionalParidad?: string[]; // 5-length array
  nacionalAltoBajo?: string[];  // 5-length array
  nacionalConsecutivos?: string;
  nacionalSumaMitades?: string;
  nacionalParesConteo?: string[];
  nacionalAltosConteo?: string[];
  nacionalUnicos?: number[];
  nacionalModaRepeticiones?: { min: number; max: number };
  nacionalCeros?: string[];
  nacionalPrimosDigitos?: { min: number; max: number };
  nacionalRangoInterno?: { min: number; max: number };
  nacionalDesviacion?: { min: number; max: number };
  nacionalEntropiaDigitos?: { min: number; max: number };
  aiReasoning?: string;
}

interface FilterPreset {
  id: string;
  name: string;
  date: string;
  filters: Filters;
}

// ===== SISTEMA DE APUESTAS REDUCIDAS COBERTURA MATEMÁTICA =====
interface ReducedSystem {
  id: string;
  name: string;
  baseNumbersCount: number;
  combinationsCount: number;
  description: string;
}

const REDUCED_SYSTEMS: { [gameId: string]: ReducedSystem[] } = {
  bonoloto: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 6,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 28,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 86,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 11,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 26,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 53,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  primitiva: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 12,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 56,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 172,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 23,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 53,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 107,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  eurodreams: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 30,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 140,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 430,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 57,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 132,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 267,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores (1 Sueño fijo).'
    }
  ],
  gordo: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (23 apuestas - 34,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (53 apuestas - 79,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (132 apuestas - 198,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (19 apuestas - 28,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (33 apuestas - 49,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (62 apuestas - 93,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (1 Clave fija).'
    }
  ],
  euromillones: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (23 apuestas - 57,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (53 apuestas - 132,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (132 apuestas - 330,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (19 apuestas - 47,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (33 apuestas - 82,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (62 apuestas - 155,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (2 estrellas fijas).'
    }
  ],
  nacional: [],
  powerball: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (23 apuestas)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (53 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (132 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (19 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (33 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (62 apuestas)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores.'
    }
  ],
  megamillions: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (23 apuestas - $46.00)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (53 apuestas - $106.00)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (132 apuestas - $264.00)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (19 apuestas - $38.00)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (33 apuestas - $66.00)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (62 apuestas - $124.00)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    }
  ]
};

export function getGreedyCovering(N: number, K: number, T: number, C: number): number[][] {
  const targets: number[][] = [];
  function genTargets(start: number, current: number[]) {
    if (current.length === T) {
      targets.push([...current]);
      return;
    }
    for (let i = start; i < N; i++) {
      current.push(i);
      genTargets(i + 1, current);
      current.pop();
    }
  }
  genTargets(0, []);

  const candidates: number[][] = [];
  function genCandidates(start: number, current: number[]) {
    if (current.length === K) {
      candidates.push([...current]);
      return;
    }
    for (let i = start; i < N; i++) {
      current.push(i);
      genCandidates(i + 1, current);
      current.pop();
    }
  }
  genCandidates(0, []);

  const targetMasks = targets.map(t => {
    let mask = 0;
    for (const num of t) mask |= (1 << num);
    return mask;
  });

  const candidateMasks = candidates.map(c => {
    let mask = 0;
    for (const num of c) mask |= (1 << num);
    return mask;
  });

  const selectedIndices: number[] = [];
  const uncovered = new Set<number>(targetMasks.keys());

  for (let step = 0; step < C; step++) {
    let bestCandidateIdx = -1;
    let maxCoveredCount = -1;

    for (let i = 0; i < candidates.length; i++) {
      if (selectedIndices.includes(i)) continue;
      const cMask = candidateMasks[i];
      let coveredCount = 0;
      for (const tIdx of uncovered) {
        const tMask = targetMasks[tIdx];
        if ((cMask & tMask) === tMask) {
          coveredCount++;
        }
      }
      if (coveredCount > maxCoveredCount) {
        maxCoveredCount = coveredCount;
        bestCandidateIdx = i;
      }
    }

    if (bestCandidateIdx === -1) {
      for (let i = 0; i < candidates.length; i++) {
        if (!selectedIndices.includes(i)) {
          bestCandidateIdx = i;
          break;
        }
      }
    }

    if (bestCandidateIdx !== -1) {
      selectedIndices.push(bestCandidateIdx);
      const cMask = candidateMasks[bestCandidateIdx];
      for (const tIdx of Array.from(uncovered)) {
        const tMask = targetMasks[tIdx];
        if ((cMask & tMask) === tMask) {
          uncovered.delete(tIdx);
        }
      }
    } else {
      break;
    }
  }

  return selectedIndices.map(idx => candidates[idx]);
}

function renderLayoutGrid(grid: HTMLElement, layout: GridLayout, numberRange: number, startAt: number, type: 'number' | 'star' = 'number') {
  const dims = getLayoutDimensions(layout, numberRange, startAt);
  const container = grid.parentElement as HTMLElement;
  const containerWidth = container ? container.clientWidth : 380;
  const gap = 6;
  const padding = 28; // 14px a cada lado, debe coincidir con el padding real de .numbers-grid/.stars-grid en index.css
  const available = containerWidth - padding - (gap * (dims.columns - 1));
  const rawSize = available / dims.columns;
  const ballSize = Math.max(24, Math.min(44, rawSize));
  grid.style.setProperty('--ball-size', `${ballSize}px`);
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${dims.columns}, var(--ball-size))`;
  grid.style.gridTemplateRows = `repeat(${dims.rows}, var(--ball-size))`;
  grid.innerHTML = '';
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.columns; col++) {
      const n = getNumberAtPosition(row, col, layout, startAt, numberRange);
      const cell = document.createElement('div');
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(col + 1);
      if (n === null) {
        cell.className = type === 'star' ? 'number-ball star-ball grid-gap' : 'number-ball grid-gap';
      } else {
        cell.className = type === 'star' ? 'number-ball star-ball' : 'number-ball';
        cell.dataset.number = String(n);
        cell.dataset.type = type;
        cell.innerHTML = `${n}<span class="number-icon"></span>`;
      }
      grid.appendChild(cell);
    }
  }
}

// Clase principal de la aplicación
class DataLotto49Advanced {
  getNumberCoords(n: number) {
    if (this.currentGame?.numbersLayout) {
      const startAt = this.currentGame.numbersStartAt ?? this.currentGame.startAt ?? 1;
      const lookup = getCoordsLookup(this.currentGame.numbersLayout, this.currentGame.numberRange, startAt);
      const c = lookup.get(n);
      if (c) return c;
    }
    return getNumberCoords(n, this.currentGame?.gridCols || 10);
  }
  
  static APP_STATE_KEY = APP_STATE_KEY;
  static FILTER_PRESET_KEY = FILTER_PRESET_KEY;


    // FIX: Declared all class properties with their correct types to resolve property-does-not-exist errors.
    selectedNumbers: Set<number>;
    reducedBaseNumbers: Set<number>;
    selectedStars: Set<number>; // New for Euromillones
    suggestedNumbers: Set<number>; // New for Big Data
    suggestedStars: Set<number>; // New for Euromillones Big Data
    excludedNumbers: Set<number>;
    excludedStars: Set<number>; // New for Euromillones
    excludedDecades: Set<number>;
    excludedDecadesSnapshot: Map<number, number[]>;
    excludedTerminaciones: Set<number>;
    excludedTerminacionesSnapshot: Map<number, number[]>;
    excludedStarDecades: Set<number>;
    excludedStarDecadesSnapshot: Map<number, number[]>;
    hotNumbers: Set<number>;
    hotStars: Set<number>; // New for Euromillones
    coldNumbers: Set<number>;
    coldStars: Set<number>; // New for Euromillones
    absentNumbers: Set<number>;
    absentStars: Set<number>; // New for Euromillones
    favoriteNumbers: Set<number>; // New for Favorites
    favoriteStars: Set<number>; // New for Euromillones Favorites
    favoriteGames: Set<string>; // New for Game Database Favorites
    customGameUrls: { [key: string]: string }; // New for custom URLs
    filterPresets: FilterPreset[]; // New for named filter presets
    gameFilters: { [gameId: string]: Filters }; // NEW: Independent filters per game
    currentSelectionMode: 'excluded' | 'hot' | 'cold' | 'figure' | 'absent' | 'favorites' | null;
    isGenerating: boolean;
    lastMultipleStats: { validCount: number, totalCount: number } | null;
    lastDebugInfo: string;
    savedTickets: Ticket[];
    currentTicket: Ticket | null;
    currentValidatingTicket: Ticket | null;
    historicalData: Draw[];
    allHistoricalData: Draw[];
    nacionalDrawFilter: 'all' | 'navidad' | 'nino';
    numberStats: { [key: number]: { frequency: number; score: number; lastSeen: number; } };
    starStats: { [key: number]: { frequency: number; score: number; lastSeen: number; } }; // New for Euromillones
    analysisPeriod: number;
    dataLoaded: boolean;
    dataType: string;
    filters: Filters;
    primes: Set<number>;
    TOLERANCE_LEVELS: { [key: number]: number };
    currentGame: GameConfig;
    anonymousUserId: string;
    googleAuthToken: string | null = null;
    googleUser: User | null = null;
    vizMode: 'heatmap' | 'ranking' | 'trend' | 'chi' | 'gaps' | 'coocurrencia' = 'heatmap';
    selectedGapNumber: number = 1;
    coocurrenciaModo: 'pares' | 'trios' = 'pares';
    vizTarget: 'number' | 'star' = 'number';
    currentStatsFilterKey: string | null = null;
    officialDrawsPage: number = 1;
    officialDrawsPageSize: number = 20;
    officialDrawsSearchQuery: string = '';
    nashScoreDistributionCache: { gameId: string; binEdges: number[]; counts: number[] } | null = null;

    // New Correlation UI elements
    correlationScoreContainer: HTMLElement | null = null;
    correlationScoreValue: HTMLElement | null = null;
    correlationScoreBar: HTMLElement | null = null;
    correlationAdvice: HTMLElement | null = null;


    // New Trend UI elements
    drawTrendPanel: HTMLElement | null = null;
    currentTrendLabel: HTMLElement | null = null;
    trendRecommendation: HTMLElement | null = null;
    suggestedProfile: HTMLElement | null = null;
    currentSuggestedProfile: { hot: number; neutral: number; cold: number; starHot?: number; starNeutral?: number; starCold?: number } = { hot: 2, neutral: 3, cold: 1 };
    filterPanelMode: 'simple' | 'expert' = 'simple';
    penias: Penia[] = [];
    activePeniaId: string | null = null;
    userAlias: string = 'Usuario';
    peniaUnsubscribe?: () => void;
    gameDataTypes: { [key: string]: string } = {};
    gameHistoricalData: { [key: string]: any[] } = {};
    drawCalYear: number = new Date().getFullYear();
    drawCalMonth: number = new Date().getMonth();
    powerPlayActive: boolean = false;
    gapFilterSnapshotAntes: Set<number> | null = null;
    gapFilterExclusionesPropias: Set<number> = new Set();
    toastQueue: Array<{ message: string; type: string; customDuration?: number; priority: number; timestamp: number }> = [];
    isToastShowing: boolean = false;
    currentToastTimer: any = null;
    lastToastMessages: Map<string, number> = new Map();

  nCr(n: number, r: number): number {
    return nCr(n, r);
  }

  calculateTicketCost(ticket: { gameId?: string; strategy?: string; combinations: number[][]; stars?: number[][]; hasPowerPlay?: boolean }): {
    totalBets: number;
    costPerBet: number;
    totalCost: number;
    currency: string;
    formattedCost: string;
  } {
    return calculateTicketCost(ticket, this.currentGame?.id);
  }

  calculatePowerballCascade(
    ticket: Ticket,
    winningNumbers: number[],
    winningStars: number[] = []
  ) {
    return calculatePowerballCascade(ticket, winningNumbers, winningStars);
  }

  calculateMegaMillionsCascade(
    ticket: Ticket,
    winningNumbers: number[],
    winningStars: number[] = []
  ) {
    return calculateMegaMillionsCascade(ticket, winningNumbers, winningStars);
  }

  calculateEuromillonesCascade(
    ticket: Ticket,
    winningNumbers: number[],
    winningStars: number[] = []
  ) {
    return calculateEuromillonesCascade(ticket, winningNumbers, winningStars);
  }

  calculateEurodreamsCascade(
    ticket: { strategy?: string; combinations: number[][]; stars?: number[][] },
    winningNumbers: number[],
    winningStars: number[] = []
  ) {
    return calculateEurodreamsCascade(ticket, winningNumbers, winningStars);
  }

  calculateGordoCascade(
    ticket: { strategy?: string; combinations: number[][]; stars?: number[][] },
    winningNumbers: number[],
    winningStars: number[] = []
  ) {
    return calculateGordoCascade(ticket, winningNumbers, winningStars);
  }

  constructor() {
    // Estado del sistema
    this.selectedNumbers = new Set();
    this.reducedBaseNumbers = new Set();
    this.selectedStars = new Set();
    this.suggestedNumbers = new Set();
    this.suggestedStars = new Set();
    this.excludedNumbers = new Set();
    this.excludedStars = new Set();
    this.excludedDecades = new Set();
    this.excludedDecadesSnapshot = new Map();
    this.excludedTerminaciones = new Set();
    this.excludedTerminacionesSnapshot = new Map();
    this.excludedStarDecades = new Set();
    this.excludedStarDecadesSnapshot = new Map();
    this.hotNumbers = new Set();
    this.hotStars = new Set();
    this.coldNumbers = new Set();
    this.coldStars = new Set();
    this.absentNumbers = new Set();
    this.absentStars = new Set();
    this.favoriteNumbers = new Set();
    this.favoriteStars = new Set();
    this.favoriteGames = new Set();
    this.currentGame = GAMES['powerball'];
    this.customGameUrls = {
        powerball: '',
        bonoloto: '',
        primitiva: '',
        euromillones: '',
        eurodreams: '',
        gordo: '',
        nacional: ''
    };
    this.filterPresets = [];
    this.gameFilters = {};
    
    // Initialize default filters for each game
    Object.keys(GAMES).forEach(id => {
        this.gameFilters[id] = this.getDefaultFiltersForGame(id);
    });

    this.currentSelectionMode = null; // null | 'excluded' | 'hot' | 'cold' | 'figure' | 'absent' | 'favorites'
    this.isGenerating = false;
    this.lastDebugInfo = '';
    this.lastMultipleStats = null;
    this.savedTickets = [];
    this.currentTicket = null;
    this.currentValidatingTicket = null;
    this.historicalData = [];
    this.allHistoricalData = [];
    this.nacionalDrawFilter = 'all';
    this.numberStats = {};
    this.starStats = {};
    this.analysisPeriod = 100;
    this.dataLoaded = false;
    this.dataType = 'none';
    this.nashScoreDistributionCache = null;
    this.toastQueue = [];
    this.isToastShowing = false;
    this.currentToastTimer = null;
    this.lastToastMessages = new Map();

    // Initialize UI elements
    this.correlationScoreContainer = document.getElementById('correlationScoreContainer');
    this.correlationScoreValue = document.getElementById('correlationScoreValue');
    this.correlationScoreBar = document.getElementById('correlationScoreBar');
    this.correlationAdvice = document.getElementById('correlationAdvice');

    // Initialize Trend UI elements
    this.drawTrendPanel = document.getElementById('drawTrendPanel');
    this.currentTrendLabel = document.getElementById('currentTrendLabel');
    this.trendRecommendation = document.getElementById('trendRecommendation');
    this.suggestedProfile = document.getElementById('suggestedProfile');

    this.filters = this.gameFilters[this.currentGame.id];
    
    // Constantes y pre-cálculos
    this.primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);
    this.TOLERANCE_LEVELS = { // Niveles de tolerancia para la estrategia Múltiple
        7: 0.70,
        8: 0.50,
        9: 0.35,
        10: 0.25,
        11: 0.20
    };
    
    this.init();
  }

  async init() {
    await initI18n();

    onAuthStateChanged(firebaseAuth, (user) => {
      this.googleUser = user;
    });

    let anonId = localStorage.getItem('datalotto_anon_id');
    if (!anonId) {
        const alfabeto = '0123456789abcdefghijklmnopqrstuvwxyz';
        let codigo = '';
        for (let i = 0; i < 8; i++) {
            codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
        }
        anonId = 'usr_' + codigo;
        localStorage.setItem('datalotto_anon_id', anonId);
    }
    this.anonymousUserId = anonId;

    this.loadState();
    this.createNumbersGrid();

    // Ensure sidebar has the correct active game class from the loaded game
    document.querySelectorAll('.sidebar-links li').forEach(li => {
      li.classList.remove('active');
    });
    const activeLi = document.getElementById(`game-${this.currentGame.id}`);
    if (activeLi) activeLi.classList.add('active');

    // Update dynamic header title to match loaded game
    this.updateHeaderTitle();

    // Scroll listener for fading out header title on scroll
    window.addEventListener('scroll', () => {
        this.updateTopTitleVisibility();
    }, { passive: true });

    this.updateSidebarGameOrder();
    this.initDarkMode();
    this.initNotificationScheduler();
    this.initFilterPanelMode();
    this.updateUIFromFilterState();
    this.updateGameSpecificUI();
    await this.initializeHistoricalData();
    this.analyzeNumbers();
    this.updateGridNumberStates();
    this.bindEvents();
    this.updateSavedTickets();
    this.updateDataAnalysis();
    this.updateFilterBadgesFromAudit();
    this.populateReducedSystems();
    
    // Initialize Big Data with current day selected
    const daySelect = document.getElementById('nextDrawDay') as HTMLSelectElement;
    if (daySelect) {
        daySelect.value = String(new Date().getDay());
    }
    this.updateBigDataPanel();
    this.checkContractAccepted();

    // Trigger background jackpot fetch for high jackpot alerts
    setTimeout(() => {
        this.fetchAndRenderJackpots(false);
    }, 1500);

    // Trigger runSelfDiagnostics on startup
    setTimeout(() => {
        try {
            this.runSelfDiagnostics();
        } catch (diagErr) {
            console.error("No se pudo iniciar el auto-diagnóstico:", diagErr);
        }
    }, 100);
  }

  getApiUrl(path: string): string {
    // Detect if we are running inside a Capacitor / Cordova mobile app context, standard file context, or local mobile APK
    const isMobileApp = (window as any).Capacitor || 
                        (window as any).cordova ||
                        window.location.protocol === 'capacitor:' || 
                        window.location.protocol === 'file:' ||
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';
                        
    if (isMobileApp) {
      const customApi = localStorage.getItem('customApiServerUrl')?.trim();
      if (customApi) {
        return `${customApi.replace(/\/+$/, '')}${path}`;
      }
      // Active Cloud Run backend deployment URL
      const cloudRunUrl = 'https://ais-pre-lcjdwvzchowyi3tetmqfya-7070977073.europe-west2.run.app';
      return `${cloudRunUrl}${path}`;
    }
    return path;
  }

  async sendTelemetry(eventType: string, payload: any) {
    try {
      await fetch(this.getApiUrl('/api/telemetry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.anonymousUserId,
          event: eventType,
          gameId: this.currentGame.id,
          payload: payload,
          timestamp: new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn('Telemetry failed:', e);
    }
  }

  getGameIconSvg(gameId: string): string {
    switch(gameId) {
      case 'powerball':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="red-sphere-powerball-tsx" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#f87171" />
              <stop offset="60%" stop-color="#dc2626" />
              <stop offset="100%" stop-color="#7f1d1d" />
            </radialGradient>
            <g id="us-star-pb-tsx">
              <polygon points="0,-0.8 0.23,-0.25 0.76,-0.25 0.33,0.07 0.49,0.65 0,0.29 -0.49,0.65 -0.33,0.07 -0.76,-0.25 -0.23,-0.25" fill="#ffffff" />
            </g>
          </defs>

          <!-- Marco con 3 franjas (roja, blanca, roja) -->
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#dc2626" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#dc2626" stroke-width="0.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Esquina azul (cantón de la bandera) -->
          <path d="M 6,20.5 L 6,7 A 3,3 0 0,1 9,4 L 22.5,4" stroke="#1d4ed8" stroke-width="3.6" fill="none" stroke-linecap="square" />

          <!-- Estrella de la esquina + 4 hacia abajo + 4 hacia la derecha -->
          <use href="#us-star-pb-tsx" x="7.5" y="5.5" />
          <use href="#us-star-pb-tsx" x="6" y="8.8" />
          <use href="#us-star-pb-tsx" x="6" y="11.8" />
          <use href="#us-star-pb-tsx" x="6" y="14.8" />
          <use href="#us-star-pb-tsx" x="6" y="17.8" />
          <use href="#us-star-pb-tsx" x="11.0" y="4" />
          <use href="#us-star-pb-tsx" x="14.0" y="4" />
          <use href="#us-star-pb-tsx" x="17.0" y="4" />
          <use href="#us-star-pb-tsx" x="20.0" y="4" />

          <circle cx="20" cy="20" r="12" fill="url(#red-sphere-powerball-tsx)" />
          <circle cx="12.8" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="12.8" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">P</text>
          <circle cx="16.4" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="16.4" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">O</text>
          <circle cx="20.0" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="20.0" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">W</text>
          <circle cx="23.6" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="23.6" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">E</text>
          <circle cx="27.2" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="27.2" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">R</text>
          <text x="20" y="24.5" font-size="4.5" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#ffffff" letter-spacing="0.8">BALL</text>
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'megamillions':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="gold-sphere-megamillions-tsx" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#fde047" />
              <stop offset="60%" stop-color="#eab308" />
              <stop offset="100%" stop-color="#854d0e" />
            </radialGradient>
            <g id="us-star-mm-tsx">
              <polygon points="0,-0.8 0.23,-0.25 0.76,-0.25 0.33,0.07 0.49,0.65 0,0.29 -0.49,0.65 -0.33,0.07 -0.76,-0.25 -0.23,-0.25" fill="#ffffff" />
            </g>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#2563eb" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="#dc2626" stroke-width="0.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 6,20.5 L 6,7 A 3,3 0 0,1 9,4 L 22.5,4" stroke="#1d4ed8" stroke-width="3.6" fill="none" stroke-linecap="square" />
          <use href="#us-star-mm-tsx" x="7.5" y="5.5" />
          <use href="#us-star-mm-tsx" x="6" y="8.8" />
          <use href="#us-star-mm-tsx" x="6" y="11.8" />
          <use href="#us-star-mm-tsx" x="6" y="14.8" />
          <use href="#us-star-mm-tsx" x="6" y="17.8" />
          <use href="#us-star-mm-tsx" x="11.0" y="4" />
          <use href="#us-star-mm-tsx" x="14.0" y="4" />
          <use href="#us-star-mm-tsx" x="17.0" y="4" />
          <use href="#us-star-mm-tsx" x="20.0" y="4" />
          <circle cx="20" cy="20" r="12" fill="url(#gold-sphere-megamillions-tsx)" />
          <circle cx="12.8" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="12.8" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">M</text>
          <circle cx="16.4" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="16.4" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">E</text>
          <circle cx="20.0" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="20.0" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">G</text>
          <circle cx="23.6" cy="15.5" r="1.5" fill="#ffffff" />
          <text x="23.6" y="16.2" font-size="2" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000">A</text>
          <text x="20" y="24.5" font-size="3.8" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#000000" letter-spacing="0.4">MILLIONS</text>
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'bonoloto':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-bonoloto" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
            <linearGradient id="green-gradient-header-bonoloto" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4ade80" />
              <stop offset="100%" stop-color="#15803d" />
            </linearGradient>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-bonoloto)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <g transform="translate(20, 20) scale(0.78) translate(-20, -20)">
            <path d="M 20,20 C 18,25 19,30 23,34" stroke="url(#green-gradient-header-bonoloto)" stroke-width="2.5" stroke-linecap="round" fill="none" />
            <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" />
            <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(90 20 20)" />
            <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(180 20 20)" />
            <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(270 20 20)" />
          </g>
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'primitiva':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-primitiva" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
            <radialGradient id="green-sphere-header-primitiva" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#4ade80" />
              <stop offset="60%" stop-color="#16a34a" />
              <stop offset="100%" stop-color="#14532d" />
            </radialGradient>
            <mask id="primitiva-header-mask">
              <rect x="0" y="0" width="40" height="40" fill="#ffffff" />
              <line x1="5" y1="13" x2="35" y2="13" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="16.5" x2="35" y2="16.5" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="20" x2="35" y2="20" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="23.5" x2="35" y2="23.5" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="27" x2="35" y2="27" stroke="#000000" stroke-width="1.5" />
              <line x1="20" y1="5" x2="20" y2="35" stroke="#000000" stroke-width="1.2" />
              <path d="M 20,9 Q 13,20 20,31" fill="none" stroke="#000000" stroke-width="1.2" />
              <path d="M 20,9 Q 27,20 20,31" fill="none" stroke="#000000" stroke-width="1.2" />
            </mask>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-primitiva)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="20" cy="20" r="11" fill="url(#green-sphere-header-primitiva)" mask="url(#primitiva-header-mask)" />
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'gordo':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-gordo" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
            <radialGradient id="red-sphere-header-gordo" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#fca5a5" />
              <stop offset="60%" stop-color="#dc2626" />
              <stop offset="100%" stop-color="#7f1d1d" />
            </radialGradient>
            <mask id="gordo-header-mask">
              <rect x="0" y="0" width="40" height="40" fill="#ffffff" />
              <line x1="5" y1="13" x2="35" y2="13" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="16.5" x2="35" y2="16.5" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="20" x2="35" y2="20" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="23.5" x2="35" y2="23.5" stroke="#000000" stroke-width="1.5" />
              <line x1="5" y1="27" x2="35" y2="27" stroke="#000000" stroke-width="1.5" />
              <line x1="20" y1="5" x2="20" y2="35" stroke="#000000" stroke-width="1.2" />
              <path d="M 20,9 Q 13,20 20,31" fill="none" stroke="#000000" stroke-width="1.2" />
              <path d="M 20,9 Q 27,20 20,31" fill="none" stroke="#000000" stroke-width="1.2" />
            </mask>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-gordo)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="20" cy="20" r="11" fill="url(#red-sphere-header-gordo)" mask="url(#gordo-header-mask)" />
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'euromillones':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-euromillones" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
            <linearGradient id="blue-metallic-header-euromillones" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1e40af" />
              <stop offset="40%" stop-color="#3b82f6" />
              <stop offset="70%" stop-color="#1d4ed8" />
              <stop offset="100%" stop-color="#172554" />
            </linearGradient>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-euromillones)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="20" cy="20" r="12.5" stroke="url(#blue-metallic-header-euromillones)" stroke-width="2.2" fill="none" />
          <circle cx="20" cy="20" r="7.5" stroke="url(#blue-metallic-header-euromillones)" stroke-width="1.2" fill="none" />
          <g transform="translate(20, 10)"><polygon points="0,-1.5 0.4,-0.4 1.5,-0.4 0.6,0.3 0.9,1.4 0,0.7 -0.9,1.4 -0.6,0.3 -1.5,-0.4 -0.4,-0.4" fill="#facc15" /></g>
          <g transform="translate(29.5, 16.9)"><polygon points="0,-1.5 0.4,-0.4 1.5,-0.4 0.6,0.3 0.9,1.4 0,0.7 -0.9,1.4 -0.6,0.3 -1.5,-0.4 -0.4,-0.4" fill="#facc15" /></g>
          <g transform="translate(25.9, 28.1)"><polygon points="0,-1.5 0.4,-0.4 1.5,-0.4 0.6,0.3 0.9,1.4 0,0.7 -0.9,1.4 -0.6,0.3 -1.5,-0.4 -0.4,-0.4" fill="#facc15" /></g>
          <g transform="translate(14.1, 28.1)"><polygon points="0,-1.5 0.4,-0.4 1.5,-0.4 0.6,0.3 0.9,1.4 0,0.7 -0.9,1.4 -0.6,0.3 -1.5,-0.4 -0.4,-0.4" fill="#facc15" /></g>
          <g transform="translate(10.5, 16.9)"><polygon points="0,-1.5 0.4,-0.4 1.5,-0.4 0.6,0.3 0.9,1.4 0,0.7 -0.9,1.4 -0.6,0.3 -1.5,-0.4 -0.4,-0.4" fill="#facc15" /></g>
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'eurodreams':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-eurodreams" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-eurodreams)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <g transform="rotate(0 20 20) translate(0 -6)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#c084fc" /></g>
          <g transform="rotate(36 20 20) translate(0 -10)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#60a5fa" /></g>
          <g transform="rotate(72 20 20) translate(0 -6)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#34d399" /></g>
          <g transform="rotate(108 20 20) translate(0 -10)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#fb923c" /></g>
          <g transform="rotate(144 20 20) translate(0 -6)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#f43f5e" /></g>
          <g transform="rotate(180 20 20) translate(0 -10)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#c084fc" /></g>
          <g transform="rotate(216 20 20) translate(0 -6)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#60a5fa" /></g>
          <g transform="rotate(252 20 20) translate(0 -10)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#34d399" /></g>
          <g transform="rotate(288 20 20) translate(0 -6)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#fb923c" /></g>
          <g transform="rotate(324 20 20) translate(0 -10)"><path d="M 20,20 C 19.2,18.8 19.2,17.2 20,16 C 20.8,17.2 20.8,18.8 20,20" fill="#f43f5e" /></g>
          <circle cx="20" cy="20" r="2.2" fill="#ffffff" />
          <circle cx="20" cy="6" r="0.6" fill="#ffffff" />
          <circle cx="20" cy="34" r="0.6" fill="#ffffff" />
          <circle cx="6" cy="20" r="0.6" fill="#ffffff" />
          <circle cx="34" cy="20" r="0.6" fill="#ffffff" />
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      case 'nacional':
        return `
        <svg class="game-menu-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gold-gradient-header-nacional" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#BF953F" />
              <stop offset="25%" stop-color="#FCF6BA" />
              <stop offset="50%" stop-color="#B38728" />
              <stop offset="75%" stop-color="#FBF5B7" />
              <stop offset="100%" stop-color="#AA771C" />
            </linearGradient>
            <linearGradient id="blue-flat-header-nacional" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#1d4ed8" />
            </linearGradient>
          </defs>
          <path d="M 6,34 L 6,7 A 3,3 0 0,1 9,4 L 31,4 A 3,3 0 0,1 34,7 L 34,34" stroke="url(#gold-gradient-header-nacional)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="20" cy="18" r="10" fill="url(#blue-flat-header-nacional)" />
          <g stroke="rgba(255,255,255,0.75)" stroke-width="0.8" fill="none">
            <line x1="20" y1="8" x2="20" y2="28" />
            <path d="M 13.5,11 A 10,10 0 0,0 13.5,25" />
            <path d="M 17,8.5 A 10,10 0 0,0 17,27.5" />
            <path d="M 23,8.5 A 10,10 0 0,1 23,27.5" />
            <path d="M 26.5,11 A 10,10 0 0,1 26.5,25" />
          </g>
          <line x1="8" y1="18" x2="32" y2="18" stroke="url(#blue-flat-header-nacional)" stroke-width="2" stroke-linecap="round" />
          <rect x="18.5" y="26.5" width="3" height="3" fill="url(#blue-flat-header-nacional)" />
          <path d="M 15,29 L 25,29 L 27,34 C 27,34 26,34 25,34 L 15,34 C 14,34 13,34 13,34 Z" fill="url(#blue-flat-header-nacional)" />
          <path d="M 9,9 L 31,31" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2.5" stroke-linecap="round" pointer-events="none" />
        </svg>
        `;
      default:
        return `🎲`;
    }
  }

  updateHeaderTitle() {
    const headerTitle = document.querySelector('.header h1');
    if (headerTitle) {
        const gameId = this.currentGame.id;
        const iconSvg = this.getGameIconSvg(gameId);
        const titleText = this.currentGame.titleHeader || 'DataLotto';
        headerTitle.innerHTML = `${iconSvg} <span>${titleText}</span>`;
    }
  }

  updateTopTitleVisibility() {
    const topTitle = document.querySelector('.app-top-title') as HTMLElement;
    if (!topTitle) return;
    
    const sidebar = document.getElementById('sidebar');
    const isSidebarOpen = sidebar ? sidebar.classList.contains('open') : false;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    if (isSidebarOpen || scrollTop > 20) {
        topTitle.style.opacity = '0';
        topTitle.style.pointerEvents = 'none';
        topTitle.style.transform = 'translate(-50%, -10px)';
    } else {
        topTitle.style.opacity = '1';
        topTitle.style.pointerEvents = 'none';
        topTitle.style.transform = 'translate(-50%, 0)';
    }
  }



  renderExpandedFilterModal(groupKey: string) {
    const titleEl = document.getElementById('filterInfoExpandedModalTitle');
    const bodyEl = document.getElementById('filterInfoExpandedModalBody');
    if (!titleEl || !bodyEl) return;

    if (groupKey === 'gapPercentil' || groupKey === 'useGapPercentilSwitch') {
      titleEl.textContent = t('filters.gapPercentil.helpTitle');
      bodyEl.innerHTML = t('filters.gapPercentil.helpBody');
      this.toggleModal('filterInfoExpandedModal', true);
      return;
    }

    if (groupKey === 'excludeHistoricalMatches') {
      titleEl.textContent = t('filter.excludeHistoricalMatches.infoTitulo');
      bodyEl.innerHTML = t('filter.excludeHistoricalMatches.infoTexto');
      this.toggleModal('filterInfoExpandedModal', true);
      return;
    }

    titleEl.textContent = t(`filterInfo.${groupKey}.modalTitle`);

    const theory = t(`filterInfo.${groupKey}.modalTheory`);
    const formula = t(`filterInfo.${groupKey}.modalFormula`);
    const example = t(`filterInfo.${groupKey}.modalExample`);
    const mathNote = t(`filterInfo.${groupKey}.modalMathNote`);

    // t() devuelve "[clave]" (con corchetes) cuando la clave no existe en el locale, así
    // que comparar contra la clave sin corchetes nunca detectaba una clave ausente y el
    // modal acababa mostrando el placeholder "[filterInfo.x.modalFormula]" tal cual para
    // cualquier filtro sin fórmula/nota propias. Se detecta por el prefijo "[" en su lugar.
    const hasFormula = !!formula && !formula.startsWith('[filterInfo.');
    const hasMathNote = !!mathNote && !mathNote.startsWith('[filterInfo.');

    bodyEl.innerHTML = `
      <p style="margin-bottom: 14px;">${theory}</p>
      ${hasFormula ? `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid var(--primary); padding: 12px 14px; border-radius: 6px; font-family: monospace; font-size: 0.88rem; margin-bottom: 14px; color: #0f172a;">
          <strong>📐 ${t('filterInfo.shared.formulaLabel')}:</strong> ${formula}
        </div>
      ` : ''}
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 14px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 14px; color: #1e3a8a;">
        💡 <strong>${t('filterInfo.shared.exampleLabel')}:</strong> ${example}
      </div>
      ${hasMathNote ? `
        <div style="font-size: 0.85rem; color: #475569; font-style: italic;">
          📊 ${mathNote}
        </div>
      ` : ''}
    `;

    this.toggleModal('filterInfoExpandedModal', true);
  }

  runSelfDiagnostics() {
    console.log("=== INICIANDO PRUEBAS DE DIAGNÓSTICO DATALOTTO PLATAFORMA ===");
    const diagResults: { name: string; status: 'PASS' | 'WARN' | 'FAIL'; msg: string }[] = [];

    // Test 1: LocalStorage Access
    try {
        const testKey = '__datalotto_diag_test__';
        localStorage.setItem(testKey, '1');
        const retrieved = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        if (retrieved === '1') {
            diagResults.push({ name: 'Acceso a LocalStorage', status: 'PASS', msg: 'Lectura y escritura correcta de persistencia en caché' });
        } else {
            diagResults.push({ name: 'Acceso a LocalStorage', status: 'WARN', msg: 'No se persistieron los datos correctamente' });
        }
    } catch (e: any) {
        diagResults.push({ name: 'Acceso a LocalStorage', status: 'FAIL', msg: `Sandbox/WebView limita almacenamiento: ${e.message}` });
    }

    // Test 2: DOM elements integrity check
    const elementsToVerify = ['numbersGrid', 'generateBtn', 'savedTickets', 'savedTicketsGameFilter'];
    const missingElements = elementsToVerify.filter(id => !document.getElementById(id));
    if (missingElements.length === 0) {
        diagResults.push({ name: 'Integridad del DOM', status: 'PASS', msg: 'Todos los elementos y selectores de la app cargados correctamente' });
    } else {
        diagResults.push({ name: 'Integridad del DOM', status: 'FAIL', msg: `Elementos de la interfaz ausentes: ${missingElements.join(', ')}` });
    }

    // Test 3: Math filters check
    try {
        const maxNums = this.currentGame.maxNumbers;
        const testCombo = Array.from({ length: maxNums }, (_, i) => i + 1);
        const expectedSum = (maxNums * (maxNums + 1)) / 2;
        const stats = this.getCombinationStats(testCombo);
        if (stats && stats.suma === expectedSum) {
            diagResults.push({ name: 'Motor Matemático Interno', status: 'PASS', msg: 'Estadísticas y ecuaciones probabilísticas estables' });
        } else {
            diagResults.push({ name: 'Motor Matemático Interno', status: 'FAIL', msg: `La suma calculada (${stats.suma || 0}) no coincide con el valor esperado (${expectedSum})` });
        }
    } catch (mathErr: any) {
        diagResults.push({ name: 'Motor Matemático Interno', status: 'FAIL', msg: `Fallo de cálculo matemático: ${mathErr.message}` });
    }

    console.table(diagResults);

    // Dynamic State indicator Badge on top Header
    const brandElement = document.querySelector('.logo') || document.querySelector('.header');
    if (brandElement) {
        // Safe remove if already exists
        document.getElementById('datalotto-diagnostics-badge')?.remove();

        const badge = document.createElement('span');
        badge.id = 'datalotto-diagnostics-badge';
        badge.style.cssText = 'font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 99px; font-weight: 500; cursor: pointer; transition: transform 0.2s;';
        
        const hasFailures = diagResults.some(r => r.status === 'FAIL');
        const hasWarnings = diagResults.some(r => r.status === 'WARN');
        
        if (hasFailures) {
            badge.style.color = '#ef4444';
            badge.style.background = '#fef2f2';
            badge.style.border = '1px solid #fecaca';
            badge.textContent = '● Diagnóstico: Crítico 🚨';
        } else if (hasWarnings) {
            badge.style.color = '#f97316';
            badge.style.background = '#fffaf5';
            badge.style.border = '1px solid #fed7aa';
            badge.textContent = '● Diagnóstico: Aviso ⚠️';
        } else {
            badge.style.color = '#10b981';
            badge.style.background = '#f0fdf4';
            badge.style.border = '1px solid #bbf7d0';
            badge.textContent = t('game.platformOk');
        }

        badge.onclick = (e) => {
            e.stopPropagation();
            this.showToast(t('toast.estadoApp', { status: hasFailures ? t('main.estadoAppRequiereAtencion') : t('main.estadoAppPerfecto') }), hasFailures ? 'error' : 'success');
        };

        brandElement.appendChild(badge);
    }
  }

  runFilterAudit(sampleSize = 500) {
    return runFilterAudit(
      sampleSize,
      this.getAvailableUniverse('number'),
      this.getAvailableUniverse('star'),
      this.currentGame,
      this.filters,
      this.primes
    );
  }

  getFilterAuditDisplayName(key: string, fallbackName?: string): string {
    const keyMap: Record<string, string> = {
      sum: 'filters.sumaTotal.titulo',
      terminacionesDistintas: 'filters.variedadTerm.titulo',
      parImpar: 'filters.parImpar.titulo',
      bajosAltos: 'filters.bajosAltos.titulo',
      primos: 'filters.primos.titulo',
      distancia: 'filters.distancia.titulo',
      sumaDigitos: 'filters.sumaDigitos.titulo',
      consecutivos: 'filters.consecutivos.titulo',
      agrupDecenas: 'filters.decenas.titulo',
      desviacion: 'filters.desviacion.titulo',
      positionRange: 'filter.positionRange.title',
      entropyTerminaciones: 'filters.entropiaTerm.titulo',
      entropyIntervalos: 'filters.entropiaInt.titulo',
      geometric: 'filters.geometricos.titulo',
      excluirDecenas: 'filters.excluirDecenas.titulo',
      excluirTerminaciones: 'filters.excluirTerm.titulo',
      excluirStarDecades: 'filters.excluirDecenas.titulo',
      starSum: 'filters.starSuma.titulo',
      starParImpar: 'filters.starParImpar.titulo',
      starBajosAltos: 'filters.starBajosAltos.titulo',
      starSumaDigitos: 'filters.starSumaDigitos.titulo',
      starPrimos: 'filters.starPrimos.titulo',
      starDistancia: 'filters.starDistancia.titulo',
      starConsecutivos: 'filters.starConsecutivos.titulo',
      starPositionRange: 'filter.positionRange.starTitle',
      excluirStarTerminaciones: 'filters.excluirTerm.titulo'
    };

    const i18nKey = keyMap[key];
    if (i18nKey) {
      const translated = t(i18nKey);
      if (translated && !translated.startsWith('[')) {
        return translated;
      }
    }
    return fallbackName || key;
  }

  displayFilterFailureDiagnostics() {
    const ticketDiv = document.getElementById('ticket');
    if (!ticketDiv) return;

    this.updateFilterStateFromUI();
    const { results, actualSampleSize } = this.runFilterAudit(1000);
    console.table(results);

    // Filter results so we only show active filters that actually restrict combinations (percent < 100)
    const activeFilters = Object.keys(results)
      .map(key => ({ key, ...results[key] }))
      .filter(item => item.count > 0 && item.percent < 100);

    ticketDiv.classList.add('show', 'conflict');
    
    if (activeFilters.length === 0) {
      ticketDiv.innerHTML = `
        <div class="ticket-header" style="border-bottom: 2px solid #fee2e2; margin-bottom: 12px; padding-bottom: 10px;">
          <h4 style="color: #dc2626; display: flex; align-items: center; gap: 8px; margin: 0; font-weight: bold;">${t('conflict.generacionIncompleta')}</h4>
          <span style="font-size: 0.8rem; color: #7f1d1d; font-weight: bold;">${t('conflict.filtrosExtremos')}</span>
        </div>
        <div style="padding: 10px 5px; color: #7f1d1d; font-size: 0.9rem; line-height: 1.5;">
          <p style="margin: 0 0 10px 0; font-weight: bold;">${t('conflict.noCombinaciones')}</p>
          <p style="margin: 0 0 15px 0; color: #991b1b; font-size: 0.85rem;">${t('conflict.universoBajo')}</p>
          <button id="resetDiagFiltersBtn" type="button" style="width: auto; max-width: 320px; padding: 10px 20px; margin: 8px auto 0; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; border: 1px solid #7f1d1d; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35); text-transform: uppercase; letter-spacing: 0.03em; pointer-events: auto;">
            <span style="font-size: 1.1rem; pointer-events: none;">⚡</span>
            <span style="pointer-events: none;">${t('conflict.restablecerBoton', { game: this.currentGame.name })}</span>
          </button>
        </div>
      `;
    } else {
      activeFilters.sort((a, b) => a.percent - b.percent);

      let filtersHtml = '';
      activeFilters.forEach((item, index) => {
        const isCritical = item.percent < 8;
        const isBottleneck = index === 0 && item.percent < 30;
        const barColor = isCritical ? '#ef4444' : isBottleneck ? '#f97316' : '#10b981';
        const labelText = isCritical ? t('conflict.bloqueoCritico') : isBottleneck ? t('conflict.filtroRestrictivo') : t('conflict.filtroActivo');
        
        let recommendation = '';
        if (item.key === 'sum') {
          recommendation = t('conflict.rec.sum');
        } else if (item.key === 'terminacionesDistintas') {
          recommendation = t('conflict.rec.terminacionesDistintas');
        } else if (item.key === 'parImpar') {
          recommendation = t('conflict.rec.parImpar');
        } else if (item.key === 'bajosAltos') {
          recommendation = t('conflict.rec.bajosAltos');
        } else if (item.key === 'primos') {
          recommendation = t('conflict.rec.primos');
        } else if (item.key === 'distancia') {
          recommendation = t('conflict.rec.distancia');
        } else if (item.key === 'sumaDigitos') {
          recommendation = t('conflict.rec.sumaDigitos');
        } else if (item.key === 'consecutivos') {
          recommendation = t('conflict.rec.consecutivos');
        } else if (item.key === 'agrupDecenas') {
          recommendation = t('conflict.rec.agrupDecenas');
        } else if (item.key === 'desviacion') {
          recommendation = t('conflict.rec.desviacion');
        } else if (item.key === 'entropyTerminaciones') {
          recommendation = t('conflict.rec.entropyTerminaciones');
        } else if (item.key === 'entropyIntervalos') {
          recommendation = t('conflict.rec.entropyIntervalos');
        } else if (item.key === 'geometric') {
          recommendation = t('conflict.rec.geometric');
        } else if (item.key === 'positionRange') {
          recommendation = t('conflict.rec.positionRange');
        } else if (item.key === 'starPositionRange') {
          recommendation = t('conflict.rec.starPositionRange');
        } else if (item.key?.startsWith('star')) {
          recommendation = t('conflict.rec.star');
        }

        const filterTitle = this.getFilterAuditDisplayName(item.key, item.name);

        filtersHtml += `
          <div style="background: ${isCritical ? '#fff5f5' : '#fffaf5'}; border: 1px solid ${isCritical ? '#fecaca' : '#fed7aa'}; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
              <span style="font-weight: bold; color: #1e293b;">${filterTitle}</span>
              <span style="font-weight: 900; color: ${barColor}">${t('conflict.aprueban', { percent: item.percent })}</span>
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
              <div style="width: ${item.percent}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b;">
              <span>${t('conflict.apuestasPasaron', { passed: item.passed, count: item.count })}</span>
              <span style="font-weight: bold; color: ${barColor}">${labelText}</span>
            </div>
            ${recommendation ? `<div style="font-size: 0.75rem; color: #991b1b; margin-top: 4px; padding: 5px 8px; background: #fee2e2; border-radius: 4px; border-left: 2px solid ${barColor}; font-weight: 500;">${recommendation}</div>` : ''}
          </div>
        `;
      });

      ticketDiv.innerHTML = `
        <div class="ticket-header" style="border-bottom: 2px solid #fee2e2; margin-bottom: 12px; padding-bottom: 10px;">
          <h4 style="color: #dc2626; display: flex; align-items: center; gap: 8px; margin: 0; font-weight: bold;">${t('conflict.tituloDetectado')}</h4>
          <span style="font-size: 0.8rem; color: #7f1d1d; font-weight: bold;">${t('conflict.auditoriaEmbudo')}</span>
        </div>
        <div style="padding: 0 5px; display: flex; flex-direction: column; gap: 15px;">
          <div style="color: #7f1d1d; font-size: 0.85rem; line-height: 1.5; background: #fee2e2; padding: 10px; border-radius: 6px; border-left: 4px solid #ef4444;">
            ${t('conflict.bloqueoMatematico')}
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${filtersHtml}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px; align-items: center;">
            <button id="resetDiagFiltersBtn" type="button" style="width: auto; max-width: 320px; padding: 10px 20px; margin: 8px auto 0; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; border: 1px solid #7f1d1d; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35); text-transform: uppercase; letter-spacing: 0.03em; pointer-events: auto;">
              <span style="font-size: 1.1rem; pointer-events: none;">⚡</span>
              <span style="pointer-events: none;">${t('conflict.restablecerBoton', { game: this.currentGame.name })}</span>
            </button>
            <p style="font-size: 0.75rem; color: #64748b; text-align: center; margin: 0;">
              ${t('conflict.restablecerDescripcion')}
            </p>
          </div>
        </div>
      `;
    }

    const resetBtn = document.getElementById('resetDiagFiltersBtn');
    if (resetBtn) {
      resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await this.resolveFilterConflict();
        } catch (err: any) {
          console.error("Fallo al resolver conflicto de filtros:", err);
        }
      };
    }

    // Scroll to ticket with safety delay and mobile optimization
    setTimeout(() => {
        try {
            ticketDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            ticketDiv.scrollIntoView();
        }
    }, 150);
  }

  resetFiltersToDefault() {
    const defaultFilters = this.getDefaultFiltersForGame(this.currentGame.id);
    this.filters = JSON.parse(JSON.stringify(defaultFilters));
    this.gameFilters[this.currentGame.id] = this.filters;
    this.saveState();
    this.updateUIFromFilterState();
  }

  async resolveFilterConflict() {
    // 0. Reset filters to clean default state for current game
    const defaultFilters = this.getDefaultFiltersForGame(this.currentGame.id);
    this.filters = JSON.parse(JSON.stringify(defaultFilters));
    this.gameFilters[this.currentGame.id] = this.filters;

    // 1. Clear manual exclusions that reduce universe or block numbers
    this.excludedNumbers.clear();
    this.excludedStars.clear();
    this.excludedDecades.clear();
    this.excludedDecadesSnapshot.clear();
    this.excludedStarDecades.clear();
    this.excludedStarDecadesSnapshot.clear();
    this.excludedTerminaciones.clear();
    this.excludedTerminacionesSnapshot.clear();
    this.selectedNumbers.clear();
    this.reducedBaseNumbers.clear();
    this.favoriteNumbers.clear();
    this.hotNumbers.clear();
    this.coldNumbers.clear();
    this.absentNumbers.clear();

    document.querySelectorAll('#excluirDecenasOptions .filter-chip, #excluirDecenasEstrellasOptions .filter-chip, #terminacionesOptions .filter-chip').forEach(c => c.classList.remove('active'));
    this.updateTerminacionesBadge();
    this.updateDecadasBadge();
    this.updateStarDecadasBadge();
    this.updateGridNumberStates();
    this.updateSelectedDisplay();

    let numUniv = this.getAvailableUniverse('number');
    let starUniv = this.currentGame.maxStars > 0 ? this.getAvailableUniverse('star') : [];
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars || 0;

    if (numUniv.length < maxNumbers || (maxStars > 0 && starUniv.length < maxStars)) {
      this.showToast(t('conflict.universoInsuficiente'), 'warning');
      return;
    }

    if (!this.historicalData || this.historicalData.length === 0 || this.currentGame.id === 'nacional') {
      this.resetFiltersToDefault();
      this.saveState();
      this.updateUIFromFilterState();
      this.updateFilterBadgesFromAudit();
      this.showToast(t('conflict.resolutorExito', { level: 1 }), 'success');
      const ticketDiv = document.getElementById('ticket');
      if (ticketDiv) {
        ticketDiv.classList.remove('show', 'conflict');
        ticketDiv.innerHTML = '';
      }
      return;
    }

    const levels = [
      { pLow: 0.05, pHigh: 0.95, z: 1.645, levelNum: 1 },
      { pLow: 0.025, pHigh: 0.975, z: 1.960, levelNum: 2 },
      { pLow: 0, pHigh: 1, z: 2.576, levelNum: 3 }
    ];

    const resultado = await this.tryFilterLevelsWithValidation(levels, numUniv, starUniv);

    if (resultado) {
      this.saveState();
      this.updateUIFromFilterState();
      this.updateFilterBadgesFromAudit();
      const ticketDiv = document.getElementById('ticket');
      if (ticketDiv) {
        ticketDiv.classList.remove('show', 'conflict');
        ticketDiv.innerHTML = '';
      }
      if (resultado.success) {
        this.showToast(t('conflict.resolutorExito', { level: resultado.levelUsed }), 'success');
      } else {
        this.showToast(t('conflict.resolutorAgotado'), 'error');
      }
    }
  }

  async tryFilterLevelsWithValidation(
    levels: { pLow: number; pHigh: number; z?: number; levelNum: number }[],
    numUniv: number[],
    starUniv: number[]
  ): Promise<{ success: boolean; levelUsed: number; resumen: ReturnType<typeof this.applyPercentileFilterLevel> } | null> {
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars || 0;

    for (const level of levels) {
      const resumen = this.applyPercentileFilterLevel(level);

      let validFound = false;
      for (let attempt = 0; attempt < 500; attempt++) {
        const combo = generateRandomCombination(numUniv, maxNumbers);
        const stars = maxStars > 0 ? generateRandomCombination(starUniv, maxStars) : [];
        if (validateCombination(combo, stars, this.currentGame, this.filters, this.primes, false, this.historicalData)) {
          validFound = true;
          break;
        }
      }

      if (validFound || level.levelNum === 3) {
        return { success: true, levelUsed: level.levelNum, resumen };
      }
    }

    const ultimoResumen = this.applyPercentileFilterLevel(levels[levels.length - 1]);
    return { success: false, levelUsed: levels[levels.length - 1].levelNum, resumen: ultimoResumen };
  }

  applyPercentileFilterLevel(level: { pLow: number; pHigh: number; z?: number }) {
    if (!this.historicalData || this.historicalData.length === 0) {
      return {
        sumRange: this.filters.sum,
        parImparCount: Array.isArray(this.filters.parImpar) ? this.filters.parImpar.length : 0,
        bajosAltosCount: Array.isArray(this.filters.bajosAltos) ? this.filters.bajosAltos.length : 0,
        agrupDecenasCount: Array.isArray(this.filters.agrupDecenas) ? this.filters.agrupDecenas.length : 0,
        consecutivosCount: Array.isArray(this.filters.consecutivos) ? this.filters.consecutivos.length : 0,
        entropyTerminaciones: this.filters.entropyTerminaciones,
        entropyIntervalos: this.filters.entropyIntervalos,
        pLow: level.pLow,
        pHigh: level.pHigh
      };
    }

    const zVal = level.z !== undefined ? level.z : (level.pLow === 0 && level.pHigh === 1 ? 2.576 : 1.645);
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars || 0;

    const getDecadePatternKey = (nums: number[]) => {
      const tens: Record<number, number> = {};
      nums.forEach(n => {
        const ten = Math.floor((n - 1) / 10);
        tens[ten] = (tens[ten] || 0) + 1;
      });
      return Object.values(tens).sort((a, b) => b - a).join('/');
    };

    const getConsecutivePatternKey = (nums: number[]) => {
      const sorted = [...nums].sort((a, b) => a - b);
      let pattern = '';
      let count = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          count++;
        } else {
          pattern += count;
          count = 1;
        }
      }
      pattern += count;
      return pattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    };

    const calculateEndingsEntropy = (nums: number[]) => {
      const endingCounts: Record<number, number> = {};
      nums.forEach(n => {
        const ending = n % 10;
        endingCounts[ending] = (endingCounts[ending] || 0) + 1;
      });
      return -Object.values(endingCounts).reduce((s, countVal) => {
        const p = countVal / nums.length;
        return s + p * Math.log2(p);
      }, 0);
    };

    const calculateIntervalsEntropy = (nums: number[]) => {
      const sorted = [...nums].sort((a, b) => a - b);
      const intervalCounts: Record<number, number> = {};
      for (let idx = 0; idx < sorted.length - 1; idx++) {
        const diff = sorted[idx + 1] - sorted[idx];
        intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
      }
      const numIntervals = nums.length - 1;
      if (numIntervals <= 0) return 0;
      return -Object.values(intervalCounts).reduce((s, countVal) => {
        const p = countVal / numIntervals;
        return s + p * Math.log2(p);
      }, 0);
    };

    const histSums = this.historicalData.map((d: any) => d.numbers.reduce((a: number, b: number) => a + b, 0)).sort((a: number, b: number) => a - b);
    const histPrimes = this.historicalData.map((d: any) => d.numbers.filter((n: number) => this.primes.has(n)).length).sort((a: number, b: number) => a - b);
    const histDistances: number[] = [];
    this.historicalData.forEach((d: any) => {
      const s = [...d.numbers].sort((a: number, b: number) => a - b);
      for (let i = 0; i < s.length - 1; i++) {
        histDistances.push(s[i + 1] - s[i]);
      }
    });
    histDistances.sort((a: number, b: number) => a - b);

    const histDigitSums = this.historicalData.map((d: any) => d.numbers.reduce((s: number, n: number) => s + (n < 10 ? n : Math.floor(n / 10) + (n % 10)), 0)).sort((a: number, b: number) => a - b);

    const histStdDevs = this.historicalData.map((d: any) => {
      const mean = d.numbers.reduce((a: number, b: number) => a + b, 0) / d.numbers.length;
      const variance = d.numbers.reduce((s: number, n: number) => s + Math.pow(n - mean, 2), 0) / d.numbers.length;
      return Math.sqrt(variance);
    }).sort((a: number, b: number) => a - b);

    const histTermEntropies = this.historicalData.map((d: any) => calculateEndingsEntropy(d.numbers)).sort((a: number, b: number) => a - b);
    const histIntEntropies = this.historicalData.map((d: any) => calculateIntervalsEntropy(d.numbers)).sort((a: number, b: number) => a - b);

    const histEvens = this.historicalData.map((d: any) => d.numbers.filter((n: number) => n % 2 === 0).length);
    const midPoint = Math.floor(this.currentGame.numberRange / 2);
    const histLows = this.historicalData.map((d: any) => d.numbers.filter((n: number) => n <= midPoint).length);

    const decadeCounts: Record<string, number> = {};
    const consecCounts: Record<string, number> = {};
    this.historicalData.forEach((d: any) => {
      const dk = getDecadePatternKey(d.numbers);
      decadeCounts[dk] = (decadeCounts[dk] || 0) + 1;
      const ck = getConsecutivePatternKey(d.numbers);
      consecCounts[ck] = (consecCounts[ck] || 0) + 1;
    });

    let starSums: number[] = [];
    let starPrimes: number[] = [];
    let starDistances: number[] = [];
    let starDigitSums: number[] = [];
    let starEvens: number[] = [];
    let starLows: number[] = [];
    let starConsecCounts: Record<string, number> = {};

    if (maxStars > 1) {
      starSums = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars.reduce((a: number, b: number) => a + b, 0)).sort((a: number, b: number) => a - b);
      starPrimes = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars.filter((n: number) => this.primes.has(n)).length).sort((a: number, b: number) => a - b);
      starDistances = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => {
        const s = [...d.stars].sort((a: number, b: number) => a - b);
        let minD = Infinity;
        for (let i = 0; i < s.length - 1; i++) {
          const diff = s[i + 1] - s[i];
          if (diff < minD) minD = diff;
        }
        return minD === Infinity ? 1 : minD;
      }).sort((a: number, b: number) => a - b);
      starDigitSums = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars.reduce((s: number, n: number) => s + (n < 10 ? n : Math.floor(n / 10) + (n % 10)), 0)).sort((a: number, b: number) => a - b);
      starEvens = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars.filter((n: number) => n % 2 === 0).length);
      const starMid = Math.floor(this.currentGame.starRange / 2);
      starLows = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars.filter((n: number) => n <= starMid).length);

      this.historicalData.forEach((d: any) => {
        if (d.stars && d.stars.length === maxStars) {
          const ck = getConsecutivePatternKey(d.stars);
          starConsecCounts[ck] = (starConsecCounts[ck] || 0) + 1;
        }
      });
    }

    const allPossibleEvens = Array.from({ length: maxNumbers + 1 }, (_, i) => i);
    const allPossibleLows = Array.from({ length: maxNumbers + 1 }, (_, i) => i);

    if (this.filters.geometric) {
      this.filters.geometric.exclude = [];
    }
    this.filters.nashMinScore = 0.0;
    this.filters.nashMaxScore = 10.0;

    if (level.pLow === 0 && level.pHigh === 1) {
      this.filters.sum = { min: (maxNumbers * (maxNumbers + 1)) / 2, max: this.currentGame.numberRange * maxNumbers };
      this.filters.primos = { min: 0, max: maxNumbers };
      this.filters.distancia = { min: 1, max: this.currentGame.numberRange };
      this.filters.sumaDigitos = { min: 1, max: maxNumbers * 18 };
      this.filters.desviacion = { min: 0, max: 99 };
      this.filters.entropyTerminaciones = { min: 0, max: 5 };
      this.filters.entropyIntervalos = { min: 0, max: 5 };
      this.filters.parImpar = allPossibleEvens.map(e => `${e}/${maxNumbers - e}`);
      this.filters.bajosAltos = allPossibleLows.map(l => `${l}/${maxNumbers - l}`);
      this.filters.agrupDecenas = Array.from(nominalActivationSet(decadeCounts, 1.0));
      this.filters.consecutivos = Array.from(nominalActivationSet(consecCounts, 1.0));
      this.filters.terminacionesDistintas = Array.from({ length: maxNumbers }, (_, i) => i + 1);
      this.filters.nashStrictMode = false;
    } else {
      this.filters.sum = { min: percentile(histSums, level.pLow), max: percentile(histSums, level.pHigh) };
      this.filters.primos = { min: percentile(histPrimes, level.pLow), max: percentile(histPrimes, level.pHigh) };
      this.filters.distancia = { min: percentile(histDistances, level.pLow), max: percentile(histDistances, level.pHigh) };
      this.filters.sumaDigitos = { min: percentile(histDigitSums, level.pLow), max: percentile(histDigitSums, level.pHigh) };
      this.filters.desviacion = { min: Number(percentile(histStdDevs, level.pLow).toFixed(1)), max: Number(percentile(histStdDevs, level.pHigh).toFixed(1)) };
      this.filters.entropyTerminaciones = { min: Number(percentile(histTermEntropies, level.pLow).toFixed(3)), max: Number(percentile(histTermEntropies, level.pHigh).toFixed(3)) };
      this.filters.entropyIntervalos = { min: Number(percentile(histIntEntropies, level.pLow).toFixed(3)), max: Number(percentile(histIntEntropies, level.pHigh).toFixed(3)) };

      const { excludedValues: excludedEvens } = orderedPercentileExclusion(histEvens, allPossibleEvens, level.pLow, level.pHigh);
      this.filters.parImpar = allPossibleEvens.filter(e => !excludedEvens.includes(e)).map(e => `${e}/${maxNumbers - e}`);

      const { excludedValues: excludedLows } = orderedPercentileExclusion(histLows, allPossibleLows, level.pLow, level.pHigh);
      this.filters.bajosAltos = allPossibleLows.filter(l => !excludedLows.includes(l)).map(l => `${l}/${maxNumbers - l}`);

      const targetMass = 1.0 - level.pLow * 2;
      this.filters.agrupDecenas = Array.from(nominalActivationSet(decadeCounts, targetMass));
      this.filters.consecutivos = Array.from(nominalActivationSet(consecCounts, targetMass));
      this.filters.terminacionesDistintas = [maxNumbers - 2, maxNumbers - 1, maxNumbers].filter(v => v >= 2);
    }

    if (!this.filters.positionRange) {
      this.filters.positionRange = { enabled: true, confidenceLevel: zVal, ranges: [] };
    }
    const mainHist = this.historicalData.map((d: any) => d.numbers);
    const ranges = calculateAllPositionRanges(this.currentGame.numberRange, maxNumbers, mainHist, zVal);
    if (level.pLow === 0 && level.pHigh === 1) {
      for (let k = 1; k <= maxNumbers; k++) {
        ranges[k - 1] = { position: k, min: 1, max: this.currentGame.numberRange - (maxNumbers - k), usedHistorical: true };
      }
    }
    this.filters.positionRange.confidenceLevel = zVal;
    this.filters.positionRange.ranges = ranges;

    if (maxStars > 0) {
      if (!this.filters.starPositionRange) {
        this.filters.starPositionRange = { enabled: true, confidenceLevel: zVal, ranges: [] };
      }
      const starHist = this.historicalData.filter((d: any) => d.stars && d.stars.length === maxStars).map((d: any) => d.stars);
      const starRanges = calculateAllPositionRanges(this.currentGame.starRange, maxStars, starHist, zVal);
      if (level.pLow === 0 && level.pHigh === 1) {
        for (let k = 1; k <= maxStars; k++) {
          starRanges[k - 1] = { position: k, min: 1, max: this.currentGame.starRange - (maxStars - k), usedHistorical: true };
        }
      }
      this.filters.starPositionRange.confidenceLevel = zVal;
      this.filters.starPositionRange.ranges = starRanges;
    }

    if (maxStars > 1 && starSums.length > 0) {
      if (level.pLow === 0 && level.pHigh === 1) {
        if (this.filters.starSum) this.filters.starSum = { min: 1, max: this.currentGame.starRange * maxStars };
        if (this.filters.starPrimos) this.filters.starPrimos = { min: 0, max: maxStars };
        if (this.filters.starDistancia) this.filters.starDistancia = { min: 1, max: this.currentGame.starRange };
        if (this.filters.starSumaDigitos) this.filters.starSumaDigitos = { min: 1, max: maxStars * 18 };
        const allPossibleStarEvens = Array.from({ length: maxStars + 1 }, (_, i) => i);
        const allPossibleStarLows = Array.from({ length: maxStars + 1 }, (_, i) => i);
        if (this.filters.starParImpar) this.filters.starParImpar = allPossibleStarEvens.map(e => `${e}/${maxStars - e}`);
        if (this.filters.starBajosAltos) this.filters.starBajosAltos = allPossibleStarLows.map(l => `${l}/${maxStars - l}`);
        if (this.filters.starConsecutivos) this.filters.starConsecutivos = Array.from(nominalActivationSet(starConsecCounts, 1.0));
      } else {
        if (this.filters.starSum) this.filters.starSum = { min: percentile(starSums, level.pLow), max: percentile(starSums, level.pHigh) };
        if (this.filters.starPrimos) this.filters.starPrimos = { min: percentile(starPrimes, level.pLow), max: percentile(starPrimes, level.pHigh) };
        if (this.filters.starDistancia) this.filters.starDistancia = { min: percentile(starDistances, level.pLow), max: percentile(starDistances, level.pHigh) };
        if (this.filters.starSumaDigitos) this.filters.starSumaDigitos = { min: percentile(starDigitSums, level.pLow), max: percentile(starDigitSums, level.pHigh) };

        const allPossibleStarEvens = Array.from({ length: maxStars + 1 }, (_, i) => i);
        const { excludedValues: exStarEvens } = orderedPercentileExclusion(starEvens, allPossibleStarEvens, level.pLow, level.pHigh);
        if (this.filters.starParImpar) this.filters.starParImpar = allPossibleStarEvens.filter(e => !exStarEvens.includes(e)).map(e => `${e}/${maxStars - e}`);

        const allPossibleStarLows = Array.from({ length: maxStars + 1 }, (_, i) => i);
        const { excludedValues: exStarLows } = orderedPercentileExclusion(starLows, allPossibleStarLows, level.pLow, level.pHigh);
        if (this.filters.starBajosAltos) this.filters.starBajosAltos = allPossibleStarLows.filter(l => !exStarLows.includes(l)).map(l => `${l}/${maxStars - l}`);

        const targetMass = 1.0 - level.pLow * 2;
        if (this.filters.starConsecutivos) this.filters.starConsecutivos = Array.from(nominalActivationSet(starConsecCounts, targetMass));
      }
    }

    return {
      sumRange: this.filters.sum,
      parImparCount: this.filters.parImpar.length,
      bajosAltosCount: this.filters.bajosAltos.length,
      agrupDecenasCount: this.filters.agrupDecenas.length,
      consecutivosCount: this.filters.consecutivos.length,
      entropyTerminaciones: this.filters.entropyTerminaciones,
      entropyIntervalos: this.filters.entropyIntervalos,
      pLow: level.pLow,
      pHigh: level.pHigh
    };
  }

  async restaurarFiltros() {
    const defaultFilters = this.getDefaultFiltersForGame(this.currentGame.id);
    this.filters = JSON.parse(JSON.stringify(defaultFilters));
    this.gameFilters[this.currentGame.id] = this.filters;

    if (!this.historicalData || this.historicalData.length === 0 || this.currentGame.id === 'nacional') {
      this.resetFiltersToDefault();
      this.saveState();
      this.updateUIFromFilterState();
      this.updateFilterBadgesFromAudit();
      this.showToast(t('restaurarFiltros.sinHistorico'), 'warning');
      return;
    }

    const numUniv = this.getAvailableUniverse('number');
    const starUniv = this.currentGame.maxStars > 0 ? this.getAvailableUniverse('star') : [];

    const nivelJuego = this.currentGame.restaurarFiltrosLevel || { pLow: 0.05, pHigh: 0.95 };
    const levels = [
      { ...nivelJuego, levelNum: 0 },
      { pLow: 0.05, pHigh: 0.95, z: 1.645, levelNum: 1 },
      { pLow: 0.025, pHigh: 0.975, z: 1.960, levelNum: 2 },
      { pLow: 0, pHigh: 1, z: 2.576, levelNum: 3 }
    ];

    const resultado = await this.tryFilterLevelsWithValidation(levels, numUniv, starUniv);

    if (resultado) {
      this.saveState();
      this.updateUIFromFilterState();
      this.updateFilterBadgesFromAudit();
      this.renderRestaurarFiltrosBlock(resultado.resumen);
      if (resultado.success) {
        const pctReal = Math.round((resultado.resumen.pHigh - resultado.resumen.pLow) * 100);
        this.showToast(t('restaurarFiltros.aplicado', { pct: pctReal }), 'success');
      } else {
        this.showToast(t('conflict.resolutorAgotado'), 'error');
      }
    }
  }

  renderRestaurarFiltrosBlock(resumen: ReturnType<typeof this.applyPercentileFilterLevel>) {
    const container = document.getElementById('restaurarFiltrosBlock');
    const textEl = document.getElementById('restaurarFiltrosText');
    if (!container || !textEl) return;
    const pct = Math.round((resumen.pHigh - resumen.pLow) * 100);
    textEl.innerHTML = t('restaurarFiltros.resumenTexto', {
      pct: String(pct),
      sumaMin: String(resumen.sumRange.min),
      sumaMax: String(resumen.sumRange.max),
      parImparCount: String(resumen.parImparCount),
      agrupCount: String(resumen.agrupDecenasCount),
      consecCount: String(resumen.consecutivosCount)
    });
    container.style.display = 'block';
  }

  showFilterStatsModal(filterKey: string) {
    if (!this.historicalData || this.historicalData.length === 0) {
      this.showToast(t('filterStats.sinHistorico'), 'warning');
      return;
    }
    this.currentStatsFilterKey = filterKey;
    const windowSelect = document.getElementById('filterStatsWindowSelect') as HTMLSelectElement;
    const windowSize = parseInt(windowSelect?.value || '20', 10);

    const titleEl = document.getElementById('filterStatsModalTitle');
    const contentEl = document.getElementById('filterStatsModalContent');
    if (!titleEl || !contentEl) return;

    let html = '';
    switch (filterKey) {
      case 'terminaciones':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloTerminaciones')}`;
        html = this.buildTerminacionesStatsHtml(windowSize);
        break;
      case 'parImpar':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloParImpar')}`;
        html = this.buildParImparStatsHtml(windowSize);
        break;
      case 'sumaTotal':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloSuma')}`;
        html = this.buildSumaStatsHtml(windowSize);
        break;
      case 'decenas':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloDecenas')}`;
        html = this.buildDecenasStatsHtml(windowSize);
        break;
      case 'consecutivos':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloConsecutivos')}`;
        html = this.buildConsecutivosStatsHtml(windowSize);
        break;
      case 'bajosAltos':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloBajosAltos')}`;
        html = this.buildBajosAltosStatsHtml(windowSize);
        break;
      case 'decenasExclusion':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloDecenasExclusion')}`;
        html = this.buildDecenasExclusionStatsHtml(windowSize);
        break;
      case 'variedadTerm':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloVariedadTerm')}`;
        html = this.buildVariedadTerminacionesStatsHtml(windowSize);
        break;
      case 'primos':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloPrimos')}`;
        html = this.buildPrimosStatsHtml(windowSize);
        break;
      case 'entropiaInt':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloEntropiaInt')}`;
        html = this.buildEntropiaIntervalosStatsHtml(windowSize);
        break;
      case 'entropiaTerm':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloEntropiaTerm')}`;
        html = this.buildEntropiaTerminacionesStatsHtml(windowSize);
        break;
      case 'distancia':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloDistancia')}`;
        html = this.buildDistanciaStatsHtml(windowSize);
        break;
      case 'sumaDigitos':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloSumaDigitos')}`;
        html = this.buildSumaDigitosStatsHtml(windowSize);
        break;
      case 'desviacion':
        titleEl.innerHTML = `📊 ${t('filterStats.tituloDesviacion')}`;
        html = this.buildDesviacionStatsHtml(windowSize);
        break;
      default:
        return;
    }
    contentEl.innerHTML = html;
    this.toggleModal('filterStatsModal', true);
  }

  buildTerminacionesStatsHtml(windowSize: number): string {
    const maxNumbers = this.currentGame.maxNumbers || 6;
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const fullTotalNums = totalDraws * maxNumbers;
    const recentTotalNums = recentDrawsCount * maxNumbers;

    const fullCounts = Array(10).fill(0);
    const recentCounts = Array(10).fill(0);
    const lastSeenIndex = Array(10).fill(-1);

    this.historicalData.forEach((draw, idx) => {
      draw.numbers.forEach(num => {
        const digit = Math.abs(num) % 10;
        fullCounts[digit]++;
        lastSeenIndex[digit] = idx;
      });
    });

    recentData.forEach(draw => {
      draw.numbers.forEach(num => {
        const digit = Math.abs(num) % 10;
        recentCounts[digit]++;
      });
    });

    const digitsData = Array.from({ length: 10 }, (_, d) => {
      const drawsSince = lastSeenIndex[d] === -1 ? totalDraws : (totalDraws - 1) - lastSeenIndex[d];
      const fullPct = fullTotalNums > 0 ? (fullCounts[d] / fullTotalNums) * 100 : 0;
      const recentPct = recentTotalNums > 0 ? (recentCounts[d] / recentTotalNums) * 100 : 0;
      return { digit: d, fullPct, recentPct, drawsSince };
    });

    digitsData.sort((a, b) => b.drawsSince - a.drawsSince);

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colDigito')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colSinAparecer')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    digitsData.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.digit}</td>
          <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center; ${item.drawsSince > 5 ? 'color: #dc2626; font-weight: bold;' : ''}">${item.drawsSince}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  buildParImparStatsHtml(windowSize: number): string {
    const k = this.currentGame.maxNumbers || 6;
    const N = this.currentGame.numberRange || 49;
    const totalEvensInUniverse = Math.floor(N / 2);
    const totalOddsInUniverse = N - totalEvensInUniverse;
    const totalWays = this.nCr(N, k);

    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const fullCounts: Record<string, number> = {};
    const recentCounts: Record<string, number> = {};

    for (let e = k; e >= 0; e--) {
      const cat = `${e}/${k - e}`;
      fullCounts[cat] = 0;
      recentCounts[cat] = 0;
    }

    this.historicalData.forEach(draw => {
      const evens = draw.numbers.filter(n => n % 2 === 0).length;
      const cat = `${evens}/${k - evens}`;
      if (fullCounts[cat] !== undefined) fullCounts[cat]++;
    });

    recentData.forEach(draw => {
      const evens = draw.numbers.filter(n => n % 2 === 0).length;
      const cat = `${evens}/${k - evens}`;
      if (recentCounts[cat] !== undefined) recentCounts[cat]++;
    });

    const categoriesData = [];
    for (let e = k; e >= 0; e--) {
      const cat = `${e}/${k - e}`;
      const ways = this.nCr(totalEvensInUniverse, e) * this.nCr(totalOddsInUniverse, k - e);
      const theoPct = totalWays > 0 ? (ways / totalWays) * 100 : 0;
      const fullPct = totalDraws > 0 ? (fullCounts[cat] / totalDraws) * 100 : 0;
      const recentPct = recentDrawsCount > 0 ? (recentCounts[cat] / recentDrawsCount) * 100 : 0;
      categoriesData.push({ cat, theoPct, fullPct, recentPct });
    }

    const last10 = this.historicalData.slice(-10).map(draw => {
      const evens = draw.numbers.filter(n => n % 2 === 0).length;
      return `${evens}/${k - evens}`;
    });

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colCategoria')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colTeorico')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    categoriesData.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.cat}</td>
          <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center; color: #64748b;">${item.theoPct.toFixed(1)}%</td>
        </tr>
      `;
    });

    html += `
      </tbody></table>
      <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
      <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
        ${last10.join(', ')}
      </div>
    `;

    return html;
  }

  buildSumaStatsHtml(windowSize: number): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const allSums = this.historicalData.map(d => d.numbers.reduce((a, b) => a + b, 0));
    const recentSums = allSums.slice(-recentDrawsCount);

    const minFull = Math.min(...allSums);
    const maxFull = Math.max(...allSums);
    const avgFull = allSums.reduce((a, b) => a + b, 0) / totalDraws;

    const minRecent = Math.min(...recentSums);
    const maxRecent = Math.max(...recentSums);
    const avgRecent = recentSums.reduce((a, b) => a + b, 0) / recentDrawsCount;

    const lastSum = allSums[allSums.length - 1];
    const countLessOrEqual = allSums.filter(s => s <= lastSum).length;
    const percentile = (countLessOrEqual / totalDraws) * 100;

    const last10Sums = allSums.slice(-10);

    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 12px;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: left;">Métrica</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.historicoCompleto', { n: totalDraws })}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">Suma Mínima</td>
            <td style="padding: 6px 8px; text-align: center;">${minFull}</td>
            <td style="padding: 6px 8px; text-align: center;">${minRecent}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">Suma Media</td>
            <td style="padding: 6px 8px; text-align: center;">${avgFull.toFixed(1)}</td>
            <td style="padding: 6px 8px; text-align: center;">${avgRecent.toFixed(1)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">Suma Máxima</td>
            <td style="padding: 6px 8px; text-align: center;">${maxFull}</td>
            <td style="padding: 6px 8px; text-align: center;">${maxRecent}</td>
          </tr>
        </tbody>
      </table>

      <div style="padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.85rem; margin-bottom: 12px;">
        📌 <strong>Último sorteo:</strong> Suma <strong>${lastSum}</strong> (Percentil <strong>${percentile.toFixed(1)}%</strong> del histórico).
      </div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">Sumas de los últimos 10 sorteos:</div>
      <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
        ${last10Sums.join(', ')}
      </div>
    `;

    return html;
  }

  buildDecenasStatsHtml(windowSize: number): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const getDecadePatternKey = (nums: number[]) => {
      const tens: Record<number, number> = {};
      nums.forEach(n => {
        const ten = Math.floor((n - 1) / 10);
        tens[ten] = (tens[ten] || 0) + 1;
      });
      return Object.values(tens).sort((a, b) => b - a).join('/');
    };

    const fullCounts: Record<string, number> = {};
    const recentCounts: Record<string, number> = {};

    this.historicalData.forEach(draw => {
      const key = getDecadePatternKey(draw.numbers);
      fullCounts[key] = (fullCounts[key] || 0) + 1;
    });

    recentData.forEach(draw => {
      const key = getDecadePatternKey(draw.numbers);
      recentCounts[key] = (recentCounts[key] || 0) + 1;
    });

    const topPatterns = Object.keys(fullCounts)
      .sort((a, b) => fullCounts[b] - fullCounts[a])
      .slice(0, 5);

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colPatron')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    topPatterns.forEach(pattern => {
      const fullPct = (fullCounts[pattern] / totalDraws) * 100;
      const recentPct = ((recentCounts[pattern] || 0) / recentDrawsCount) * 100;
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${pattern}</td>
          <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  buildConsecutivosStatsHtml(windowSize: number): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const getConsecutivePatternKey = (nums: number[]) => {
      const sorted = [...nums].sort((a, b) => a - b);
      let pattern = '';
      let count = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          count++;
        } else {
          pattern += count;
          count = 1;
        }
      }
      pattern += count;
      return pattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
    };

    const fullCounts: Record<string, number> = {};
    const recentCounts: Record<string, number> = {};

    this.historicalData.forEach(draw => {
      const key = getConsecutivePatternKey(draw.numbers);
      fullCounts[key] = (fullCounts[key] || 0) + 1;
    });

    recentData.forEach(draw => {
      const key = getConsecutivePatternKey(draw.numbers);
      recentCounts[key] = (recentCounts[key] || 0) + 1;
    });

    const topPatterns = Object.keys(fullCounts)
      .sort((a, b) => fullCounts[b] - fullCounts[a])
      .slice(0, 5);

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colPatron')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    topPatterns.forEach(pattern => {
      const fullPct = (fullCounts[pattern] / totalDraws) * 100;
      const recentPct = ((recentCounts[pattern] || 0) / recentDrawsCount) * 100;
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${pattern}</td>
          <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  buildBajosAltosStatsHtml(windowSize: number): string {
    const k = this.currentGame.maxNumbers || 6;
    const numberRange = this.currentGame.numberRange || 49;
    const midPoint = Math.floor(numberRange / 2);
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;

    const totalLowsInUniverse = midPoint;
    const totalHighsInUniverse = numberRange - midPoint;
    const totalWays = this.nCr(numberRange, k);

    const fullCounts: Record<string, number> = {};
    const recentCounts: Record<string, number> = {};

    for (let l = k; l >= 0; l--) {
      const cat = `${l}/${k - l}`;
      fullCounts[cat] = 0;
      recentCounts[cat] = 0;
    }

    this.historicalData.forEach(draw => {
      const lows = draw.numbers.filter(n => n <= midPoint).length;
      const cat = `${lows}/${k - lows}`;
      if (fullCounts[cat] !== undefined) fullCounts[cat]++;
    });

    recentData.forEach(draw => {
      const lows = draw.numbers.filter(n => n <= midPoint).length;
      const cat = `${lows}/${k - lows}`;
      if (recentCounts[cat] !== undefined) recentCounts[cat]++;
    });

    const categoriesData = [];
    for (let l = k; l >= 0; l--) {
      const cat = `${l}/${k - l}`;
      const ways = this.nCr(totalLowsInUniverse, l) * this.nCr(totalHighsInUniverse, k - l);
      const theoPct = totalWays > 0 ? (ways / totalWays) * 100 : 0;
      const fullPct = totalDraws > 0 ? (fullCounts[cat] / totalDraws) * 100 : 0;
      const recentPct = recentDrawsCount > 0 ? (recentCounts[cat] / recentDrawsCount) * 100 : 0;
      categoriesData.push({ cat, theoPct, fullPct, recentPct });
    }

    const last10 = this.historicalData.slice(-10).map(draw => {
      const lows = draw.numbers.filter(n => n <= midPoint).length;
      return `${lows}/${k - lows}`;
    });

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colCategoria')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colTeorico')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    categoriesData.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.cat}</td>
          <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center; color: #64748b;">${item.theoPct.toFixed(1)}%</td>
        </tr>
      `;
    });

    html += `
      </tbody></table>
      <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
      <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
        ${last10.join(', ')}
      </div>
    `;

    return html;
  }

  buildDecenasExclusionStatsHtml(windowSize: number): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;
    const numberRange = this.currentGame.numberRange || 49;
    const numDecades = Math.ceil(numberRange / 10);

    const decadesData = [];
    for (let d = 0; d < numDecades; d++) {
      const startNum = d * 10 + 1;
      const endNum = Math.min((d + 1) * 10, numberRange);
      const label = `${startNum}-${endNum}`;

      let fullCount = 0;
      let lastSeenIdx = -1;
      this.historicalData.forEach((draw, idx) => {
        if (draw.numbers.some(n => Math.floor((n - 1) / 10) === d)) {
          fullCount++;
          lastSeenIdx = idx;
        }
      });

      let recentCount = 0;
      recentData.forEach(draw => {
        if (draw.numbers.some(n => Math.floor((n - 1) / 10) === d)) {
          recentCount++;
        }
      });

      const fullPct = totalDraws > 0 ? (fullCount / totalDraws) * 100 : 0;
      const recentPct = recentDrawsCount > 0 ? (recentCount / recentDrawsCount) * 100 : 0;
      const drawsSince = lastSeenIdx >= 0 ? (totalDraws - 1 - lastSeenIdx) : totalDraws;

      decadesData.push({ label, fullPct, recentPct, drawsSince });
    }

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colDecena')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colSinAparecer')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    decadesData.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.label}</td>
          <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: 600; color: ${item.drawsSince > 10 ? '#dc2626' : '#1e293b'};">${item.drawsSince}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  buildVariedadTerminacionesStatsHtml(windowSize: number): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;
    const maxNumbers = this.currentGame.maxNumbers || 6;

    const fullCounts: Record<number, number> = {};
    const recentCounts: Record<number, number> = {};

    for (let v = 1; v <= maxNumbers; v++) {
      fullCounts[v] = 0;
      recentCounts[v] = 0;
    }

    this.historicalData.forEach(draw => {
      const uniqueEndings = new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
      if (fullCounts[uniqueEndings] !== undefined) fullCounts[uniqueEndings]++;
    });

    recentData.forEach(draw => {
      const uniqueEndings = new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
      if (recentCounts[uniqueEndings] !== undefined) recentCounts[uniqueEndings]++;
    });

    const last10 = this.historicalData.slice(-10).map(draw => {
      return new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
    });

    let html = `
      <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
        <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
        <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colVariedad')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let v = maxNumbers; v >= 1; v--) {
      const fullPct = totalDraws > 0 ? (fullCounts[v] / totalDraws) * 100 : 0;
      const recentPct = recentDrawsCount > 0 ? (recentCounts[v] / recentDrawsCount) * 100 : 0;
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${v}</td>
          <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
          <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
        </tr>
      `;
    }

    html += `
      </tbody></table>
      <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
      <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
        ${last10.join(', ')}
      </div>
    `;

    return html;
  }

  private buildContinuousMetricStatsHtml(
    allValues: number[],
    windowSize: number,
    decimals: number = 0
  ): string {
    const totalDraws = this.historicalData.length;
    const recentData = this.historicalData.slice(-windowSize);
    const recentDrawsCount = recentData.length;
    const recentValues = allValues.slice(-recentDrawsCount);

    const minFull = Math.min(...allValues);
    const maxFull = Math.max(...allValues);
    const avgFull = allValues.reduce((a, b) => a + b, 0) / totalDraws;

    const minRecent = Math.min(...recentValues);
    const maxRecent = Math.max(...recentValues);
    const avgRecent = recentValues.reduce((a, b) => a + b, 0) / recentDrawsCount;

    const lastVal = allValues[allValues.length - 1];
    const countLessOrEqual = allValues.filter(v => v <= lastVal).length;
    const percentile = (countLessOrEqual / totalDraws) * 100;

    const last10Values = allValues.slice(-10);

    const fmt = (v: number) => decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
    const fmtAvg = (v: number) => decimals > 0 ? v.toFixed(decimals) : v.toFixed(1);

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 12px;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155;">
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: left;">${t('filterStats.colCategoria')}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.historicoCompleto', { n: totalDraws })}</th>
            <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMin')}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmt(minFull)}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmt(minRecent)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMedia')}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmtAvg(avgFull)}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmtAvg(avgRecent)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMax')}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmt(maxFull)}</td>
            <td style="padding: 6px 8px; text-align: center;">${fmt(maxRecent)}</td>
          </tr>
        </tbody>
      </table>

      <div style="padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.85rem; margin-bottom: 12px;">
        📌 <strong>${t('filterStats.percentilUltimo', { p: percentile.toFixed(1) })}</strong> (Valor: <strong>${fmt(lastVal)}</strong>)
      </div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.ultimos10Valores')}</div>
      <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
        ${last10Values.map(v => fmt(v)).join(', ')}
      </div>
    `;
  }

  buildPrimosStatsHtml(windowSize: number): string {
    const allValues = this.historicalData.map(d => d.numbers.filter(n => this.primes.has(n)).length);
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 0);
  }

  buildEntropiaIntervalosStatsHtml(windowSize: number): string {
    const calculateIntervalsEntropy = (nums: number[]) => {
      const sorted = [...nums].sort((a, b) => a - b);
      const intervalCounts: Record<number, number> = {};
      for (let idx = 0; idx < sorted.length - 1; idx++) {
        const diff = sorted[idx + 1] - sorted[idx];
        intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
      }
      const numIntervals = nums.length - 1;
      if (numIntervals <= 0) return 0;
      return -Object.values(intervalCounts).reduce((s, countVal) => {
        const p = countVal / numIntervals;
        return s + p * Math.log2(p);
      }, 0);
    };
    const allValues = this.historicalData.map(d => calculateIntervalsEntropy(d.numbers));
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 3);
  }

  buildEntropiaTerminacionesStatsHtml(windowSize: number): string {
    const calculateEndingsEntropy = (nums: number[]) => {
      const endingCounts: Record<number, number> = {};
      nums.forEach(n => {
        const ending = Math.abs(n) % 10;
        endingCounts[ending] = (endingCounts[ending] || 0) + 1;
      });
      return -Object.values(endingCounts).reduce((s, countVal) => {
        const p = countVal / nums.length;
        return s + p * Math.log2(p);
      }, 0);
    };
    const allValues = this.historicalData.map(d => calculateEndingsEntropy(d.numbers));
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 3);
  }

  buildDistanciaStatsHtml(windowSize: number): string {
    const getDist = (nums: number[]) => {
      const s = [...nums].sort((a, b) => a - b);
      let minD = Infinity;
      for (let i = 0; i < s.length - 1; i++) {
        const diff = s[i + 1] - s[i];
        if (diff < minD) minD = diff;
      }
      return minD === Infinity ? 1 : minD;
    };
    const allValues = this.historicalData.map(d => getDist(d.numbers));
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 0);
  }

  buildSumaDigitosStatsHtml(windowSize: number): string {
    const getDigitSum = (nums: number[]) => nums.reduce((s, n) => s + (n < 10 ? n : Math.floor(n / 10) + (n % 10)), 0);
    const allValues = this.historicalData.map(d => getDigitSum(d.numbers));
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 0);
  }

  buildDesviacionStatsHtml(windowSize: number): string {
    const getStdDev = (nums: number[]) => {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length;
      return Math.sqrt(variance);
    };
    const allValues = this.historicalData.map(d => getStdDev(d.numbers));
    return this.buildContinuousMetricStatsHtml(allValues, windowSize, 2);
  }

  updateFilterBadgesFromAudit() {
    this.updateFilterStateFromUI();
    const { results } = this.runFilterAudit(500);

    const filterSelectors: { [key: string]: string } = {
      excluirDecenas: '#excluirDecenasOptions',
      excluirTerminaciones: '#terminacionesOptions',
      excluirStarDecades: '#excluirDecenasEstrellasOptions',
      terminaciones: '#terminacionesOptions',
      sum: '#sumMin',
      terminacionesDistintas: '#terminacionesDistintasOptions',
      parImpar: '#parImparOptions',
      bajosAltos: '#bajosAltosOptions',
      primos: '#primosMin',
      distancia: '#distanciaMin',
      sumaDigitos: '#sumaDigitosMin',
      consecutivos: '#consecutivosOptions',
      agrupDecenas: '#agrupDecenasOptions',
      desviacion: '#desviacionMin',
      positionRange: '#positionRangeFilterGroup',
      excludeHistoricalMatchFull: '#excludeHistoricalFilterGroup',
      excludeHistoricalMatchNearFull: '#excludeHistoricalFilterGroup',
      entropyTerminaciones: '#entropyTerminacionesMin',
      entropyIntervalos: '#entropyIntervalosMin',
      geometric: '#geometricOptions',
      starSum: '#starSumMin',
      starParImpar: '#starParImparOptions',
      starBajosAltos: '#starBajosAltosOptions',
      starSumaDigitos: '#starSumaDigitosMin',
      starPrimos: '#starPrimosMin',
      starConsecutivos: '#starConsecutivosOptions',
      starDistancia: '#starDistanciaMin',
      starPositionRange: '#starPositionRangeFilterGroup'
    };

    // Remove any existing custom activity badges inside ALL .filter-title elements
    document.querySelectorAll('.filter-title .filter-activity-badge').forEach(el => el.remove());

    Object.keys(results).forEach(key => {
      const item = results[key];
      // Only show badge if the filter was actually evaluated (count > 0)
      // and it restricted combinations (percent < 100), OR if it's the geometric filter
      if (item.count > 0 && (item.percent < 100 || key === 'geometric')) {
        const selector = filterSelectors[key];
        if (!selector) return;

        const targetEl = document.querySelector(selector);
        if (!targetEl) return;

        const filterGroup = targetEl.closest('.filter-group');
        if (!filterGroup) return;

        const titleEl = filterGroup.querySelector('.filter-title');
        if (!titleEl) return;

        // Create elegant styled badge
        const badge = document.createElement('span');
        badge.className = 'filter-activity-badge';
        badge.style.cssText = 'font-size: 0.72rem; margin-left: 8px; display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.02em; animation: pulse 2s infinite ease-in-out; border-width: 1px; border-style: solid;';

        const isCritical = item.percent < 15;
        const isWarning = item.percent < 50;

        if (isCritical) {
          badge.style.color = '#ef4444';
          badge.style.background = '#fee2e2';
          badge.style.borderColor = '#fca5a5';
          badge.innerHTML = `🚨 ${t('filter.activityBadge', { pct: Math.round(100 - item.percent) })}`;
        } else if (isWarning) {
          badge.style.color = '#d97706';
          badge.style.background = '#fef3c7';
          badge.style.borderColor = '#fcd34d';
          badge.innerHTML = `⚠️ ${t('filter.activityBadge', { pct: Math.round(100 - item.percent) })}`;
        } else {
          badge.style.color = '#3b82f6';
          badge.style.background = '#eff6ff';
          badge.style.borderColor = '#93c5fd';
          badge.innerHTML = `📉 ${t('filter.activityBadge', { pct: Math.round(100 - item.percent) })}`;
        }

        titleEl.appendChild(badge);
      }
    });
  }

  normalizeFilters(filters: any, gameId: string): Filters {
      const defaults = this.getDefaultFiltersForGame(gameId);
      if (!filters) return defaults;
      if (!filters.entropyTerminaciones) {
          filters.entropyTerminaciones = defaults.entropyTerminaciones;
      }
      if (!filters.entropyIntervalos) {
          filters.entropyIntervalos = defaults.entropyIntervalos;
      }
      if (filters.gapPercentilEnabled === undefined) {
          filters.gapPercentilEnabled = false;
      }
      if (filters.gapPercentilUmbral === undefined) {
          filters.gapPercentilUmbral = 90;
      }
      if (filters.excludeHistoricalMatchFull === undefined) {
          filters.excludeHistoricalMatchFull = false;
      }
      if (filters.excludeHistoricalMatchNearFull === undefined) {
          filters.excludeHistoricalMatchNearFull = false;
      }
      return filters;
  }

  getDefaultFiltersForGame(gameId: string): Filters {
      return getDefaultFiltersForGame(gameId);
  }

  // ===== PERSISTENCIA DE DATOS =====
  saveState() {
      try {
          // Update current game filters in the map before saving
          this.gameFilters[this.currentGame.id] = this.filters;

          const state = {
              currentGameId: this.currentGame.id,
              savedTickets: this.savedTickets,
              gameFilters: this.gameFilters, // Save all game filters
              gameDataTypes: this.gameDataTypes,
              gameHistoricalData: Object.keys(this.gameHistoricalData).reduce((acc: any, gid: string) => {
                  acc[gid] = this.gameHistoricalData[gid];
                  return acc;
              }, {}),
              historicalData: this.allHistoricalData.length > 0 ? this.allHistoricalData : this.historicalData,
              nacionalDrawFilter: this.nacionalDrawFilter,
              dataType: this.dataType,
              dataLoaded: this.dataLoaded,
              favoriteNumbers: Array.from(this.favoriteNumbers), // Persist favorites
              favoriteGames: Array.from(this.favoriteGames), // Persist game favorites
              excludedDecades: Array.from(this.excludedDecades),
              excludedDecadesSnapshot: Array.from(this.excludedDecadesSnapshot.entries()),
              excludedTerminaciones: Array.from(this.excludedTerminaciones),
              excludedTerminacionesSnapshot: Array.from(this.excludedTerminacionesSnapshot.entries()),
              excludedStarDecades: Array.from(this.excludedStarDecades),
              excludedStarDecadesSnapshot: Array.from(this.excludedStarDecadesSnapshot.entries()),
              customGameUrls: this.customGameUrls, // Persist custom URLs
              filterPresets: this.filterPresets, // Persist filter presets
          };
          saveAppStateToStorage(state);
      } catch (error) {
          console.error("Error guardando el estado:", error);
          this.showToast(t('toast.errorGuardarEstado'), 'error');
      }
  }

  openSaveFilterModal() {
      const input = document.getElementById('filterPresetName') as HTMLInputElement;
      if (input) input.value = '';
      this.toggleModal('saveFilterModal', true);
  }

  confirmSaveFilter() {
      const input = document.getElementById('filterPresetName') as HTMLInputElement;
      const name = input?.value.trim() || t('filters.nombrePorDefecto', { date: new Date().toLocaleDateString() });
      
      const newPreset: FilterPreset = {
          id: Date.now().toString(),
          name: name,
          date: new Date().toLocaleString(),
          filters: JSON.parse(JSON.stringify(this.filters)) // Deep copy
      };

      this.filterPresets.push(newPreset);
      this.saveState();
      this.sendTelemetry('save_filter', { name: name });
      this.toggleModal('saveFilterModal', false);
      this.showToast(t('toast.filtroGuardado', { name }), 'success');
  }

  openLoadFilterModal() {
      this.renderFilterPresetsList();
      this.toggleModal('loadFilterModal', true);
  }

  renderFilterPresetsList() {
      const container = document.getElementById('filterPresetsList');
      if (!container) return;
      container.innerHTML = '';

      if (this.filterPresets.length === 0) {
          container.innerHTML = `<div style="color:#666; text-align: center; padding: 10px;">${t('filters.sinFiltrosGuardados')}</div>`;
          return;
      }

      this.filterPresets.forEach(preset => {
          const item = document.createElement('div');
          item.className = 'preset-item';
          
          const info = document.createElement('div');
          info.className = 'preset-info';
          info.innerHTML = `
              <div class="preset-name">${preset.name}</div>
              <div class="preset-date">${preset.date}</div>
          `;
          info.onclick = () => this.loadFilterPreset(preset.id);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'preset-delete-btn';
          deleteBtn.innerHTML = '✕';
          deleteBtn.onclick = (e) => {
              e.stopPropagation();
              this.deleteFilterPreset(preset.id);
          };

          item.appendChild(info);
          item.appendChild(deleteBtn);
          container.appendChild(item);
      });
  }

  loadFilterPreset(id: string) {
      const preset = this.filterPresets.find(p => p.id === id);
      if (!preset) return;

      this.filters = JSON.parse(JSON.stringify(preset.filters));
      this.updateUIFromFilterState();
      this.toggleModal('loadFilterModal', false);
      this.showToast(t('toast.filtroCargado', { name: preset.name }), 'success');
  }

  deleteFilterPreset(id: string) {
      this.filterPresets = this.filterPresets.filter(p => p.id !== id);
      this.saveState();
      this.renderFilterPresetsList();
      this.showToast(t('toast.filtroEliminado'), 'info');
  }

  saveFilterPreset() {
      // Keep for backward compatibility or remove if not used
      this.openSaveFilterModal();
  }

  loadState() {
      try {
          const savedState = loadAppStateFromStorage();
          if (savedState) {
              if (savedState.currentGameId && GAMES[savedState.currentGameId]) {
                  this.currentGame = GAMES[savedState.currentGameId];
              }
              this.savedTickets = savedState.savedTickets || [];
              // Migrate any old saved tickets gameId from 'lotto649' or missing to 'bonoloto'
              this.savedTickets.forEach((t: any) => {
                  if (!t.gameId || t.gameId === 'lotto649') {
                      t.gameId = 'bonoloto';
                  }
              });
              
              if (savedState.gameFilters) {
                  this.gameFilters = savedState.gameFilters;
                  // Migrate lotto649 saved filters to bonoloto / primitiva
                  if (this.gameFilters['lotto649']) {
                      if (!this.gameFilters['bonoloto']) {
                          this.gameFilters['bonoloto'] = JSON.parse(JSON.stringify(this.gameFilters['lotto649']));
                      }
                      if (!this.gameFilters['primitiva']) {
                          this.gameFilters['primitiva'] = JSON.parse(JSON.stringify(this.gameFilters['lotto649']));
                      }
                      delete this.gameFilters['lotto649'];
                  }
                  this.filters = this.normalizeFilters(this.gameFilters[this.currentGame.id], this.currentGame.id);
              } else if (savedState.filters) {
                  // Migration from old single filter structure
                  this.filters = this.normalizeFilters(savedState.filters, this.currentGame.id);
                  this.gameFilters[this.currentGame.id] = this.filters;
              }

              // Apply normalizeFilters to all gameFilters so switching lists are normalized too
              if (this.gameFilters) {
                  Object.keys(this.gameFilters).forEach(gid => {
                      this.gameFilters[gid] = this.normalizeFilters(this.gameFilters[gid], gid);
                  });
              }

              if (!this.filters.ai) { // Ensure ai config exists for older states
                this.filters.ai = { markovDepth: 5, nashWeight: 1, regressionBonus: 3 };
              }
              this.historicalData = (savedState.historicalData || []).map((d: any) => ({...d, date: new Date(d.date)}));
              this.allHistoricalData = [...this.historicalData];
              this.nacionalDrawFilter = savedState.nacionalDrawFilter || 'all';
              this.dataType = savedState.dataType || 'none';
              this.dataLoaded = savedState.dataLoaded || false;
              this.favoriteNumbers = new Set(savedState.favoriteNumbers || []);
              this.favoriteGames = new Set(savedState.favoriteGames || []);
              this.excludedDecades = new Set(savedState.excludedDecades || []);
              this.excludedDecadesSnapshot = new Map(savedState.excludedDecadesSnapshot || []);
              this.excludedTerminaciones = new Set(savedState.excludedTerminaciones || []);
              this.excludedTerminacionesSnapshot = new Map(savedState.excludedTerminacionesSnapshot || []);
              this.excludedStarDecades = new Set(savedState.excludedStarDecades || []);
              this.excludedStarDecadesSnapshot = new Map(savedState.excludedStarDecadesSnapshot || []);
              if (savedState.gameDataTypes) {
                  this.gameDataTypes = savedState.gameDataTypes;
              }
              if (savedState.gameHistoricalData) {
                  this.gameHistoricalData = {};
                  Object.keys(savedState.gameHistoricalData).forEach(gid => {
                      this.gameHistoricalData[gid] = (savedState.gameHistoricalData[gid] || []).map((d: any) => ({
                          ...d,
                          date: new Date(d.date)
                      }));
                  });
              }
              if (this.dataType && this.historicalData && this.historicalData.length > 0) {
                  if (!this.gameDataTypes[this.currentGame.id]) {
                      this.gameDataTypes[this.currentGame.id] = this.dataType;
                  }
                  if (!this.gameHistoricalData[this.currentGame.id]) {
                      this.gameHistoricalData[this.currentGame.id] = [...this.historicalData];
                  }
              }
              if (savedState.customGameUrls) {
                  this.customGameUrls = { ...this.customGameUrls, ...savedState.customGameUrls };
              }
              this.filterPresets = savedState.filterPresets || [];
              console.log("Estado de la aplicación cargado desde localStorage.");
          }
          
          // Load filter preset if exists (overriding last session filters if necessary, acting as user default)
          const savedFilters = loadFilterPresetFromStorage();
          if (savedFilters) {
              this.filters = this.normalizeFilters({ ...this.filters, ...savedFilters }, this.currentGame.id);
              console.log("Filtros predeterminados cargados.");
          }

      } catch (error) {
          console.error("Error cargando el estado:", error);
          this.showToast(t('toast.errorCargarEstadoAnterior'), 'warning');
      }
  }

  syncExclusionsWithFilters() {
    if (this.filters) {
      if (Array.isArray(this.filters.excluirDecenas)) {
        this.filters.excluirDecenas.forEach((d: number) => this.excludedDecades.add(d));
      }
      if (Array.isArray(this.filters.excluirStarDecades)) {
        this.filters.excluirStarDecades.forEach((d: number) => this.excludedStarDecades.add(d));
      }
      if (Array.isArray(this.filters.excluirTerminaciones)) {
        this.filters.excluirTerminaciones.forEach((t: number) => this.excludedTerminaciones.add(t));
      }
    }

    const game = this.currentGame;
    if (!game) return;
    const startNum = game.id === 'nacional' ? 10 : 1;

    // Sincronizar números excluidos para las decenas activas
    this.excludedDecades.forEach(dec => {
      const start = dec === 0 ? 1 : dec * 10;
      const end = Math.min(dec * 10 + 9, game.numberRange);
      for (let n = Math.max(start, startNum); n <= end; n++) {
        this.excludedNumbers.add(n);
        this.selectedNumbers.delete(n);
        this.favoriteNumbers.delete(n);
      }
    });

    // Sincronizar estrellas excluidas para las decenas activas
    if (game.maxStars > 0) {
      this.excludedStarDecades.forEach(dec => {
        const start = dec === 0 ? 1 : dec * 10;
        const end = Math.min(dec * 10 + 9, game.starRange);
        for (let s = start; s <= end; s++) {
          this.excludedStars.add(s);
          this.selectedStars.delete(s);
          this.favoriteStars.delete(s);
        }
      });
    }

    // Sincronizar terminaciones excluidas
    this.excludedTerminaciones.forEach(digit => {
      for (let n = startNum; n <= game.numberRange; n++) {
        if (n % 10 === digit) {
          this.excludedNumbers.add(n);
          this.selectedNumbers.delete(n);
          this.favoriteNumbers.delete(n);
        }
      }
    });

    // Mantener sincronizados los arrays de this.filters
    if (this.filters) {
      this.filters.excluirDecenas = Array.from(this.excludedDecades);
      this.filters.excluirStarDecades = Array.from(this.excludedStarDecades);
      this.filters.excluirTerminaciones = Array.from(this.excludedTerminaciones);
    }

    this.applyGapFilterMemory();
  }

  // Limitación conocida: si el usuario excluye manualmente un número NUEVO mientras el filtro gap ya está activo, ese número no forma parte del snapshot original y se tratará como "no excluido antes" a efectos de este filtro.
  applyGapFilterMemory() {
    const game = this.currentGame;
    if (!game) return;

    const isNacional = game.id === 'nacional';
    const isEnabled = !!this.filters?.gapPercentilEnabled;
    const canUse = isEnabled && !isNacional && this.dataLoaded && this.historicalData && this.historicalData.length > 0;

    if (canUse) {
      if (this.gapFilterSnapshotAntes === null) {
        this.gapFilterSnapshotAntes = new Set(this.excludedNumbers);
      }
      const umbral = this.filters.gapPercentilUmbral ?? 90;
      const analisis = analizarTodosLosNumeros(this.historicalData, game.numberRange);
      const { excluidos, failsafe } = aplicarFiltroGap(analisis, umbral);
      const nuevosExcluidos = new Set(failsafe ? [] : excluidos);

      // 1. Restaurar los que este filtro excluía antes pero ya no debe excluir
      this.gapFilterExclusionesPropias.forEach(n => {
        if (!nuevosExcluidos.has(n)) {
          const estabaExcluidoAntes = this.gapFilterSnapshotAntes?.has(n) ?? false;
          if (!estabaExcluidoAntes) {
            this.excludedNumbers.delete(n);
            this.selectedNumbers.delete(n);
          }
        }
      });

      // 2. Añadir los nuevos excluidos por este filtro
      nuevosExcluidos.forEach(n => {
        this.excludedNumbers.add(n);
        this.selectedNumbers.delete(n);
        this.favoriteNumbers.delete(n);
      });

      this.gapFilterExclusionesPropias = nuevosExcluidos;
    } else {
      if (this.gapFilterExclusionesPropias.size > 0 || this.gapFilterSnapshotAntes !== null) {
        this.gapFilterExclusionesPropias.forEach(n => {
          const estabaExcluidoAntes = this.gapFilterSnapshotAntes?.has(n) ?? false;
          if (!estabaExcluidoAntes) {
            this.excludedNumbers.delete(n);
          }
        });
        this.gapFilterSnapshotAntes = null;
        this.gapFilterExclusionesPropias = new Set();
      }
    }
  }

  renderGapPercentilChart() {
    const chartContainer = document.getElementById('gapPercentilLiveChart');
    const summaryContainer = document.getElementById('gapPercentilExcludedSummary');
    if (!chartContainer || !summaryContainer) return;

    const gapSwitch = document.getElementById('useGapPercentilSwitch') as HTMLInputElement;
    const gapUmbralInput = document.getElementById('gapPercentilUmbral') as HTMLInputElement;

    const isEnabled = gapSwitch ? gapSwitch.checked : !!this.filters?.gapPercentilEnabled;
    const hasHistory = this.dataLoaded && this.historicalData && this.historicalData.length > 0;
    const isNacional = this.currentGame?.id === 'nacional';
    const canUse = isEnabled && hasHistory && !isNacional;

    if (!canUse) {
      chartContainer.style.display = 'none';
      summaryContainer.style.display = 'none';
      return;
    }

    chartContainer.style.display = 'block';
    summaryContainer.style.display = 'block';

    const umbral = gapUmbralInput ? parseInt(gapUmbralInput.value, 10) : (this.filters?.gapPercentilUmbral ?? 90);
    const numberRange = this.currentGame?.numberRange || 49;
    const analisis = analizarTodosLosNumeros(this.historicalData, numberRange);
    const { excluidos, failsafe } = aplicarFiltroGap(analisis, umbral);

    const legendHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 8px; color: var(--text-muted, #64748b);">
        <div style="display: flex; gap: 12px; align-items: center;">
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; background-color: #3b82f6; border-radius: 2px;"></span>
            ${t('filters.gapPercentil.leyendaDentro')}
          </span>
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; background-color: #ef4444; border-radius: 2px;"></span>
            ${t('filters.gapPercentil.leyendaExcluido')}
          </span>
        </div>
        <span style="font-weight: 600; font-family: monospace; color: var(--text-color, #334155);">≥ ${umbral}%</span>
      </div>
    `;

    const lineTopPercent = Math.max(0, Math.min(100, 100 - umbral));

    const barsHtml = analisis.map(item => {
      const isExcluded = item.percentil >= umbral && !failsafe;
      const heightPercent = Math.max(item.percentil, 3);
      const barColor = isExcluded ? '#ef4444' : '#3b82f6';
      const tooltip = t('filters.gapPercentil.barTooltip', { n: item.numero, p: item.percentil, h: item.huecoActual });

      return `
        <div title="${tooltip}" style="flex: 1; min-width: 2px; max-width: 10px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; cursor: pointer; position: relative; z-index: 3;">
          <div style="width: 100%; height: ${heightPercent}%; background-color: ${barColor}; border-radius: 2px 2px 0 0; transition: height 0.15s ease, background-color 0.15s ease;"></div>
        </div>
      `;
    }).join('');

    chartContainer.innerHTML = `
      ${legendHtml}
      <div style="position: relative; height: 95px; width: 100%; border-bottom: 1px solid var(--border-color, #cbd5e1); border-left: 1px solid var(--border-color, #cbd5e1); padding: 4px 2px 0 2px; background: rgba(0,0,0,0.02); border-radius: 4px; box-sizing: border-box;">
        <div style="position: absolute; top: ${lineTopPercent}%; left: 0; right: 0; border-top: 1.5px dashed #ef4444; pointer-events: none; z-index: 2; opacity: 0.85;"></div>
        <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 100%; width: 100%; gap: 1px;">
          ${barsHtml}
        </div>
      </div>
    `;

    if (failsafe) {
      summaryContainer.innerHTML = `<div style="color: #dc2626; font-weight: 500; background: rgba(239, 68, 68, 0.08); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); margin-top: 6px;">${t('toast.gapFailsafe')}</div>`;
    } else if (excluidos.length > 0) {
      const sortedNums = [...excluidos].sort((a, b) => a - b).join(', ');
      const text = t('filters.gapPercentil.resumenExcluidos').replace('{numeros}', sortedNums).replace('{umbral}', umbral.toString());
      summaryContainer.innerHTML = `<div style="color: var(--text-color, #334155); font-weight: 500; margin-top: 6px;">🚫 ${text}</div>`;
    } else {
      const text = t('filters.gapPercentil.resumenNinguno');
      summaryContainer.innerHTML = `<div style="color: #10b981; font-weight: 500; margin-top: 6px;">✅ ${text}</div>`;
    }
  }

  updateUIFromFilterState() {
    this.syncExclusionsWithFilters();
    document.querySelectorAll('.filter-title .filter-activity-badge').forEach(el => el.remove());
    // Inputs de rango
    const setVal = (id: string, value: number | string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = String(value);
    };
    
    const setRangeVal = (id: string, value: number) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = String(value);
      const displayEl = document.getElementById(`${id}Value`);
      if (displayEl) displayEl.textContent = String(value);
    }

    setVal('sumMin', this.filters.sum.min);
    setVal('sumMax', this.filters.sum.max);
    setVal('primosMin', this.filters.primos.min);
    setVal('primosMax', this.filters.primos.max);
    setVal('distanciaMin', this.filters.distancia.min);
    setVal('distanciaMax', this.filters.distancia.max);
    setVal('sumaDigitosMin', this.filters.sumaDigitos.min);
    setVal('sumaDigitosMax', this.filters.sumaDigitos.max);
    setVal('desviacionMin', this.filters.desviacion.min);
    setVal('desviacionMax', this.filters.desviacion.max);
    setVal('entropyTerminacionesMin', this.filters.entropyTerminaciones.min);
    setVal('entropyTerminacionesMax', this.filters.entropyTerminaciones.max);
    setVal('entropyIntervalosMin', this.filters.entropyIntervalos.min);
    setVal('entropyIntervalosMax', this.filters.entropyIntervalos.max);
    
    // Star ranges
    setVal('starSumMin', this.filters.starSum.min);
    setVal('starSumMax', this.filters.starSum.max);
    setVal('starSumaDigitosMin', this.filters.starSumaDigitos.min);
    setVal('starSumaDigitosMax', this.filters.starSumaDigitos.max);
    setVal('starPrimosMin', this.filters.starPrimos.min);
    setVal('starPrimosMax', this.filters.starPrimos.max);
    setVal('starDistanciaMin', this.filters.starDistancia.min);
    setVal('starDistanciaMax', this.filters.starDistancia.max);

    setRangeVal('markovDepth', this.filters.ai.markovDepth);
    setRangeVal('nashWeight', this.filters.ai.nashWeight);
    setRangeVal('regressionBonus', this.filters.ai.regressionBonus);
    setRangeVal('nashMinScore', this.filters.nashMinScore ?? 0.0);
    setRangeVal('nashMaxScore', this.filters.nashMaxScore ?? 10.0);

    this.renderPositionRangeFilterOptions();
    this.renderExcludeHistoricalFilterOptions();
    if (this.filters.positionRange) {
      const posCb = document.getElementById('positionRangeEnabled') as HTMLInputElement;
      if (posCb) posCb.checked = !!this.filters.positionRange.enabled;
      setVal('positionRangeConfidence', this.filters.positionRange.confidenceLevel);
    }
    if (this.filters.starPositionRange) {
      const starPosCb = document.getElementById('starPositionRangeEnabled') as HTMLInputElement;
      if (starPosCb) starPosCb.checked = !!this.filters.starPositionRange.enabled;
      setVal('starPositionRangeConfidence', this.filters.starPositionRange.confidenceLevel);
    }


    // Chips
    const updateChips = (selector: string, activeValues: (string | number)[]) => {
      document.querySelectorAll(selector).forEach(chip => {
        const chipEl = chip as HTMLElement;
        const value = chipEl.dataset.value!;
        if (activeValues.map(String).includes(value)) {
          chipEl.classList.add('active');
        } else {
          chipEl.classList.remove('active');
        }
      });
    };

    updateChips('#terminacionesOptions .filter-chip', this.filters.terminaciones);
    updateChips('#terminacionesDistintasOptions .filter-chip', this.filters.terminacionesDistintas);
    updateChips('#parImparOptions .filter-chip', this.filters.parImpar);
    updateChips('#bajosAltosOptions .filter-chip', this.filters.bajosAltos);
    updateChips('#consecutivosOptions .filter-chip', this.filters.consecutivos);
    updateChips('#agrupDecenasOptions .filter-chip', this.filters.agrupDecenas);
    
    // Star chips
    updateChips('#starParImparOptions .filter-chip', this.filters.starParImpar);
    updateChips('#starBajosAltosOptions .filter-chip', this.filters.starBajosAltos);
    updateChips('#starConsecutivosOptions .filter-chip', this.filters.starConsecutivos);
    
    // Chips geométricos (caso especial con iconos 🚫/👍)
    document.querySelectorAll('#geometricOptions .filter-chip').forEach(chip => {
        const chipEl = chip as HTMLElement;
        const value = chipEl.dataset.value!;
        chipEl.classList.remove('active');
        if (this.filters.geometric.exclude.includes(value) || this.filters.geometric.favor.includes(value)) {
            chipEl.classList.add('active');
        }
    });

    document.querySelectorAll('#excluirDecenasOptions .filter-chip').forEach(chip => {
      const chipEl = chip as HTMLElement;
      const dec = parseInt(chipEl.dataset.decade || '-1', 10);
      chipEl.classList.toggle('active', this.excludedDecades.has(dec));
    });

    document.querySelectorAll('#excluirDecenasEstrellasOptions .filter-chip').forEach(chip => {
      const chipEl = chip as HTMLElement;
      const dec = parseInt(chipEl.dataset.decade || '-1', 10);
      chipEl.classList.toggle('active', this.excludedStarDecades.has(dec));
    });

    document.querySelectorAll('#terminacionesOptions .filter-chip').forEach(chip => {
      const chipEl = chip as HTMLElement;
      const val = parseInt(chipEl.dataset.value || '-1', 10);
      chipEl.classList.toggle('active', this.excludedTerminaciones.has(val));
    });
    this.updateTerminacionesBadge();
    this.updateDecadasBadge();
    this.updateStarDecadasBadge();

    // Switches
    const setChecked = (id: string, isChecked: boolean) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.checked = isChecked;
    };
    
    setChecked('useMarkovSwitch', this.filters.useMarkov);
    setChecked('useNashSwitch', this.filters.useNash);
    setChecked('excludeHistoricalMatchFull', !!this.filters.excludeHistoricalMatchFull);
    setChecked('excludeHistoricalMatchNearFull', !!this.filters.excludeHistoricalMatchNearFull);
    setChecked('useRegressionSwitch', this.filters.useRegression);
    setChecked('useGapPercentilSwitch', !!this.filters.gapPercentilEnabled);
    setRangeVal('gapPercentilUmbral', this.filters.gapPercentilUmbral ?? 90);
    setChecked('nashStrictModeSwitch', !!this.filters.nashStrictMode);

    const gapSwitch = document.getElementById('useGapPercentilSwitch') as HTMLInputElement;
    const gapUmbral = document.getElementById('gapPercentilUmbral') as HTMLInputElement;
    const hasHistory = this.dataLoaded && this.historicalData && this.historicalData.length > 0;
    const isNacional = this.currentGame.id === 'nacional';
    const canUseGap = hasHistory && !isNacional;

    if (gapSwitch) {
      gapSwitch.disabled = !canUseGap;
      if (!canUseGap) {
        gapSwitch.checked = false;
        this.filters.gapPercentilEnabled = false;
      }
    }
    if (gapUmbral) {
      gapUmbral.disabled = !canUseGap;
    }
    this.applyGapFilterMemory();
    this.renderGapPercentilChart();

    const strictSliders = document.getElementById('nashStrictSliders');
    if (strictSliders) {
      strictSliders.style.display = this.filters.nashStrictMode ? 'block' : 'none';
    }
    if (this.filters.nashStrictMode) {
      this.renderNashScoreHistogram();
    }

    if (this.currentGame.id === 'nacional') {
      // Inputs and select elements
      setVal('nacionalSumaDigitosMin', this.filters.nacionalSumaDigitos?.min ?? 15);
      setVal('nacionalSumaDigitosMax', this.filters.nacionalSumaDigitos?.max ?? 30);
      
      const setSelectVal = (id: string, val: string | undefined) => {
        const el = document.getElementById(id) as HTMLSelectElement;
        if (el && val !== undefined) el.value = val;
      };
      setSelectVal('nacionalCapicua', this.filters.nacionalCapicua);
      setSelectVal('nacionalPrimo', this.filters.nacionalPrimo);
      setSelectVal('nacionalCuadradoCubo', this.filters.nacionalCuadradoCubo);
      setSelectVal('nacionalRepdigits', this.filters.nacionalRepdigits);
      setVal('nacionalMultiploDe', this.filters.nacionalMultiploDe ?? 1);
      setVal('nacionalFranjaMin', this.filters.nacionalFranja?.min ?? 0);
      setVal('nacionalFranjaMax', this.filters.nacionalFranja?.max ?? 99999);
      
      setVal('nacionalObjetivo', this.filters.nacionalObjetivo ?? '00000');
      setVal('nacionalDistanciaObjetivoMin', this.filters.nacionalDistanciaObjetivo?.min ?? 0);
      setVal('nacionalDistanciaObjetivoMax', this.filters.nacionalDistanciaObjetivo?.max ?? 99999);
      
      // Position selects (D1-D5)
      for (let i = 1; i <= 5; i++) {
        setSelectVal(`nacionalParidadD${i}`, this.filters.nacionalParidad?.[i - 1]);
        setSelectVal(`nacionalAltoBajoD${i}`, this.filters.nacionalAltoBajo?.[i - 1]);
      }
      
      setSelectVal('nacionalConsecutivos', this.filters.nacionalConsecutivos);
      setSelectVal('nacionalSumaMitades', this.filters.nacionalSumaMitades);
      
      // Chips (Multi-select)
      updateChips('#nacionalParesConteoOptions .filter-chip', this.filters.nacionalParesConteo ?? []);
      updateChips('#nacionalAltosConteoOptions .filter-chip', this.filters.nacionalAltosConteo ?? []);
      updateChips('#nacionalUnicosOptions .filter-chip', this.filters.nacionalUnicos ?? []);
      
      setVal('nacionalModaRepeticionesMin', this.filters.nacionalModaRepeticiones?.min ?? 1);
      setVal('nacionalModaRepeticionesMax', this.filters.nacionalModaRepeticiones?.max ?? 5);
      
      updateChips('#nacionalCerosOptions .filter-chip', this.filters.nacionalCeros ?? []);
      
      setVal('nacionalPrimosDigitosMin', this.filters.nacionalPrimosDigitos?.min ?? 0);
      setVal('nacionalPrimosDigitosMax', this.filters.nacionalPrimosDigitos?.max ?? 5);
      
      setVal('nacionalRangoInternoMin', this.filters.nacionalRangoInterno?.min ?? 0);
      setVal('nacionalRangoInternoMax', this.filters.nacionalRangoInterno?.max ?? 9);
      
      setVal('nacionalDesviacionMin', this.filters.nacionalDesviacion?.min ?? 0.00);
      setVal('nacionalDesviacionMax', this.filters.nacionalDesviacion?.max ?? 4.50);
      
      setVal('nacionalEntropiaDigitosMin', this.filters.nacionalEntropiaDigitos?.min ?? 0.000);
      setVal('nacionalEntropiaDigitosMax', this.filters.nacionalEntropiaDigitos?.max ?? 2.322);
    }

  }

  // ===== DATOS HISTÓRICOS (Sin cambios) =====
  async initializeHistoricalData() {
    const gameId = this.currentGame.id;
    if (this.gameDataTypes[gameId] === 'simulated' && this.gameHistoricalData[gameId] && this.gameHistoricalData[gameId].length > 0) {
      this.historicalData = [...this.gameHistoricalData[gameId]];
      this.allHistoricalData = [...this.historicalData];
      this.dataType = 'simulated';
      this.dataLoaded = true;
      if (gameId === 'nacional') {
          this.applyNacionalFilter();
      }
      this.updateDataAnalysis();
      this.analyzeNumbers();
      this.updateGridNumberStates();
      this.updateBigDataPanel();
    } else {
      await this.loadSpecificGame(gameId as any, true);
    }
  }
  simulateHistoricalData(numDraws = 500, append = false) {
    this.showFilterSpinner();
    
    if (!append) {
      this.historicalData = [];
    }

    const currentCount = this.historicalData.length;
    if (currentCount >= 10000) {
      this.showToast(t('toast.limiteSorteos'), 'warning');
      this.hideFilterSpinner();
      return;
    }

    const actualDrawsToSimulate = Math.min(numDraws, 10000 - currentCount);
    const baseDate = new Date();
    
    if (append && currentCount > 0) {
      const lastDate = new Date(this.historicalData[currentCount - 1].date);
      baseDate.setTime(lastDate.getTime());
    } else {
      baseDate.setDate(baseDate.getDate() - actualDrawsToSimulate * 3.5);
    }

    for(let i = 0; i < actualDrawsToSimulate; i++) {
      const drawDate = new Date(baseDate);
      drawDate.setDate(drawDate.getDate() + (i * 3.5));
      const { numbers, stars, complementario, reintegro } = this.generateRealisticDraw();
      this.historicalData.push({
        id: currentCount + i + 1,
        date: drawDate,
        numbers: this.currentGame.id === 'nacional' ? numbers : numbers.sort((a, b) => a - b),
        stars: stars ? stars.sort((a, b) => a - b) : undefined,
        complementario: complementario,
        reintegro: reintegro,
        sum: numbers.reduce((a, b) => a + b, 0)
      });
    }
    
    this.dataType = 'simulated';
    this.dataLoaded = true;
    this.gameDataTypes[this.currentGame.id] = 'simulated';
    this.gameHistoricalData[this.currentGame.id] = [...this.historicalData];
    this.updateDataAnalysis();
    this.analyzeNumbers();
    this.updateGridNumberStates();
    this.updateBigDataPanel(); // NEW
    this.saveState();
    
    if (append) {
      this.showToast(t('toast.sorteosSumados', { count: actualDrawsToSimulate, total: this.historicalData.length }), 'success');
    } else {
      this.showToast(t('toast.datosSimuladosGenerados', { count: actualDrawsToSimulate }), 'success');
    }
    this.hideFilterSpinner();
  }
  generateRealisticDraw(): { numbers: number[], stars?: number[], complementario?: number, reintegro?: number } {
    if (this.currentGame.id === 'nacional') {
      const numbers: number[] = [];
      for (let col = 0; col < 5; col++) {
        const val = Math.floor(Math.random() * 10);
        numbers.push((col + 1) * 10 + val);
      }
      return { numbers };
    }

    const numbers = new Set<number>();
    while(numbers.size < this.currentGame.maxNumbers) {
        const num = Math.floor(Math.random() * this.currentGame.numberRange) + 1;
        if(!numbers.has(num)) {
            numbers.add(num);
        }
    }

    let stars: number[] | undefined = undefined;
    if (this.currentGame.maxStars > 0) {
        const starSet = new Set<number>();
        const isGordo = this.currentGame.id === 'gordo';
        while(starSet.size < this.currentGame.maxStars) {
            const range = this.currentGame.starRange;
            const star = isGordo ? Math.floor(Math.random() * range) : Math.floor(Math.random() * range) + 1;
            if(!starSet.has(star)) {
                starSet.add(star);
            }
        }
        stars = Array.from(starSet);
    }

    let complementario: number | undefined = undefined;
    let reintegro: number | undefined = undefined;
    if (this.currentGame.id !== 'euromillones' && this.currentGame.id !== 'eurodreams' && this.currentGame.id !== 'gordo') {
        // Complementario: un número del 1 al 49 que no esté en los principales
        let comp;
        do {
            comp = Math.floor(Math.random() * 49) + 1;
        } while (numbers.has(comp));
        complementario = comp;
        // Reintegro: un número del 0 al 9
        reintegro = Math.floor(Math.random() * 10);
    }

    return { numbers: Array.from(numbers), stars, complementario, reintegro };
  }
  async loadRealData(files: FileList) {
    this.showFilterSpinner();
    try {
      this.historicalData = [];
      let totalDraws = 0;
      
      for (const file of Array.from(files)) {
        const data = await this.loadDataFile(file);
        this.historicalData.push(...data);
        totalDraws += data.length;
      }
      
      this.historicalData.sort((a, b) => a.date.getTime() - b.date.getTime());
      this.historicalData.forEach((draw, index) => {
        draw.id = index + 1;
      });
      
      this.dataType = 'real';
      this.dataLoaded = true;
      this.gameDataTypes[this.currentGame.id] = 'real';
      this.gameHistoricalData[this.currentGame.id] = [...this.historicalData];
      this.updateDataAnalysis();
      this.analyzeNumbers();
      this.updateGridNumberStates();
      this.updateBigDataPanel(); // NEW
      this.saveState();
      
      this.showToast(t('toast.datosRealesCargados', { count: totalDraws }), 'success');
      this.autoValidateSavedTickets();
      
    } catch (error: any) {
      this.showToast(t('toast.errorCargandoDatos', { message: error.message }), 'error');
    } finally {
        this.hideFilterSpinner();
    }
  }
  async loadDataFromUrl() {
    this.renderGameSelectionList();
    this.toggleModal('gameSelectionModal', true);
  }

  renderGameSelectionList() {
    const listContainer = document.getElementById('gameSelectionList');
    if (!listContainer) return;

    const currentGame = this.currentGame || getGameConfig('bonoloto');
    const currentGameId = currentGame.id;

    const modalHeaderTitle = document.querySelector('#gameSelectionModal .modal-header h3');
    const modalHeaderDesc = document.querySelector('#gameSelectionModal .modal-header p');
    if (modalHeaderTitle) modalHeaderTitle.textContent = t('gameselect.baseDatosReal');
    if (modalHeaderDesc) modalHeaderDesc.textContent = t('gameselect.cargarResultados', { game: currentGame.fullName });

    const GAMES_LIST = getAllGames()
      .filter(g => g.id === currentGameId)
      .map(g => ({ id: g.id, name: g.fullName, flag: g.flag }));

    // Sort: Favorites first, then keep requested order
    const sortedGames = [...GAMES_LIST].sort((a, b) => {
        const aFav = this.favoriteGames.has(a.id);
        const bFav = this.favoriteGames.has(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return GAMES_LIST.findIndex(x => x.id === a.id) - GAMES_LIST.findIndex(x => x.id === b.id);
    });

    listContainer.innerHTML = '';
    sortedGames.forEach(game => {
        const isFav = this.favoriteGames.has(game.id);
        const item = document.createElement('div');
        item.className = 'game-select-item';
        item.style.cssText = 'display: flex; align-items: center; gap: 10px; width: 100%;';
        
        const btn = document.createElement('button');
        btn.className = 'game-select-btn';
        btn.style.cssText = 'flex: 1; padding: 15px; border: 1px solid #673ab7; border-radius: 8px; background: #f3e5f5; cursor: pointer; text-align: left; font-size: 1rem; display: flex; align-items: center; gap: 10px; transition: all 0.2s; font-weight: 600; color: #4a148c;';
        btn.innerHTML = `<span>${game.flag}</span> <strong>${game.name}</strong>`;
        btn.onclick = () => this.loadSpecificGame(game.id as any);

        const favBtn = document.createElement('button');
        favBtn.className = `game-fav-btn ${isFav ? 'active' : ''}`;
        favBtn.innerHTML = isFav ? '⭐' : '☆';
        favBtn.style.cssText = 'background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 5px;';
        favBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.favoriteGames.has(game.id)) {
                this.favoriteGames.delete(game.id);
            } else {
                this.favoriteGames.add(game.id);
            }
            this.saveState();
            this.renderGameSelectionList();
            this.updateSidebarGameOrder();
        };

        item.appendChild(btn);
        item.appendChild(favBtn);
        listContainer.appendChild(item);
    });
  }

  renderPlayOnlineList() {
    const listContainer = document.getElementById('playOnlineList');
    if (!listContainer) return;

    const GAMES_LIST = getAllGames().map(g => ({ id: g.id, name: g.fullName, flag: g.flag }));

    const sortedGames = [...GAMES_LIST].sort((a, b) => {
        const aFav = this.favoriteGames.has(a.id);
        const bFav = this.favoriteGames.has(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return GAMES_LIST.findIndex(x => x.id === a.id) - GAMES_LIST.findIndex(x => x.id === b.id);
    });

    listContainer.innerHTML = '';
    sortedGames.forEach(game => {
        const isFav = this.favoriteGames.has(game.id);
        const item = document.createElement('div');
        item.className = 'game-select-item';
        item.style.cssText = 'display: flex; align-items: center; gap: 10px; width: 100%;';
        
        const btn = document.createElement('button');
        btn.className = 'modal-btn confirm';
        btn.style.cssText = 'flex: 1; padding: 15px; text-align: left; display: flex; align-items: center; gap: 10px;';
        btn.innerHTML = `<span>${game.flag}</span> ${game.name}`;
        btn.onclick = () => this.confirmPlayOnline(game.id as any);

        const favBtn = document.createElement('button');
        favBtn.className = `game-fav-btn ${isFav ? 'active' : ''}`;
        favBtn.innerHTML = isFav ? '⭐' : '☆';
        favBtn.style.cssText = 'background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 5px;';
        favBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.favoriteGames.has(game.id)) {
                this.favoriteGames.delete(game.id);
            } else {
                this.favoriteGames.add(game.id);
            }
            this.saveState();
            this.renderPlayOnlineList();
            this.updateSidebarGameOrder();
        };

        item.appendChild(btn);
        item.appendChild(favBtn);
        listContainer.appendChild(item);
    });
  }

  updateSidebarGameOrder() {
    const sidebarUL = document.querySelector('#sidebar .sidebar-links');
    if (!sidebarUL) return;

    const gameIds = ['powerball', 'megamillions', 'bonoloto', 'primitiva', 'gordo', 'euromillones', 'eurodreams', 'nacional'];
    const gameElements: { [key: string]: HTMLElement } = {};
    
    gameIds.forEach(id => {
      const el = document.getElementById(`game-${id}`);
      if (el) {
        gameElements[id] = el;
        el.remove();
      }
    });

    // Sort according to favorites, then original order
    const sortedGameIds = [...gameIds].sort((a, b) => {
      const aFav = this.favoriteGames.has(a);
      const bFav = this.favoriteGames.has(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return gameIds.indexOf(a) - gameIds.indexOf(b);
    });

    // Find the divider or insert at beginning of UL
    const divider = sidebarUL.querySelector('.divider');
    sortedGameIds.forEach(id => {
      const el = gameElements[id];
      if (el) {
        if (divider) {
          sidebarUL.insertBefore(el, divider);
        } else {
          sidebarUL.appendChild(el);
        }
      }
    });
  }

  generateSyntheticCSV(gameKey: string): string {
    const game = getGameConfig(gameKey);
    const maxNumbers = game.maxNumbers;
    const maxStars = game.maxStars || 0;
    const numberRange = game.numberRange;
    const starRange = game.starRange || 0;
    
    let header = 'Fecha,N1,N2,N3,N4,N5';
    if (maxNumbers === 6) header += ',N6';
    if (maxStars === 1) header += ',Estrella 1';
    if (maxStars === 2) header += ',Estrella 1,Estrella 2';
    
    let csv = header + '\n';
    
    // Generar 100 sorteos históricos realistas (espaciados semanalmente)
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dateStr = `${day}/${month}/${year}`;
      
      // Combinación de números aleatoria sin repetición
      const nums: number[] = [];
      if (gameKey === 'nacional') {
        for (let col = 0; col < 5; col++) {
          const val = Math.floor(Math.random() * 10);
          nums.push((col + 1) * 10 + val);
        }
      } else {
        const numPool = Array.from({ length: numberRange }, (_, idx) => idx + 1);
        for (let n = 0; n < maxNumbers; n++) {
          const idx = Math.floor(Math.random() * numPool.length);
          nums.push(numPool.splice(idx, 1)[0]);
        }
        nums.sort((a, b) => a - b);
      }
      
      // Combinación de estrellas aleatoria sin repetición
      const stars: number[] = [];
      if (gameKey !== 'nacional') {
        const minStar = gameKey === 'gordo' ? 0 : 1;
        const starPool = Array.from({ length: starRange }, (_, idx) => minStar + idx);
        for (let s = 0; s < maxStars; s++) {
          const idx = Math.floor(Math.random() * starPool.length);
          stars.push(starPool.splice(idx, 1)[0]);
        }
        stars.sort((a, b) => a - b);
      }
      
      let row = dateStr + ',' + nums.join(',');
      if (stars.length > 0) {
        row += ',' + stars.join(',');
      }
      csv += row + '\n';
    }
    return csv;
  }

  convertGoogleSheetsUrlToCsv(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim();
    if (url.includes('docs.google.com/spreadsheets')) {
      if (url.includes('/pub?output=csv') || url.includes('/export?format=csv')) {
        return url;
      }
      const matchDoc = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const matchGid = url.match(/[?&#]gid=(\d+)/);
      if (matchDoc && matchDoc[1]) {
        const docId = matchDoc[1];
        const gid = matchGid ? matchGid[1] : '0';
        return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`;
      }
    }
    return url;
  }

  async loadSpecificGame(gameKey: string, isAutoLoad = false) {
    const gameConfig = getGameConfig(gameKey);
    const rawUrl = this.customGameUrls[gameKey] || gameConfig.csvUrl || '';
    const url = this.convertGoogleSheetsUrlToCsv(rawUrl);
    if (!isAutoLoad) {
      this.toggleModal('gameSelectionModal', false);
    }

    const gameName = gameConfig.name || gameKey;

    // STEP 1: INSTANT LOCAL INITIALIZATION (Non-blocking)
    const cachedUrl = localStorage.getItem(`datalotto_csv_url_${gameKey}`);
    if (cachedUrl !== url) {
      localStorage.removeItem(`datalotto_csv_cache_${gameKey}`);
      delete this.gameHistoricalData[gameKey];
    }

    let cachedContent = localStorage.getItem(`datalotto_csv_cache_${gameKey}`);
    let loadedFromCache = false;

    if (this.gameHistoricalData[gameKey] && this.gameHistoricalData[gameKey].length > 0) {
      this.allHistoricalData = [...this.gameHistoricalData[gameKey]];
      this.historicalData = [...this.gameHistoricalData[gameKey]];
      this.dataType = gameKey;
      this.dataLoaded = true;
      loadedFromCache = true;
    } else if (cachedContent) {
      try {
        const parsedData = this.parseCSVData(cachedContent);
        if (parsedData && parsedData.length > 0) {
          this.allHistoricalData = parsedData;
          this.historicalData = parsedData;
          this.gameHistoricalData[gameKey] = parsedData;
          this.dataType = gameKey;
          this.dataLoaded = true;
          loadedFromCache = true;
        }
      } catch (err) {
        console.warn(`Error al leer caché local para ${gameKey}:`, err);
      }
    }

    if (!loadedFromCache) {
      const syntheticCSV = this.generateSyntheticCSV(gameKey);
      const parsedData = this.parseCSVData(syntheticCSV);
      this.allHistoricalData = parsedData;
      this.historicalData = parsedData;
      this.gameHistoricalData[gameKey] = parsedData;
      this.dataType = gameKey;
      this.dataLoaded = true;
    }

    if (gameKey === 'nacional') {
      this.applyNacionalFilter();
    }

    // Immediately render board & analysis with instant local data
    this.updateDataAnalysis();
    this.analyzeNumbers();
    this.updateGridNumberStates();
    this.updateBigDataPanel();

    // STEP 2: ASYNCHRONOUS BACKGROUND NETWORK REFRESH
    const bgBadge = document.getElementById('bgSyncBadge');
    if (bgBadge) {
      bgBadge.style.display = 'inline-flex';
      bgBadge.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite;">🔄</span> Sincronizando datos...`;
    }

    if (!url) return;

    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const freshContent = await response.text();

        if (freshContent.trim().toLowerCase().startsWith('<!doctype') || freshContent.trim().toLowerCase().startsWith('<html')) {
          throw new Error('La Hoja de Google requiere publicación pública. Pulsa en Archivo > Compartir > Publicar en la web > CSV.');
        }

        localStorage.setItem(`datalotto_csv_cache_${gameKey}`, freshContent);
        localStorage.setItem(`datalotto_csv_url_${gameKey}`, url);
        
        const freshData = this.parseCSVData(freshContent);
        this.gameHistoricalData[gameKey] = freshData;
        this.gameDataTypes[gameKey] = gameKey;

        if (this.currentGame.id === gameKey) {
          this.allHistoricalData = freshData;
          this.historicalData = freshData;
          if (gameKey === 'nacional') {
            this.applyNacionalFilter();
          }
          this.dataType = gameKey;
          this.dataLoaded = true;

          // Non-blocking tick update
          setTimeout(() => {
            this.updateDataAnalysis();
            this.analyzeNumbers();
            this.updateGridNumberStates();
            this.updateBigDataPanel();
            this.autoValidateSavedTickets();
            this.saveState();
          }, 0);
        }

        if (bgBadge) {
          bgBadge.innerHTML = t('main.bgBadgeSorteos', { count: freshData.length });
          setTimeout(() => {
            if (bgBadge) bgBadge.style.display = 'none';
          }, 2500);
        }

        if (!isAutoLoad) {
          this.showToast(t('toast.baseDatosActualizada', { game: gameName.toUpperCase(), count: freshData.length }), 'success');
        }
      })
      .catch((error) => {
        console.warn(`Sincronización en segundo plano con advertencia para ${gameKey}:`, error);
        if (bgBadge) {
          bgBadge.innerHTML = `⚠️ Modo Local (${this.historicalData.length} sorteos)`;
          setTimeout(() => {
            if (bgBadge) bgBadge.style.display = 'none';
          }, 2500);
        }
      });
  }

  applyNacionalFilter() {
    if (this.currentGame.id !== 'nacional') {
      return;
    }
    if (!this.allHistoricalData || this.allHistoricalData.length === 0) {
      this.allHistoricalData = [...this.historicalData];
    }
    
    if (this.nacionalDrawFilter === 'all') {
      this.historicalData = [...this.allHistoricalData];
    } else {
      this.historicalData = this.allHistoricalData.filter(draw => {
        const month = draw.date.getMonth(); // 0-indexed: 11 is December, 0 is January
        const day = draw.date.getDate();
        if (this.nacionalDrawFilter === 'navidad') {
          return draw.drawType === 'navidad' || (month === 11 && day === 22);
        } else if (this.nacionalDrawFilter === 'nino') {
          return draw.drawType === 'nino' || (month === 0 && day === 6);
        }
        return true;
      });
    }
  }

  async loadDataFile(file: File): Promise<Draw[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target!.result as string;
          resolve(this.parseCSVData(content));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsText(file);
    });
  }
  parseFlexibleDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.trim().replace(/^["']|["']$/g, '');
    
    // Split by /, - or .
    const parts = clean.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);

      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
        if (p0 > 1000) {
          // Format YYYY-MM-DD
          return new Date(p0, p1 - 1, p2);
        } else if (p2 > 1000) {
          // Format DD/MM/YYYY (Spanish standard date)
          return new Date(p2, p1 - 1, p0);
        } else if (p2 >= 0 && p2 <= 99) {
          // Format DD/MM/YY
          const fullYear = p2 < 50 ? 2000 + p2 : 1900 + p2;
          return new Date(fullYear, p1 - 1, p0);
        }
      }
    }

    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }

  parseCSVData(content: string): Draw[] {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedContent.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) {
        return [];
    }

    const firstLine = lines.shift()!;
    const header = firstLine.toLowerCase().split(/[,;\t]+/).map(h => h.trim().replace(/^["']|["']$/g, '').trim());

    const isHeader = header.some(h => isNaN(parseInt(h)) && isNaN(this.parseFlexibleDate(h)?.getTime() || NaN));
    
    if (!isHeader) {
        lines.unshift(firstLine); 
    }
    
    if (this.currentGame.id === 'nacional') {
        const parsedDraws: Draw[] = [];
        const originalLines = [...lines];

        // Auto-detect if CSV has prize categories
        let hasPrizeCategories = false;
        for (let i = 0; i < Math.min(1000, originalLines.length); i++) {
            const lineClean = originalLines[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            if (lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio')) {
                hasPrizeCategories = true;
                break;
            }
        }

        // 1. Let's parse all lines into columns
        const rowsParts = originalLines.map(line => line.split(/[,;\t]/));
        
        // Find the maximum number of columns across rows
        let maxCols = 0;
        rowsParts.forEach(parts => {
            if (parts.length > maxCols) maxCols = parts.length;
        });

        // 2. Score each column index to find the winning number column
        let bestColIdx = -1;
        let highestScore = -1;

        if (maxCols > 0) {
            const colScores = Array(maxCols).fill(0);
            
            // Header bonus
            if (isHeader && header) {
                header.forEach((h, col) => {
                    const hClean = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    if (hClean.includes('primer') && hClean.includes('premio')) {
                        colScores[col] += 1000;
                    } else if (hClean.includes('1') && hClean.includes('premio')) {
                        colScores[col] += 1000;
                    } else if (hClean.includes('numero') || hClean.includes('decimo')) {
                        colScores[col] += 500;
                    } else if (hClean.includes('combinac') || hClean.includes('resultado')) {
                        colScores[col] += 400;
                    } else if (hClean.includes('sorteo') || hClean.includes('fecha') || hClean.includes('date') || hClean.includes('segundo') || hClean.includes('2')) {
                        colScores[col] -= 500; // negative bonus for columns that are clearly not the 1st prize
                    }
                });
            }

            // Analyze data rows (sample up to 200 rows matching 1st prize if categories are present)
            const sampleRows = rowsParts.filter(parts => {
                if (!hasPrizeCategories) return true;
                const lineClean = parts.join(' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                return lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio');
            }).slice(0, 200);

            for (let col = 0; col < maxCols; col++) {
                let validCount = 0;
                let sumOfVals = 0;
                const uniqueVals = new Set<number>();
                let hasLeadingZeroStr = false;

                sampleRows.forEach(parts => {
                    if (col >= parts.length) return;
                    const cell = parts[col].trim();
                    if (!cell) return;

                    // Remove dot separators if formatted like 35.072 or with spaces/quotes
                    const cleanCell = cell.replace(/[\.\s,'"]+/g, '');
                    if (/^\d+$/.test(cleanCell)) {
                        const num = parseInt(cleanCell, 10);
                        if (num >= 0 && num <= 99999) {
                            validCount++;
                            sumOfVals += num;
                            uniqueVals.add(num);
                            if (cell.length === 5 && cell.startsWith('0')) {
                                hasLeadingZeroStr = true;
                            }
                        }
                    }
                });

                if (validCount > 0) {
                    const avg = sumOfVals / validCount;
                    const uniquenessRatio = uniqueVals.size / validCount;

                    let colScore = colScores[col];
                    if (avg >= 500 && avg <= 99500) {
                        colScore += 100;
                    }
                    if (uniquenessRatio > 0.4) {
                        colScore += 150;
                    }
                    if (hasLeadingZeroStr) {
                        colScore += 300;
                    }
                    colScores[col] = colScore;
                } else {
                    colScores[col] = -9999;
                }
            }

            for (let col = 0; col < maxCols; col++) {
                if (colScores[col] > highestScore) {
                    highestScore = colScores[col];
                    bestColIdx = col;
                }
            }
        }

        const seenDates = new Set<string>();

        originalLines.forEach((line, i) => {
            const parts = line.split(/[,;\t]/);
            if (hasPrizeCategories) {
                const lineClean = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const matchesFirstPremio = lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio');
                if (!matchesFirstPremio) {
                    return;
                }
            }

            let date: Date | null = null;
            let digits: number[] | null = null;

            for (let j = 0; j < parts.length; j++) {
                const p = parts[j].trim();
                if (p.includes('-') || p.includes('/')) {
                    const d = this.parseFlexibleDate(p);
                    if (d && !isNaN(d.getTime())) {
                        date = d;
                        break;
                    }
                }
            }

            if (bestColIdx > -1 && bestColIdx < parts.length) {
                const val = parts[bestColIdx].trim();
                const cleanVal = val.replace(/[\.\s,'"]+/g, '');
                const num = parseInt(cleanVal, 10);
                if (num >= 0 && num <= 99999) {
                    const paddedStr = String(num).padStart(5, '0');
                    digits = paddedStr.split('').map(Number);
                }
            }

            if (!digits) {
                for (let j = 0; j < parts.length; j++) {
                    const val = parts[j].trim();
                    const cleanVal = val.replace(/[\.\s,'"]+/g, '');
                    if (/^\d+$/.test(cleanVal)) {
                        const num = parseInt(cleanVal, 10);
                        if (num >= 0 && num <= 99999 && j !== bestColIdx) {
                            if (num > 250 && num !== new Date().getFullYear()) {
                                const paddedStr = String(num).padStart(5, '0');
                                digits = paddedStr.split('').map(Number);
                                break;
                            }
                        }
                    }
                }
            }

            if (digits && digits.length === 5) {
                let dType: 'navidad' | 'nino' | 'normal' = 'normal';
                
                for (let j = 0; j < parts.length; j++) {
                    const p = parts[j].trim().toLowerCase();
                    if (p.includes('navidad') || p.includes('navide')) {
                        dType = 'navidad';
                        break;
                    } else if (p.includes('niño') || p.includes('nino')) {
                        dType = 'nino';
                        break;
                    }
                }
                
                const finalDate = date || new Date(Date.now() - (originalLines.length - i) * 7 * 24 * 60 * 60 * 1000);
                if (finalDate) {
                    const month = finalDate.getMonth();
                    const day = finalDate.getDate();
                    if (month === 11 && day === 22) {
                        dType = 'navidad';
                    } else if (month === 0 && day === 6) {
                        dType = 'nino';
                    }
                }

                const dateStr = finalDate.toISOString().split('T')[0];
                if (seenDates.has(dateStr)) {
                    return;
                }
                seenDates.add(dateStr);

                const encodedNumbers = digits.map((digit, col) => (col + 1) * 10 + digit);
                parsedDraws.push({
                    id: parsedDraws.length + 1,
                    date: finalDate,
                    numbers: encodedNumbers,
                    sum: encodedNumbers.reduce((a, b) => a + b, 0),
                    drawType: dType
                });
            }
        });

        if (parsedDraws.length > 0) {
            parsedDraws.sort((a, b) => {
                const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
                const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
                return timeA - timeB;
            });
            parsedDraws.forEach((d, idx) => { d.id = idx + 1; });
            return parsedDraws;
        }
    }
    
    let dateIndex = -1;
    let numberIndices: number[] = [];
    let starIndices: number[] = [];
    let complementarioIndex = -1;
    let reintegroIndex = -1;

    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;
    const numberRange = this.currentGame.numberRange;
    const starRange = this.currentGame.starRange;

    if (isHeader) {
        const dateKeywords = ['fecha', 'date', 'sorteo'];
        dateIndex = header.findIndex(h => dateKeywords.some(k => h.includes(k)));

        const numberHeaderCandidates: {index: number, name: string}[] = [];
        const starHeaderCandidates: {index: number, name: string}[] = [];
        
        header.forEach((h, i) => {
            if (/^(n|bola|num|number|c)[\s_-]*\d+$/i.test(h)) {
                numberHeaderCandidates.push({index: i, name: h});
            } else if (/^(s|estrella|star|e|clave|powerbal|powerball|pb)[\s_-]*\d*$/i.test(h) || h.includes('clave') || h.includes('estrella') || h.includes('star') || h.includes('sueño') || h.includes('suno') || h.includes('powerbal') || h.includes('powerball') || h.includes('pb') || h.includes('mega ball') || h.includes('megaball') || h.includes('mega')) {
                starHeaderCandidates.push({index: i, name: h});
            } else if (h.includes('complementario') || h === 'c') {
                complementarioIndex = i;
            } else if (h.includes('reintegro') || h === 'r') {
                reintegroIndex = i;
            }
        });
        
        if (numberHeaderCandidates.length >= maxNumbers) {
            numberHeaderCandidates.sort((a, b) => {
                const matchA = a.name.match(/\d+$/);
                const matchB = b.name.match(/\d+$/);
                const numA = matchA ? parseInt(matchA[0]) : 0;
                const numB = matchB ? parseInt(matchB[0]) : 0;
                return numA - numB;
            });
            numberIndices = numberHeaderCandidates.map(c => c.index).slice(0, maxNumbers);
        }

        if (maxStars > 0 && starHeaderCandidates.length >= maxStars) {
            starHeaderCandidates.sort((a, b) => {
                const matchA = a.name.match(/\d+$/);
                const matchB = b.name.match(/\d+$/);
                const numA = matchA ? parseInt(matchA[0]) : 0;
                const numB = matchB ? parseInt(matchB[0]) : 0;
                return numA - numB;
            });
            starIndices = starHeaderCandidates.map(c => c.index).slice(0, maxStars);
        }
    }

    let parsedResults: Draw[] = [];

    if (numberIndices.length < maxNumbers) {
        parsedResults = lines.map((line, i) => {
            const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, '').trim());
            let date: Date | null = null;
            let startCol = 0;

            if (parts.length > 0) {
                if (parts[0].includes('-') || parts[0].includes('/') || isNaN(Number(parts[0]))) {
                    const d = this.parseFlexibleDate(parts[0]);
                    if (d && !isNaN(d.getTime())) {
                        date = d;
                    }
                    startCol = 1;
                }
            }
            
            const numericParts = parts.slice(startCol).filter(p => /^\d+$/.test(p.trim())).map(p => parseInt(p.trim(), 10));
            const numbers = numericParts.filter(n => n >= 1 && n <= numberRange).slice(0, maxNumbers);
            
            if (numbers.length < maxNumbers) {
                return null;
            }

            let stars: number[] | undefined = undefined;
            let complementario: number | undefined = undefined;
            let reintegro: number | undefined = undefined;

            if (maxStars > 0) {
                const isGordo = this.currentGame.id === 'gordo';
                const minStar = isGordo ? 0 : 1;
                const maxStar = isGordo ? 9 : starRange;
                const starCandidates = numericParts.slice(maxNumbers);
                stars = starCandidates.filter(n => n >= minStar && n <= maxStar).slice(0, maxStars);
            } else if (this.currentGame.id !== 'euromillones') {
                const remainingNumbers = numericParts.slice(maxNumbers);
                if (remainingNumbers.length >= 1) {
                    complementario = remainingNumbers[0];
                }
                if (remainingNumbers.length >= 2) {
                    reintegro = remainingNumbers[1];
                }
            }

            return {
                id: i + 1,
                date: date || new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000),
                numbers: numbers.sort((a, b) => a - b),
                stars: stars,
                complementario,
                reintegro,
                sum: numbers.reduce((a, b) => a + b, 0)
            };
        }).filter(Boolean) as Draw[];
    } else {
        parsedResults = lines.map((line, i) => {
            try {
                const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, '').trim());
                if (parts.length <= Math.max(...numberIndices, dateIndex)) {
                    return null;
                }
                const numbers = numberIndices.map(index => parseInt(parts[index].trim()));
                if (numbers.some(isNaN)) return null;
                
                let stars: number[] | undefined = undefined;
                if (maxStars > 0 && starIndices.length === maxStars) {
                    stars = starIndices.map(index => parseInt(parts[index].trim()));
                    if (stars.some(isNaN)) stars = undefined;
                } else if (maxStars > 0) {
                    const usedIndices = new Set([...numberIndices, dateIndex, complementarioIndex, reintegroIndex]);
                    const isGordo = this.currentGame.id === 'gordo';
                    const minStar = isGordo ? 0 : 1;
                    const maxStar = isGordo ? 9 : starRange;
                    const starCandidates: number[] = [];
                    parts.forEach((p, idx) => {
                        if (!usedIndices.has(idx) && /^\d+$/.test(p.trim())) {
                            const val = parseInt(p.trim(), 10);
                            if (val >= minStar && val <= maxStar) {
                                starCandidates.push(val);
                            }
                        }
                    });
                    if (starCandidates.length >= maxStars) {
                        stars = starCandidates.slice(0, maxStars);
                    }
                }

                let complementario: number | undefined = undefined;
                if (complementarioIndex > -1 && parts[complementarioIndex]) {
                    complementario = parseInt(parts[complementarioIndex].trim());
                    if (isNaN(complementario)) complementario = undefined;
                }

                let reintegro: number | undefined = undefined;
                if (reintegroIndex > -1 && parts[reintegroIndex]) {
                    reintegro = parseInt(parts[reintegroIndex].trim());
                    if (isNaN(reintegro)) reintegro = undefined;
                }

                let date: Date;
                if (dateIndex > -1 && parts[dateIndex]) {
                    const parsedDate = this.parseFlexibleDate(parts[dateIndex]);
                    date = (parsedDate && !isNaN(parsedDate.getTime())) ? parsedDate : new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000);
                } else {
                    date = new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000);
                }
                return {
                    id: i + 1,
                    date: date,
                    numbers: numbers.sort((a, b) => a - b),
                    stars: stars ? stars.sort((a, b) => a - b) : undefined,
                    complementario,
                    reintegro,
                    sum: numbers.reduce((a, b) => a + b, 0)
                };
            } catch (error: any) {
                return null;
            }
        }).filter(Boolean) as Draw[];
    }

    // Sort chronologically ascending (oldest first, newest last)
    parsedResults.sort((a, b) => {
        const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
        const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
        return timeA - timeB;
    });

    parsedResults.forEach((d, idx) => {
        d.id = idx + 1;
    });

    return parsedResults;
  }

  updateCalculatorJackpotValue() {
    const jackpotInput = document.getElementById('calcJackpotInput') as HTMLInputElement;
    if (!jackpotInput) return;
    const fallbackBotes: { [id: string]: number } = {
      powerball: 95000000, megamillions: 110000000, euromillones: 89000000,
      primitiva: 47000000, gordo: 11900000, eurodreams: 7200000,
      bonoloto: 2800000, nacional: 30000
    };
    const cached = (this as any).lastJackpotsData?.find((j: any) => j.id === this.currentGame.id);
    const boteVal = cached?.bote !== undefined ? cached.bote : (fallbackBotes[this.currentGame.id] || 0);
    jackpotInput.value = String(boteVal);
  }

  updateCalculatorStarsWrapper() {
    const starsWrapper = document.getElementById('calcStarsInputWrapper');
    const starsLabel = document.getElementById('calcStarsLabel');
    if (starsWrapper && starsLabel) {
      if (this.currentGame.maxStars > 0) {
        starsWrapper.style.display = 'block';
        starsLabel.textContent = this.currentGame.starName ? `${this.currentGame.starName}:` : t('calculator.estrellasMarcadas');
      } else {
        starsWrapper.style.display = 'none';
      }
    }
  }

  // Devuelve las opciones oficiales de números/estrellas por juego, igual que renderMultipleStrategyOptions
  getCalculatorGameOptions() {
    const id = this.currentGame.id;
    const isEuromillones = id === 'euromillones';
    const isEurodreams = id === 'eurodreams';
    const isGordo = id === 'gordo';
    const isPowerball = id === 'powerball';
    const isMegaMillions = id === 'megamillions';
    const isPrimitiva = id === 'primitiva';
    const isBonoloto = id === 'bonoloto';
    const maxStars = this.currentGame.maxStars;

    let numOptions: number[] = [];
    if (isEurodreams) numOptions = [6, 7, 8, 9, 10];
    else if (isGordo) numOptions = [6, 7, 8, 9, 10, 11];
    else if (isEuromillones || isPowerball || isMegaMillions) numOptions = [5, 6, 7, 8, 9, 10];
    else if (isPrimitiva || isBonoloto) numOptions = [5, 7, 8, 9, 10, 11];
    else {
      const isMain5 = this.currentGame.maxNumbers === 5;
      numOptions = isMain5 ? [5, 6, 7, 8, 9, 10] : [7, 8, 9, 10, 11];
    }
    const defaultNum = (isPrimitiva || isBonoloto) ? 7 : (isEurodreams ? 7 : (isGordo ? 6 : (this.currentGame.maxNumbers === 5 ? 6 : 7)));

    let starOptions: number[] = [];
    if (maxStars > 0) {
      if (isEuromillones) starOptions = [2, 3, 4, 5];
      else if (isEurodreams) starOptions = [1, 2, 3, 4, 5];
      else if (isGordo) starOptions = [1];
      else starOptions = [maxStars, maxStars + 1, maxStars + 2];
    }
    const defaultStar = isEurodreams ? 1 : (isGordo ? 1 : maxStars);

    return { numOptions, defaultNum, starOptions, defaultStar };
  }

  // Combinaciones oficiales por juego, igual que updateCostBadge (incluye caso especial 5→44 Bonoloto/Primitiva)
  calcMultipleCombos(n: number, s: number): number {
    const id = this.currentGame.id;
    if (id === 'euromillones') {
      return this.nCr(n, 5) * this.nCr(s, 2);
    } else if (id === 'eurodreams') {
      return this.nCr(n, 6) * s;
    } else if (id === 'gordo') {
      return this.nCr(n, 5) * s;
    } else if (id === 'powerball' || id === 'megamillions') {
      return this.nCr(n, 5) * s;
    } else if (id === 'primitiva' || id === 'bonoloto') {
      return n === 5 ? 44 : this.nCr(n, 6);
    } else {
      return this.nCr(n, this.currentGame.maxNumbers);
    }
  }

  populateCalculatorSelects() {
    const { numOptions, defaultNum, starOptions, defaultStar } = this.getCalculatorGameOptions();
    const numSelect = document.getElementById('calcNumbersSelect') as HTMLSelectElement;
    if (numSelect) {
      numSelect.innerHTML = numOptions.map(n => `<option value="${n}" ${n === defaultNum ? 'selected' : ''}>${n} números</option>`).join('');
    }
    const starSelect = document.getElementById('calcStarsSelect') as HTMLSelectElement;
    if (starSelect) {
      starSelect.innerHTML = starOptions.map(s => `<option value="${s}" ${s === defaultStar ? 'selected' : ''}>${s}</option>`).join('');
    }
  }

  populateReducedSystemSelect() {
    const select = document.getElementById('calcReducedSystemSelect') as HTMLSelectElement;
    const noSystemsMsg = document.getElementById('calcReducedNoSystems');
    const reducedInputsWrapper = document.getElementById('calculatorReducedInputs');
    const reducedTab = document.getElementById('calcReducedTab');
    if (!select || !reducedTab) return;

    const systems = REDUCED_SYSTEMS[this.currentGame.id] || [];

    if (systems.length === 0) {
      reducedTab.style.display = 'none';
      if (select) select.style.display = 'none';
      if (noSystemsMsg) noSystemsMsg.style.display = 'block';
      // Si la pestaña reducida estaba activa, volvemos a Simple
      if (reducedTab.classList.contains('active')) {
        const simpleTab = document.querySelector('.calculator-tab[data-bet-type="simple"]') as HTMLElement;
        simpleTab?.click();
      }
      return;
    }

    reducedTab.style.display = 'inline-block';
    if (select) select.style.display = 'block';
    if (noSystemsMsg) noSystemsMsg.style.display = 'none';
    select.innerHTML = systems.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (reducedInputsWrapper) reducedInputsWrapper.style.display = 'none'; // display gestionado por la pestaña activa
  }

  initCalculator() {
    this.updateCalculatorJackpotValue();
    this.populateCalculatorSelects();
    this.updateCalculatorStarsWrapper();
    this.populateReducedSystemSelect();

    document.querySelectorAll('.calculator-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.calculator-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const betType = (tab as HTMLElement).dataset.betType;
        const simpleInputs = document.getElementById('calculatorSimpleInputs');
        const multipleInputs = document.getElementById('calculatorMultipleInputs');
        const reducedInputs = document.getElementById('calculatorReducedInputs');
        if (simpleInputs) simpleInputs.style.display = betType === 'simple' ? 'flex' : 'none';
        if (multipleInputs) multipleInputs.style.display = betType === 'multiple' ? 'flex' : 'none';
        if (reducedInputs) reducedInputs.style.display = betType === 'reducida' ? 'flex' : 'none';
        this.updateCalculatorResults();
      });
    });

    ['calcSimpleQtyInput', 'calcNumbersSelect', 'calcStarsSelect', 'calcJackpotInput', 'calcReducedSystemSelect'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateCalculatorResults());
      document.getElementById(id)?.addEventListener('change', () => this.updateCalculatorResults());
    });

    this.updateCalculatorResults();
  }

  updateCalculatorResults() {
    const activeTab = document.querySelector('.calculator-tab.active') as HTMLElement;
    const betType = activeTab?.dataset.betType || 'simple';
    const isMultiple = betType === 'multiple';
    const isReducida = betType === 'reducida';

    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars || 0;
    const costPerBet = this.currentGame.costPerBet;
    const currency = this.currentGame.currency || '€';

    let nCombos = 1;
    let reducedSystem: ReducedSystem | undefined;

    if (isReducida) {
      const systems = REDUCED_SYSTEMS[this.currentGame.id] || [];
      const selectedId = (document.getElementById('calcReducedSystemSelect') as HTMLSelectElement)?.value;
      reducedSystem = systems.find(s => s.id === selectedId) || systems[0];
      nCombos = reducedSystem ? reducedSystem.combinationsCount : 0;
    } else if (isMultiple) {
      const n = parseInt((document.getElementById('calcNumbersSelect') as HTMLSelectElement)?.value || String(maxNumbers));
      const s = maxStars > 0 ? parseInt((document.getElementById('calcStarsSelect') as HTMLSelectElement)?.value || String(maxStars)) : 1;
      nCombos = this.calcMultipleCombos(n, s);
    } else {
      const qty = parseInt((document.getElementById('calcSimpleQtyInput') as HTMLInputElement)?.value || '1');
      nCombos = Math.max(qty, 1);
    }

    const cost = nCombos * costPerBet;
    const probPct = (this.currentGame.theoreticalProbabilities[String(maxNumbers)] || 0) * nCombos;

    const safeSetText = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    safeSetText('calcNumCombos', String(nCombos));
    safeSetText('calcCosteTotal', `${currency}${cost.toFixed(2)}`);
    safeSetText('calcProbabilidad', `${probPct.toFixed(7)}%`);

    // Probabilidad de que los números ganadores estén dentro de tu base (activa la garantía del sistema)
    const garantiaWrapper = document.getElementById('calcGarantiaWrapper');
    const garantiaEl = document.getElementById('calcProbGarantia');
    if (isReducida && reducedSystem && garantiaWrapper && garantiaEl) {
      const favorable = this.nCr(reducedSystem.baseNumbersCount, maxNumbers);
      const total = this.nCr(this.currentGame.numberRange, maxNumbers);
      const probGarantiaPct = total > 0 ? (favorable / total) * 100 : 0;
      garantiaWrapper.style.display = 'block';
      garantiaEl.textContent = `${probGarantiaPct.toFixed(4)}%`;
    } else if (garantiaWrapper) {
      garantiaWrapper.style.display = 'none';
    }

    const jackpotInput = document.getElementById('calcJackpotInput') as HTMLInputElement;
    const bote = parseFloat(jackpotInput?.value || '0');
    const esperanzaWrapper = document.getElementById('calcEsperanzaWrapper');
    const esperanzaEl = document.getElementById('calcEsperanzaNeta');
    if (bote > 0 && esperanzaWrapper && esperanzaEl) {
      esperanzaWrapper.style.display = 'block';
      const esperanza = (bote * (probPct / 100)) - cost;
      esperanzaEl.textContent = `${esperanza >= 0 ? '+' : ''}${currency}${esperanza.toFixed(4)}`;
      esperanzaEl.classList.toggle('positive', esperanza >= 0);
      esperanzaEl.classList.toggle('negative', esperanza < 0);
    } else if (esperanzaWrapper) {
      esperanzaWrapper.style.display = 'none';
    }
  }

  updateDataAnalysis() {
    const dataInfo = document.getElementById('dataInfo');
    const dataStatsGrid = document.getElementById('dataStatsGrid');
    if (!dataInfo || !dataStatsGrid) return;
    
    if (!this.dataLoaded || this.historicalData.length === 0) {
      dataInfo.textContent = t('analyzer.sinDatos');
      dataInfo.className = 'data-info';
      dataStatsGrid.style.display = 'none';
      this.renderFrequencyChart(); // Clear chart
      const gapSwitch = document.getElementById('useGapPercentilSwitch') as HTMLInputElement;
      const gapUmbral = document.getElementById('gapPercentilUmbral') as HTMLInputElement;
      if (gapSwitch) {
        gapSwitch.disabled = true;
        gapSwitch.checked = false;
        if (this.filters) this.filters.gapPercentilEnabled = false;
      }
      if (gapUmbral) gapUmbral.disabled = true;
      return;
    }

    const gapSwitch = document.getElementById('useGapPercentilSwitch') as HTMLInputElement;
    const gapUmbral = document.getElementById('gapPercentilUmbral') as HTMLInputElement;
    const canUseGap = this.currentGame.id !== 'nacional';
    if (gapSwitch) {
      gapSwitch.disabled = !canUseGap;
      if (!canUseGap) {
        gapSwitch.checked = false;
        if (this.filters) this.filters.gapPercentilEnabled = false;
      }
    }
    if (gapUmbral) gapUmbral.disabled = !canUseGap;

    this.applyGapFilterMemory();
    this.renderGapPercentilChart();

    // Frequencies for Numbers
    const isNacional = this.currentGame.id === 'nacional';
    const startNum = isNacional ? 10 : 1;
    const frequencies: { [key: number]: number } = {};
    for (let i = startNum; i <= this.currentGame.numberRange; i++) frequencies[i] = 0;
    this.historicalData.forEach(draw => (draw.numbers || []).forEach(num => {
        if (frequencies[num] !== undefined) frequencies[num]++;
    }));
    const sortedFreq = Object.entries(frequencies).sort((a, b) => b[1] - a[1]);

    // Frequencies for Stars
    let starStatsText = '';
    const starFrequencies: { [key: number]: number } = {};
    if (this.currentGame.maxStars > 0) {
        const isGordo = this.currentGame.id === 'gordo';
        const minStar = isGordo ? 0 : 1;
        const maxStar = isGordo ? 9 : this.currentGame.starRange;
        for (let i = minStar; i <= maxStar; i++) starFrequencies[i] = 0;
        this.historicalData.forEach(draw => {
            if (draw.stars) {
                draw.stars.forEach(star => {
                    if (starFrequencies[star] !== undefined) starFrequencies[star]++;
                });
            }
        });
        const sortedStarFreq = Object.entries(starFrequencies).sort((a, b) => b[1] - a[1]);
        const starLabelName = this.currentGame.id === 'powerball' ? t('analyzer.starLabel.powerball') : (this.currentGame.id === 'megamillions' ? t('analyzer.starLabel.megamillions') : (isGordo ? t('analyzer.starLabel.gordo') : (this.currentGame.id === 'eurodreams' ? t('analyzer.starLabel.eurodreams') : t('analyzer.starLabel.generico'))));
        starStatsText = `<br><span style="color: #d97706; font-size: 0.8rem;">${t('analyzer.starTopTemplate', { label: starLabelName, nums: sortedStarFreq.slice(0, 2).map(([num]) => num).join(', ') })}</span>`;
    }

    dataInfo.innerHTML = t('analyzer.datosCargados', { count: this.historicalData.length, type: this.dataType.toUpperCase() }) + starStatsText;
    dataInfo.className = 'data-info has-data';
    
    const safeSetText = (id: string, text: string | number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(text);
    };
    
    safeSetText('totalDraws', this.historicalData.length);
    safeSetText('dataType', this.dataType.toUpperCase());
    safeSetText('mostFrequent', sortedFreq.slice(0, 3).map(([num]) => num).join(', '));
    safeSetText('leastFrequent', sortedFreq.slice(-3).map(([num]) => num).join(', '));

    const lastDraw = this.historicalData[this.historicalData.length - 1];
    if (lastDraw && lastDraw.date) {
      const d = lastDraw.date instanceof Date ? lastDraw.date : new Date(lastDraw.date);
      if (!isNaN(d.getTime())) {
        const formattedDate = d.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        safeSetText('lastUpdateDate', formattedDate);
      } else {
        safeSetText('lastUpdateDate', '-');
      }
    } else {
      safeSetText('lastUpdateDate', '-');
    }
    
    const chiSquareEl = document.getElementById('chiSquare');
    const biasEl = document.getElementById('biasDetected');
    const chiSquareLabelEl = document.getElementById('chiSquareLabel');
    const biasDetectedLabelEl = document.getElementById('biasDetectedLabel');

    const chiSquareStarsItem = document.getElementById('chiSquareStarsItem');
    const biasDetectedStarsItem = document.getElementById('biasDetectedStarsItem');

    const chiSquareStarsEl = document.getElementById('chiSquareStars');
    const biasDetectedStarsEl = document.getElementById('biasDetectedStars');

    const hasStars = this.currentGame.maxStars > 0;

    if (hasStars) {
      if (chiSquareStarsItem) chiSquareStarsItem.style.display = '';
      if (biasDetectedStarsItem) biasDetectedStarsItem.style.display = '';
      if (chiSquareLabelEl) chiSquareLabelEl.textContent = t('analyzer.chiSquareNumeros');
      if (biasDetectedLabelEl) biasDetectedLabelEl.textContent = t('analyzer.sesgoDetectadoNumeros');
    } else {
      if (chiSquareStarsItem) chiSquareStarsItem.style.display = 'none';
      if (biasDetectedStarsItem) biasDetectedStarsItem.style.display = 'none';
      if (chiSquareLabelEl) chiSquareLabelEl.textContent = t('analyzer.chiCuadrado');
      if (biasDetectedLabelEl) biasDetectedLabelEl.textContent = t('analyzer.sesgoDetectado');
    }

    if (this.historicalData.length >= 50 && chiSquareEl && biasEl) {
        // 1. Chi-Square for Numbers
        let expectedFrequency = 0;
        let dfNumbers = 0;

        if (isNacional) {
            // Lotería Nacional: 5 posiciones independientes con dígitos 0-9 (prob=0.1 por posición)
            expectedFrequency = this.historicalData.length * 0.1;
            // 5 pruebas de uniformidad independientes (cada una con 10 dígitos -> df=9), df total = 5 * 9 = 45
            const df = 45; // df = 45 para Nacional (5 posiciones x 9 grados de libertad)
            dfNumbers = df;
        } else {
            expectedFrequency = (this.historicalData.length * this.currentGame.maxNumbers) / this.currentGame.numberRange;
            dfNumbers = this.currentGame.numberRange - 1;
        }

        let chiSquareNumStat = 0;
        for (let i = startNum; i <= this.currentGame.numberRange; i++) {
            chiSquareNumStat += Math.pow((frequencies[i] || 0) - expectedFrequency, 2) / expectedFrequency;
        }

        const criticalValueNumbers = this.chiSquareCriticalValue(dfNumbers, 1.645);
        const biasDetectedNumbers = chiSquareNumStat > criticalValueNumbers;

        chiSquareEl.textContent = chiSquareNumStat.toFixed(2);
        biasEl.textContent = biasDetectedNumbers ? t('analyzer.sesgoSi') : t('analyzer.sesgoNo');
        biasEl.classList.toggle('invalid', biasDetectedNumbers);
        biasEl.classList.toggle('valid', !biasDetectedNumbers);

        // 2. Chi-Square for Stars (if applicable)
        if (hasStars) {
            const isGordo = this.currentGame.id === 'gordo';
            const minStar = isGordo ? 0 : 1;
            const maxStar = isGordo ? 9 : this.currentGame.starRange;
            const starCategoriesCount = isGordo ? 10 : this.currentGame.starRange;
            const expectedStarFreq = (this.historicalData.length * this.currentGame.maxStars) / starCategoriesCount;
            
            let chiSquareStarStat = 0;
            for (let i = minStar; i <= maxStar; i++) {
                chiSquareStarStat += Math.pow((starFrequencies[i] || 0) - expectedStarFreq, 2) / expectedStarFreq;
            }

            const dfStars = starCategoriesCount - 1;
            const criticalValueStars = this.chiSquareCriticalValue(dfStars, 1.645);
            const biasDetectedStars = chiSquareStarStat > criticalValueStars;

            if (chiSquareStarsEl) chiSquareStarsEl.textContent = chiSquareStarStat.toFixed(2);
            if (biasDetectedStarsEl) {
                biasDetectedStarsEl.textContent = biasDetectedStars ? t('analyzer.sesgoSi') : t('analyzer.sesgoNo');
                biasDetectedStarsEl.classList.toggle('invalid', biasDetectedStars);
                biasDetectedStarsEl.classList.toggle('valid', !biasDetectedStars);
            }
        }
    } else if (chiSquareEl && biasEl) {
        chiSquareEl.textContent = 'N/A';
        biasEl.textContent = t('analyzer.datosInsuficientes');
        biasEl.classList.remove('valid', 'invalid');

        if (chiSquareStarsEl) chiSquareStarsEl.textContent = 'N/A';
        if (biasDetectedStarsEl) {
            biasDetectedStarsEl.textContent = t('analyzer.datosInsuficientes');
            biasDetectedStarsEl.classList.remove('valid', 'invalid');
        }
    }
    
    dataStatsGrid.style.display = 'grid';
    this.renderFrequencyChart();
    this.updateBigDataPanel(); // Refresh panel on data load
    this.updateBacktestUI();
  }

  // ===== ANÁLISIS DE NÚMEROS (Actualizado) =====
  analyzeNumbers() {
    // Reset stats
    this.numberStats = {};
    const startNum = this.currentGame.id === 'nacional' ? 10 : 1;
    for(let i = startNum; i <= this.currentGame.numberRange; i++) this.numberStats[i] = { frequency: 0, score: 0, lastSeen: 0 };
    
    this.starStats = {};
    if (this.currentGame.maxStars > 0) {
        const minStar = this.currentGame.id === 'gordo' ? 0 : 1;
        const maxStar = this.currentGame.id === 'gordo' ? 9 : this.currentGame.starRange;
        for(let i = minStar; i <= maxStar; i++) this.starStats[i] = { frequency: 0, score: 0, lastSeen: 0 };
    }

    // Recorrer toda la historia
    this.historicalData.forEach(draw => {
        // Basic Stats Numbers
        draw.numbers.forEach(num => {
            if (this.numberStats[num]) this.numberStats[num].lastSeen = draw.id;
        });
        // Basic Stats Stars
        if (draw.stars) {
            draw.stars.forEach(star => {
                if (this.starStats[star]) this.starStats[star].lastSeen = draw.id;
            });
        }
    });
    
    // Recorrer el periodo de análisis para la frecuencia (calientes/fríos)
    const analysisData = this.historicalData.slice(-this.analysisPeriod);
    if (analysisData.length === 0) {
        this.classifyNumbers(); // Limpiará los sets si no hay datos
        return;
    }
    analysisData.forEach(draw => {
        draw.numbers.forEach(num => {
            if (this.numberStats[num]) this.numberStats[num].frequency++;
        });
        if (draw.stars) {
            draw.stars.forEach(star => {
                if (this.starStats[star]) this.starStats[star].frequency++;
            });
        }
    });
    
    this.classifyNumbers();
    this.analyzeLastDrawTrend();
  }

  analyzeLastDrawTrend() {
    if (!this.historicalData || this.historicalData.length === 0 || !this.drawTrendPanel) return;

    const lastDraw = this.historicalData[this.historicalData.length - 1];
    const numbers = lastDraw.numbers;
    const stars = lastDraw.stars || [];
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;
    
    let hotCount = 0;
    let coldCount = 0;
    let neutralCount = 0;

    numbers.forEach(n => {
      if (this.hotNumbers.has(n)) hotCount++;
      else if (this.coldNumbers.has(n)) coldCount++;
      else neutralCount++;
    });

    let hotStarCount = 0;
    let coldStarCount = 0;
    let neutralStarCount = 0;

    stars.forEach(s => {
        if (this.hotStars.has(s)) hotStarCount++;
        else if (this.coldStars.has(s)) coldStarCount++;
        else neutralStarCount++;
    });

    this.drawTrendPanel.style.display = 'block';

    let trend = "";
    let recommendation = "";
    
    // Default suggestions for numbers (balanced)
    let suggestedHot = Math.floor(maxNumbers * 0.4);
    let suggestedCold = Math.floor(maxNumbers * 0.2);
    let suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;

    // Lógica de "Regresión a la Media" para Números
    const hotThreshold = Math.ceil(maxNumbers * 0.6); // 4 for 6, 3 for 5
    const coldThreshold = Math.ceil(maxNumbers * 0.4); // 3 for 6, 2 for 5
    const neutralThreshold = Math.ceil(maxNumbers * 0.7); // 5 for 6, 4 for 5

    if (hotCount >= hotThreshold) {
      trend = t('bigdata.trend.muyCaliente');
      recommendation = t('bigdata.trend.tocaEnfriar');
      suggestedHot = Math.floor(maxNumbers * 0.2);
      suggestedCold = Math.floor(maxNumbers * 0.4);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else if (coldCount >= coldThreshold) {
      trend = t('bigdata.trend.muyFrio');
      recommendation = t('bigdata.trend.tocaCalentar');
      suggestedHot = Math.floor(maxNumbers * 0.5);
      suggestedCold = Math.floor(maxNumbers * 0.1);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else if (neutralCount >= neutralThreshold) {
      trend = t('bigdata.trend.muyNeutro');
      recommendation = t('bigdata.trend.activarExtremos');
      suggestedHot = Math.floor(maxNumbers * 0.4);
      suggestedCold = Math.floor(maxNumbers * 0.4);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else {
      trend = t('bigdata.trend.balanceado');
      recommendation = t('bigdata.trend.mantenerCiclo');
    }

    // Suggestions for Stars
    let suggestedStarHot = 0;
    let suggestedStarNeutral = 0;
    let suggestedStarCold = 0;

    if (maxStars > 0) {
        suggestedStarHot = Math.floor(maxStars / 2);
        suggestedStarCold = Math.ceil(maxStars / 2);
        suggestedStarNeutral = maxStars - suggestedStarHot - suggestedStarCold;

        if (hotStarCount >= 1) {
            suggestedStarHot = 0;
            suggestedStarCold = 1;
            suggestedStarNeutral = maxStars - 1;
        } else if (coldStarCount >= 1) {
            suggestedStarHot = 1;
            suggestedStarCold = 0;
            suggestedStarNeutral = maxStars - 1;
        }
    }

    if (this.currentTrendLabel) this.currentTrendLabel.textContent = trend;
    if (this.trendRecommendation) this.trendRecommendation.textContent = recommendation;
    
    if (this.suggestedProfile) {
      let html = `
        <div style="margin-bottom: 8px;">
            <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px; font-weight: bold;">${t('bigdata.perfilNumeros')}</div>
            <span class="profile-tag" style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedHot} ${t('bigdata.calientes')}</span>
            <span class="profile-tag" style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedNeutral} ${t('bigdata.neutros')}</span>
            <span class="profile-tag" style="background: #e0f2fe; color: #075985; padding: 2px 6px; border-radius: 4px;">${suggestedCold} ${t('bigdata.frios')}</span>
        </div>
      `;

      if (maxStars > 0) {
          html += `
            <div>
                <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px; font-weight: bold;">${t('bigdata.perfilEstrellas')}</div>
                <span class="profile-tag" style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedStarHot} ${t('bigdata.calientes')}</span>
                <span class="profile-tag" style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedStarNeutral} ${t('bigdata.neutros')}</span>
                <span class="profile-tag" style="background: #e0f2fe; color: #075985; padding: 2px 6px; border-radius: 4px;">${suggestedStarCold} ${t('bigdata.frios')}</span>
            </div>
          `;
      }
      this.suggestedProfile.innerHTML = html;
    }

    // Guardar perfil sugerido para el motor de correlación
    this.currentSuggestedProfile = { 
        hot: suggestedHot, 
        neutral: suggestedNeutral, 
        cold: suggestedCold,
        starHot: suggestedStarHot,
        starNeutral: suggestedStarNeutral,
        starCold: suggestedStarCold
    };
  }

  classifyNumbers() {
    const result = classifyNumbersUtil(
      this.historicalData, this.numberStats, this.starStats, this.currentGame
    );
    this.hotNumbers = result.hotNumbers;
    this.coldNumbers = result.coldNumbers;
    this.absentNumbers = result.absentNumbers;
    this.hotStars = result.hotStars;
    this.coldStars = result.coldStars;
    this.absentStars = result.absentStars;
  }
  updateGridNumberStates() {
    const startNum = this.currentGame.id === 'nacional' ? 10 : 1;
    // Update Main Numbers
    for (let i = startNum; i <= this.currentGame.numberRange; i++) {
      const ball = document.querySelector(`.number-ball[data-number="${i}"][data-type="number"]`);
      if (ball) {
        ball.classList.remove('hot', 'cold', 'absent', 'suggested', 'favorite', 'excluded', 'base-reduced');
        
        if (this.selectedNumbers.has(i)) {
          ball.classList.add('selected');
        } else {
          ball.classList.remove('selected');
        }

        if (this.reducedBaseNumbers.has(i)) {
          ball.classList.add('base-reduced');
        } else {
          ball.classList.remove('base-reduced');
        }

        const icon = ball.querySelector('.number-icon');
        if (!icon) continue;

        let newIcon = '';
        
        // Priority 0: Excluded (Overrides everything else logically)
        if (this.excludedNumbers.has(i)) {
            ball.classList.add('excluded');
            newIcon = '🚫';
        }
        // Priority 1: Favorites overrides basic stats background
        else if (this.favoriteNumbers.has(i)) {
            ball.classList.add('favorite');
            newIcon = '⭐';
        }

        // Priority 2: Suggested (Border/Animation overlays)
        if (this.suggestedNumbers.has(i) && !this.excludedNumbers.has(i)) {
            ball.classList.add('suggested');
            if (!this.favoriteNumbers.has(i)) {
                newIcon = '💡';
            }
        }

        // Apply Hot/Cold/Absent if NOT Favorite and NOT Excluded
        if (!this.favoriteNumbers.has(i) && !this.excludedNumbers.has(i)) {
            if (this.hotNumbers.has(i)) {
                ball.classList.add('hot');
                newIcon = this.suggestedNumbers.has(i) ? '💡' : '🔥';
            } else if (this.absentNumbers.has(i)) {
                ball.classList.add('absent');
                newIcon = this.suggestedNumbers.has(i) ? '💡' : '👻';
            } else if (this.coldNumbers.has(i)) {
                ball.classList.add('cold');
                newIcon = this.suggestedNumbers.has(i) ? '💡' : '❄️';
            }
        }
        
        icon.textContent = newIcon;
      }
    }

    // Update Stars
    if (this.currentGame.maxStars > 0) {
        const isGordo = this.currentGame.id === 'gordo';
        const minStar = isGordo ? 0 : 1;
        const maxStar = isGordo ? 9 : this.currentGame.starRange;
        for (let i = minStar; i <= maxStar; i++) {
            const ball = document.querySelector(`.number-ball[data-number="${i}"][data-type="star"]`);
            if (ball) {
                ball.classList.remove('hot', 'cold', 'absent', 'suggested', 'favorite', 'excluded');
                
                if (this.selectedStars.has(i)) {
                    ball.classList.add('selected');
                } else {
                    ball.classList.remove('selected');
                }

                const icon = ball.querySelector('.number-icon');
                if (!icon) continue;

                let newIcon = '';
                
                if (this.excludedStars.has(i)) {
                    ball.classList.add('excluded');
                    newIcon = '🚫';
                }
                else if (this.favoriteStars.has(i)) {
                    ball.classList.add('favorite');
                    newIcon = '⭐';
                }

                if (this.suggestedStars.has(i) && !this.excludedStars.has(i)) {
                    ball.classList.add('suggested');
                    if (!this.favoriteStars.has(i)) {
                        newIcon = '💡';
                    }
                }

                if (!this.favoriteStars.has(i) && !this.excludedStars.has(i)) {
                    if (this.hotStars.has(i)) {
                        ball.classList.add('hot');
                        newIcon = this.suggestedStars.has(i) ? '💡' : '🔥';
                    } else if (this.absentStars.has(i)) {
                        ball.classList.add('absent');
                        newIcon = this.suggestedStars.has(i) ? '💡' : '👻';
                    } else if (this.coldStars.has(i)) {
                        ball.classList.add('cold');
                        newIcon = this.suggestedStars.has(i) ? '💡' : '❄️';
                    }
                }
                icon.textContent = newIcon;
            }
        }
    }
  }

  // ===== UI SETUP Y EVENTOS =====
  createNumbersGrid() {
    const grid = document.getElementById('numbersGrid');
    const starsGrid = document.getElementById('starsGrid');
    const starsGridContainer = document.getElementById('starsGridContainer');
    const selectionTitle = document.getElementById('selectionTitle');
    
    if (!grid) return;
    grid.innerHTML = '';
    
    if (selectionTitle) {
      selectionTitle.textContent = t('main.seleccionNumeros', { game: this.currentGame.name });
    }

    const isNacional = this.currentGame.id === 'nacional';
    if (isNacional) {
      grid.classList.add('game-nacional');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = `repeat(${this.currentGame.gridCols}, 1fr)`;
      grid.style.gridTemplateRows = '';
      const startNum = 10;

      // Main Numbers Grid for Nacional
      for (let i = startNum; i <= this.currentGame.numberRange; i++) {
        if (i % 10 === 0) {
          const rowLabels = [
            t('nacional.cifra1'),
            t('nacional.cifra2'),
            t('nacional.cifra3'),
            t('nacional.cifra4'),
            t('nacional.cifra5')
          ];
          const labelIdx = Math.floor(i / 10) - 1;
          if (labelIdx >= 0 && labelIdx < 5) {
            const label = document.createElement('div');
            label.style.cssText = 'grid-column: span 10; margin-top: 12px; margin-bottom: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; text-align: left; padding-left: 2px; overflow-wrap: break-word; white-space: normal;';
            label.textContent = rowLabels[labelIdx];
            grid.appendChild(label);
          }
        }

        const ball = document.createElement('div');
        ball.classList.add('number-ball');
        ball.dataset.number = String(i);
        ball.dataset.type = 'number';
        ball.innerHTML = `${i % 10}<span class="number-icon"></span>`;
        grid.appendChild(ball);
      }
    } else {
      grid.classList.remove('game-nacional');
      if (this.currentGame.numbersLayout) {
        renderLayoutGrid(grid, this.currentGame.numbersLayout, this.currentGame.numberRange, this.currentGame.numbersStartAt ?? 1, 'number');
      }
    }

    // Stars Grid (if applicable)
    if (this.currentGame.maxStars > 0 && starsGrid && starsGridContainer) {
      starsGridContainer.style.display = 'block';
      starsGrid.innerHTML = '';
      
      const starsGridIcon = document.getElementById('starsGridIcon');
      const starsGridText = document.getElementById('starsGridText');
      if (starsGridIcon && starsGridText) {
          if (this.currentGame.id === 'gordo') {
              starsGridIcon.textContent = '🔑';
              starsGridText.textContent = t('selection.claveTitulo');
          } else if (this.currentGame.id === 'eurodreams') {
              starsGridIcon.textContent = '🌙';
              starsGridText.textContent = t('selection.suenosTitulo');
          } else if (this.currentGame.id === 'powerball') {
              starsGridIcon.textContent = '🔴';
              starsGridText.textContent = t('selection.bolasEspecialesTitulo');
          } else {
              starsGridIcon.textContent = '⭐';
              starsGridText.textContent = t('selection.estrellasTitulo');
          }
      }

      if (this.currentGame.secondaryLayout) {
        const secStartAt = this.currentGame.secondaryStartAt ?? 1;
        const secRange = secStartAt === 0 ? this.currentGame.starRange - 1 : this.currentGame.starRange;
        renderLayoutGrid(starsGrid, this.currentGame.secondaryLayout, secRange, secStartAt, 'star');
      }
    } else if (starsGridContainer) {
      starsGridContainer.style.display = 'none';
    }
  }

  populateReducedSystems() {
    const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
    if (!select) return;
    
    select.innerHTML = '';
    const systems = REDUCED_SYSTEMS[this.currentGame.id] || [];
    
    if (systems.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay sistemas reducidos para este juego';
      select.appendChild(option);
      this.updateReducedSystemInfo();
      return;
    }
    
    systems.forEach(system => {
      const option = document.createElement('option');
      option.value = system.id;
      option.textContent = system.name;
      select.appendChild(option);
    });
    
    this.updateReducedSystemInfo();
  }
  
  updateReducedSystemInfo() {
    const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
    const infoTitle = document.getElementById('reducedSystemInfoTitle');
    const infoDesc = document.getElementById('reducedSystemInfoDesc');
    
    if (!select || !infoTitle || !infoDesc) return;
    
    const gameId = this.currentGame.id;
    const systems = REDUCED_SYSTEMS[gameId] || [];
    const selectedId = select.value;
    const system = systems.find(s => s.id === selectedId);
    
    if (!system) {
      infoTitle.textContent = 'Sin sistema seleccionado';
      infoDesc.textContent = 'Selecciona un sistema de reducción de la lista superior.';
      this.updateSelectionTitle();
      return;
    }
    
    infoTitle.textContent = `📋 Garantías: ${system.name}`;
    infoDesc.innerHTML = `
      <strong>${system.description}</strong><br/>
      • Números base requeridos: <span style="color: var(--primary); font-weight: bold;">${system.baseNumbersCount}</span><br/>
      • Apuestas simples generadas: <span style="color: #0284c7; font-weight: bold;">${system.combinationsCount}</span><br/>
      • Ahorro vs Combinaciones Múltiples: <span style="color: #16a34a; font-weight: bold;">${Math.round((1 - (system.combinationsCount / this.getMultipleCombinationsCount(system.baseNumbersCount))) * 100)}%</span>
    `;
    this.updateSelectionTitle();
  }

  getMultipleCombinationsCount(n: number): number {
    return getMultipleCombinationsCountUtil(n, this.currentGame?.maxNumbers || 6);
  }

  updateSelectionTitle() {
    const selectionTitle = document.getElementById('selectionTitle');
    if (!selectionTitle) return;
    
    const strategy = (document.querySelector('.strategy-buttons .strategy-btn.active') as HTMLElement)?.dataset.strategy || 'simple';
    if (strategy === 'reducida') {
      const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
      const gameId = this.currentGame.id;
      const systems = REDUCED_SYSTEMS[gameId] || [];
      const selectedId = select?.value;
      const system = systems.find(s => s.id === selectedId);
      if (system) {
        selectionTitle.textContent = t('main.seleccionSistemaReducido', { count: system.baseNumbersCount });
        return;
      }
    }
    
    selectionTitle.textContent = t('main.seleccionNumeros', { game: this.currentGame.name });
  }

  async selectAiBase() {
    const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
    const gameId = this.currentGame.id;
    const systems = REDUCED_SYSTEMS[gameId] || [];
    const selectedId = select?.value;
    const system = systems.find(s => s.id === selectedId);

    if (!system) {
      this.showToast(t('toast.seleccionaSistemaReducido'), 'warning');
      return;
    }

    const countNeeded = system.baseNumbersCount;
    const maxNumbers = this.currentGame.maxNumbers;
    this.clearSelections(false);
    this.syncExclusionsWithFilters();

    const range = this.currentGame.numberRange;
    const isNacional = this.currentGame.id === 'nacional';
    const startNum = isNacional ? 10 : 1;

    const universe: number[] = [];
    for (let i = startNum; i <= range; i++) {
      if (!this.excludedNumbers.has(i)) universe.push(i);
    }

    if (universe.length < countNeeded) {
      this.showToast(t('toast.insuficientesNumerosDisponibles', { available: universe.length, needed: countNeeded }), 'warning');
      return;
    }

    const threshold = DEFAULT_TOLERANCE_LEVELS[countNeeded] || 0.5;
    const maxAttempts = 2000;

    let bestPool: number[] = [];
    let bestPct = -1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const shuffled = [...universe];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const candidatePool = shuffled.slice(0, countNeeded).sort((a, b) => a - b);

      let subCombinations = getCombinations(candidatePool, maxNumbers);
      if (subCombinations.length > 50000) {
        const sample: number[][] = [];
        for (let i = 0; i < 5000; i++) {
          sample.push(subCombinations[Math.floor(Math.random() * subCombinations.length)]);
        }
        subCombinations = sample;
      }

      let validCount = 0;
      for (const combo of subCombinations) {
        if (isValidCombination(combo, [], this.currentGame, this.filters, this.primes, true, this.historicalData)) {
          validCount++;
        }
      }
      const pct = validCount / subCombinations.length;

      if (pct > bestPct) {
        bestPct = pct;
        bestPool = candidatePool;
      }

      if (pct >= threshold) {
        break;
      }
    }

    bestPool.forEach(num => this.selectedNumbers.add(num));

    const pctDisplay = Math.round(bestPct * 100);
    this.showToast(t('toast.numerosBasePorCobertura', { count: countNeeded, pct: pctDisplay }), 'success');

    this.updateGridNumberStates();
    this.updateSelectedDisplay();
    this.updateStats();
    this.updateCorrelationScore();
  }

  async switchGame(gameId: string) {
    if (!GAMES[gameId]) return;
    
    // Save current filters and historical data state before switching
    this.gameFilters[this.currentGame.id] = this.filters;
    if (this.historicalData && this.historicalData.length > 0) {
      this.gameHistoricalData[this.currentGame.id] = [...this.historicalData];
      this.gameDataTypes[this.currentGame.id] = this.dataType;
    }

    this.currentGame = GAMES[gameId];
    this.nashScoreDistributionCache = null;
    
    // Load filters for the new game
    this.filters = this.normalizeFilters(this.gameFilters[gameId], gameId);

    // Clear ALL states when switching games as they are game-specific
    this.clearSelections(true); 
    this.historicalData = [];
    this.allHistoricalData = [];
    this.dataLoaded = false;
    
    // Update sidebar active state
    document.querySelectorAll('.sidebar-links li').forEach(li => {
      li.classList.remove('active');
    });
    const activeLi = document.getElementById(`game-${gameId}`);
    if (activeLi) activeLi.classList.add('active');

    // Update Header Title
    this.updateHeaderTitle();

    // Re-render filter options for the new game
    this.renderFilterOptions();
    this.updateUIFromFilterState(); // Ensure UI reflects the loaded filters for this game
    this.updateGameSpecificUI();
    this.populateCalculatorSelects();
    this.updateCalculatorStarsWrapper();
    this.updateCalculatorJackpotValue();
    this.populateReducedSystemSelect();

    // Re-create grid and reset stats for the new game
    this.createNumbersGrid();
    await this.initializeHistoricalData(); // Auto-loads real data or restores simulated data
    this.analyzeNumbers();
    this.updateGridNumberStates();
    this.updateDataAnalysis();
    this.updateFilterBadgesFromAudit();
    this.populateReducedSystems();
    this.closeSidebar();
    this.showMainApp();
    
    // Save state to persist game choice
    this.saveState();
    
    this.showToast(t('toast.cambiadoA', { game: this.currentGame.name }), 'success');
  }

  updateGameSpecificUI() {
    this.renderFilterOptions();
    const gameId = this.currentGame.id;

    // Toggle custom filters panels
    const standardFiltersContainer = document.getElementById('standardFiltersContainer');
    const nacionalFiltersContainer = document.getElementById('nacionalFiltersContainer');
    if (standardFiltersContainer && nacionalFiltersContainer) {
        if (gameId === 'nacional') {
            standardFiltersContainer.style.display = 'none';
            nacionalFiltersContainer.style.display = 'grid';
        } else {
            standardFiltersContainer.style.display = 'grid';
            nacionalFiltersContainer.style.display = 'none';
        }
    }
    
    // 1. Hide/show Múltiple and Reducida strategy buttons
    const multipleBtn = document.querySelector('.strategy-btn[data-strategy="multiple"]') as HTMLElement;
    const reducedBtn = document.querySelector('.strategy-btn[data-strategy="reducida"]') as HTMLElement;
    const activeStratBtn = document.querySelector('.strategy-buttons .strategy-btn.active') as HTMLElement;
    
    if (multipleBtn) {
        if (gameId === 'nacional') {
            multipleBtn.style.display = 'none';
        } else {
            multipleBtn.style.display = '';
        }
    }
    
    if (reducedBtn) {
        if (gameId === 'nacional') {
            reducedBtn.style.display = 'none';
        } else {
            reducedBtn.style.display = '';
        }
    }

    if (gameId === 'nacional' && activeStratBtn) {
        const activeStrategy = activeStratBtn.dataset.strategy;
        if (activeStrategy === 'multiple' || activeStrategy === 'reducida') {
            this.updateStrategyUI('simple');
        }
    }
    
    // 2. Hide/show Lotería Nacional draws selection container
    const nacionalContainer = document.getElementById('nacionalDrawFilterContainer');
    const filterSelect = document.getElementById('nacionalDrawFilterSelect') as HTMLSelectElement;
    if (nacionalContainer) {
        if (gameId === 'nacional') {
            nacionalContainer.style.display = 'flex';
            if (filterSelect) {
                filterSelect.value = this.nacionalDrawFilter || 'all';
            }
        } else {
            nacionalContainer.style.display = 'none';
        }
    }



    // 3. Hide/show terminaciones-related filters for Lotería Nacional
    const excluirTerminacionesGroup = document.getElementById('terminacionesOptions')?.closest('.filter-group') as HTMLElement;
    const variedadTerminacionesGroup = document.getElementById('terminacionesDistintasOptions')?.closest('.filter-group') as HTMLElement;
    const entropiaTerminacionesGroup = document.getElementById('entropyTerminacionesMin')?.closest('.filter-group') as HTMLElement;

    if (excluirTerminacionesGroup) {
        excluirTerminacionesGroup.style.display = gameId === 'nacional' ? 'none' : '';
    }
    if (variedadTerminacionesGroup) {
        variedadTerminacionesGroup.style.display = gameId === 'nacional' ? 'none' : '';
    }
    if (entropiaTerminacionesGroup) {
        entropiaTerminacionesGroup.style.display = gameId === 'nacional' ? 'none' : '';
    }

    const excluirDecenasGroup = document.getElementById('excluirDecenasOptions')?.closest('.filter-group') as HTMLElement;
    if (excluirDecenasGroup) {
        excluirDecenasGroup.style.display = gameId === 'nacional' ? 'none' : '';
    }

    const downloadTxtBtn = document.getElementById('downloadTxtBtn');
    if (downloadTxtBtn) {
        downloadTxtBtn.style.display = gameId === 'nacional' ? 'none' : '';
    }

    this.updateNextDrawDayOptions();
    this.updateTicketDrawDateBadge();
    this.initFilterInfoButtons();

    this.updateCalculatorJackpotValue();
    this.updateCalculatorStarsWrapper();
    this.updateCalculatorResults();
  }

  getGameAllowedDaysText(): string {
    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
    const dayNames: { [key: number]: string } = {
      1: t('common.dias.lunes'),
      2: t('common.dias.martes'),
      3: t('common.dias.miercoles'),
      4: t('common.dias.jueves'),
      5: t('common.dias.viernes'),
      6: t('common.dias.sabado'),
      0: t('common.dias.domingo')
    };

    if (allowedDays.length === 7) {
      return t('ticket.todosLosDias');
    }

    const names = allowedDays.map(d => dayNames[d]);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} ${t('common.conjuncionY')} ${names[1]}`;
    return names.slice(0, -1).join(', ') + ` ${t('common.conjuncionY')} ` + names[names.length - 1];
  }

  getNextValidDrawDateStr(startDate: Date = new Date()): string {
    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
    const date = new Date(startDate);
    for (let i = 0; i < 14; i++) {
      if (allowedDays.includes(date.getDay())) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      date.setDate(date.getDate() + 1);
    }
    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  validateAndWarnTicketDate(dateStr: string) {
    const warningDiv = document.getElementById('ticketDateWarning');
    const warningText = document.getElementById('ticketDateWarningText');
    if (!dateStr) {
      if (warningDiv) warningDiv.style.display = 'none';
      return;
    }

    const selectedDate = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = selectedDate.getDay();
    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];

    if (!allowedDays.includes(dayOfWeek)) {
      const DAY_NAMES = [t('common.dias.domingo'), t('common.dias.lunes'), t('common.dias.martes'), t('common.dias.miercoles'), t('common.dias.jueves'), t('common.dias.viernes'), t('common.dias.sabado')];
      const dayName = DAY_NAMES[dayOfWeek];
      const nextValidStr = this.getNextValidDrawDateStr(selectedDate);
      const nextValidObj = new Date(nextValidStr + 'T00:00:00');
      const nextValidFormatted = nextValidObj.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      if (warningText) {
        warningText.innerHTML = t('ticket.warningNoSeCelebra', { game: this.currentGame.name, day: dayName, days: this.getGameAllowedDaysText(), nextDate: nextValidFormatted });
      }
      if (warningDiv) warningDiv.style.display = 'flex';
    } else {
      if (warningDiv) warningDiv.style.display = 'none';
    }
  }

  updateTicketDrawDateBadge() {
    const badge = document.getElementById('ticketDrawDaysBadge');
    if (badge) {
      badge.textContent = t('ticket.badgeSorteos', { days: this.getGameAllowedDaysText() });
    }
    const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
    if (input && !input.value) {
      input.value = this.getNextValidDrawDateStr(new Date());
    }
    if (input && input.value) {
      this.validateAndWarnTicketDate(input.value);
    }
  }

  openDrawDateCalendar() {
    const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
    if (input && input.value) {
      const selectedDate = new Date(input.value + 'T00:00:00');
      if (!isNaN(selectedDate.getTime())) {
        this.drawCalYear = selectedDate.getFullYear();
        this.drawCalMonth = selectedDate.getMonth();
      }
    } else {
      const now = new Date();
      this.drawCalYear = now.getFullYear();
      this.drawCalMonth = now.getMonth();
    }

    this.renderDrawDateCalendarGrid();
    this.toggleModal('drawDateCalendarModal', true);
  }

  renderDrawDateCalendarGrid() {
    const title = document.getElementById('drawCalendarModalTitle');
    if (title) {
      title.innerHTML = t('calendar.tituloConJuego', { game: this.currentGame.name });
    }

    const monthLabel = document.getElementById('drawCalMonthLabel');
    const MONTH_NAMES = [t('common.meses.enero'), t('common.meses.febrero'), t('common.meses.marzo'), t('common.meses.abril'), t('common.meses.mayo'), t('common.meses.junio'), t('common.meses.julio'), t('common.meses.agosto'), t('common.meses.septiembre'), t('common.meses.octubre'), t('common.meses.noviembre'), t('common.meses.diciembre')];
    if (monthLabel) {
      monthLabel.textContent = `${MONTH_NAMES[this.drawCalMonth]} ${this.drawCalYear}`;
    }

    const grid = document.getElementById('drawCalendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
    const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
    const currentSelectedDateStr = input ? input.value : '';

    const firstDayOfMonth = new Date(this.drawCalYear, this.drawCalMonth, 1);
    const lastDayOfMonth = new Date(this.drawCalYear, this.drawCalMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // Adjust first day for Monday start (0=Mon, 1=Tue, ..., 6=Sun)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.visibility = 'hidden';
      grid.appendChild(emptyDiv);
    }

    const nowObj = new Date();
    const todayStr = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(this.drawCalYear, this.drawCalMonth, d);
      const dayOfWeek = dateObj.getDay();
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const isAllowed = allowedDays.includes(dayOfWeek);
      const isSelected = dateStr === currentSelectedDateStr;
      const isToday = dateStr === todayStr;

      const dayCell = document.createElement('div');
      dayCell.style.padding = '8px 4px';
      dayCell.style.borderRadius = '8px';
      dayCell.style.display = 'flex';
      dayCell.style.flexDirection = 'column';
      dayCell.style.alignItems = 'center';
      dayCell.style.justifyContent = 'center';
      dayCell.style.minHeight = '52px';
      dayCell.style.position = 'relative';
      dayCell.style.transition = 'all 0.18s ease';
      dayCell.style.userSelect = 'none';

      if (isAllowed) {
        if (isSelected) {
          dayCell.style.background = '#2563eb';
          dayCell.style.color = '#ffffff';
          dayCell.style.border = '2px solid #1d4ed8';
          dayCell.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.35)';
        } else {
          dayCell.style.background = '#ecfdf5';
          dayCell.style.color = '#065f46';
          dayCell.style.border = '2px solid #059669';
        }
        dayCell.style.cursor = 'pointer';
        dayCell.style.fontWeight = '700';

        let starIcon = '⭐';
        if (this.currentGame.id === 'powerball') starIcon = '🔴';
        else if (this.currentGame.id === 'eurodreams') starIcon = '🌙';
        else if (this.currentGame.id === 'gordo') starIcon = '🔑';

        dayCell.innerHTML = `
          <span style="font-size: 0.95rem; font-weight: 800;">${d}</span>
          <span style="font-size: 0.65rem; margin-top: 2px; ${isSelected ? 'color: #fef08a;' : 'color: #047857;'} font-weight: 700;">${starIcon} ${t('calendar.sorteoBadge')}</span>
        `;

        dayCell.addEventListener('click', () => {
          if (input) {
            input.value = dateStr;
            this.validateAndWarnTicketDate(dateStr);
          }
          this.toggleModal('drawDateCalendarModal', false);
          const dateFormatted = dateObj.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          this.showToast(t('calendar.fechaFijada', { date: dateFormatted }), 'success');
        });

        dayCell.addEventListener('mouseenter', () => {
          if (!isSelected) {
            dayCell.style.background = '#10b981';
            dayCell.style.color = '#ffffff';
            dayCell.style.transform = 'scale(1.06)';
          }
        });
        dayCell.addEventListener('mouseleave', () => {
          if (!isSelected) {
            dayCell.style.background = '#ecfdf5';
            dayCell.style.color = '#065f46';
            dayCell.style.transform = 'scale(1)';
          }
        });
      } else {
        dayCell.style.background = '#f1f5f9';
        dayCell.style.color = '#94a3b8';
        dayCell.style.border = '1px dashed #cbd5e1';
        dayCell.style.opacity = '0.4';
        dayCell.style.cursor = 'not-allowed';

        dayCell.innerHTML = `
          <span style="font-size: 0.9rem; text-decoration: line-through;">${d}</span>
          <span style="font-size: 0.6rem; color: #94a3b8; margin-top: 2px;">${t('calendar.sinSorteoCelda')}</span>
        `;

        dayCell.addEventListener('click', () => {
          const DAY_NAMES = [t('common.dias.domingo'), t('common.dias.lunes'), t('common.dias.martes'), t('common.dias.miercoles'), t('common.dias.jueves'), t('common.dias.viernes'), t('common.dias.sabado')];
          this.showToast(t('calendar.noHaySorteoDia', { game: this.currentGame.name, day: DAY_NAMES[dayOfWeek] }), 'warning');
        });
      }

      if (isToday) {
        const todayBadge = document.createElement('span');
        todayBadge.style.position = 'absolute';
        todayBadge.style.top = '3px';
        todayBadge.style.right = '3px';
        todayBadge.style.width = '6px';
        todayBadge.style.height = '6px';
        todayBadge.style.borderRadius = '50%';
        todayBadge.style.background = isSelected ? '#facc15' : '#3b82f6';
        dayCell.appendChild(todayBadge);
      }

      grid.appendChild(dayCell);
    }

    const selectedInfo = document.getElementById('drawCalSelectedInfo');
    if (selectedInfo) {
      if (currentSelectedDateStr) {
        const selObj = new Date(currentSelectedDateStr + 'T00:00:00');
        selectedInfo.textContent = t('calendar.fechaSeleccionada', { date: selObj.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES') });
      } else {
        selectedInfo.textContent = '';
      }
    }
  }

  updateNextDrawDayOptions() {
    const daySelector = document.getElementById('nextDrawDay') as HTMLSelectElement;
    if (!daySelector) return;

    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
    const dayNames: { [key: number]: string } = {
      1: t('common.dias.lunes'),
      2: t('common.dias.martes'),
      3: t('common.dias.miercoles'),
      4: t('common.dias.jueves'),
      5: t('common.dias.viernes'),
      6: t('common.dias.sabado'),
      0: t('common.dias.domingo')
    };

    const daysOrder = [1, 2, 3, 4, 5, 6, 0];
    const currentValue = parseInt(daySelector.value);

    daySelector.innerHTML = '';
    let validSelected = false;

    daysOrder.forEach(dayNum => {
      if (allowedDays.includes(dayNum)) {
        const option = document.createElement('option');
        option.value = String(dayNum);
        option.textContent = t('bigdata.proximoSorteo', { dia: dayNames[dayNum] });
        if (dayNum === currentValue) {
          option.selected = true;
          validSelected = true;
        }
        daySelector.appendChild(option);
      }
    });

    if (!validSelected && daySelector.options.length > 0) {
      daySelector.options[0].selected = true;
    }
  }

  getCommonConsecutivePatterns(maxNumbers: number): string[] {
    return getCommonConsecutivePatternsUtil(maxNumbers);
  }

  renderFilterOptions() {
    this.syncExclusionsWithFilters();
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;
    const numberRange = this.currentGame.numberRange;
    const lims = this.currentGame.getTheoreticalLimits();

    // 1. Update Par/Impar Options
    const parImparOptions = document.getElementById('parImparOptions');
    if (parImparOptions) {
      parImparOptions.innerHTML = '';
      for (let p = maxNumbers; p >= 0; p--) {
        const i = maxNumbers - p;
        const chip = document.createElement('div');
        chip.className = 'filter-chip';
        chip.dataset.value = `${p}/${i}`;
        chip.textContent = `${p}/${i}`;
        parImparOptions.appendChild(chip);
      }
    }

    // 2. Update Bajos/Altos Options
    const bajosAltosOptions = document.getElementById('bajosAltosOptions');
    if (bajosAltosOptions) {
      bajosAltosOptions.innerHTML = '';
      for (let b = maxNumbers; b >= 0; b--) {
        const a = maxNumbers - b;
        const chip = document.createElement('div');
        chip.className = 'filter-chip';
        chip.dataset.value = `${b}/${a}`;
        chip.textContent = `${b}/${a}`;
        bajosAltosOptions.appendChild(chip);
      }
    }

    // 3. Update Variedad de Terminaciones Options
    const terminacionesDistintasOptions = document.getElementById('terminacionesDistintasOptions');
    if (terminacionesDistintasOptions) {
      terminacionesDistintasOptions.innerHTML = '';
      for (let d = 2; d <= maxNumbers; d++) {
        const chip = document.createElement('div');
        chip.className = 'filter-chip';
        chip.dataset.value = String(d);
        chip.textContent = String(d);
        terminacionesDistintasOptions.appendChild(chip);
      }
    }

    // 4. Update Consecutivos Options
    const consecutivosOptions = document.getElementById('consecutivosOptions');
    if (consecutivosOptions) {
        consecutivosOptions.innerHTML = '';
        const patterns = this.getCommonConsecutivePatterns(maxNumbers);
        patterns.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.dataset.value = p;
            chip.textContent = p;
            consecutivosOptions.appendChild(chip);
        });
    }

    // 5. Update AgrupDecenas Options
    const agrupDecenasOptions = document.getElementById('agrupDecenasOptions');
    if (agrupDecenasOptions) {
        agrupDecenasOptions.innerHTML = '';
        const patterns = this.getCommonConsecutivePatterns(maxNumbers);
        patterns.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.dataset.value = p;
            chip.textContent = p;
            agrupDecenasOptions.appendChild(chip);
        });
    }

    // 5b. Update Excluir Decenas Options
    const excluirDecenasOptions = document.getElementById('excluirDecenasOptions');
    if (excluirDecenasOptions) {
        excluirDecenasOptions.innerHTML = '';
        if (this.currentGame.id !== 'nacional') {
            const maxDecade = Math.floor((this.currentGame.numberRange - 1) / 10);
            for (let d = 0; d <= maxDecade; d++) {
                const start = d === 0 ? 1 : d * 10;
                const end = Math.min(d * 10 + 9, this.currentGame.numberRange);
                const label = d === 0 ? "1-9" : `${start}-${end}`;
                
                const chip = document.createElement('div');
                chip.className = 'filter-chip' + (this.excludedDecades.has(d) ? ' active' : '');
                chip.dataset.decade = String(d);
                chip.textContent = label;
                excluirDecenasOptions.appendChild(chip);
            }
        }
    }

    // 6. Update Range Inputs Max/Min for Numbers (Suma Total)
    const sumMin = document.getElementById('sumMin') as HTMLInputElement;
    const sumMax = document.getElementById('sumMax') as HTMLInputElement;
    if (sumMin && sumMax) {
        sumMin.min = String(lims.minSum); sumMin.max = String(lims.maxSum);
        sumMax.min = String(lims.minSum); sumMax.max = String(lims.maxSum);
    }

    // 7. Update Suma de Dígitos Bounds
    const sumaDigitosMin = document.getElementById('sumaDigitosMin') as HTMLInputElement;
    const sumaDigitosMax = document.getElementById('sumaDigitosMax') as HTMLInputElement;
    if (sumaDigitosMin && sumaDigitosMax) {
        sumaDigitosMin.min = String(lims.minDigitSum); sumaDigitosMin.max = String(lims.maxDigitSum);
        sumaDigitosMax.min = String(lims.minDigitSum); sumaDigitosMax.max = String(lims.maxDigitSum);
    }

    // 8. Primos Range Bounds
    const primosMin = document.getElementById('primosMin') as HTMLInputElement;
    const primosMax = document.getElementById('primosMax') as HTMLInputElement;
    if (primosMin && primosMax) {
        primosMin.min = "0"; primosMin.max = String(maxNumbers);
        primosMax.min = "0"; primosMax.max = String(maxNumbers);
        if (parseInt(primosMax.value) > maxNumbers) primosMax.value = String(maxNumbers);
    }

    // 9. Entropía Terminaciones Bounds & Hint
    const entropyTermMin = document.getElementById('entropyTerminacionesMin') as HTMLInputElement;
    const entropyTermMax = document.getElementById('entropyTerminacionesMax') as HTMLInputElement;
    if (entropyTermMin && entropyTermMax) {
        entropyTermMin.min = "0.000"; entropyTermMin.max = String(lims.maxTermEntropy);
        entropyTermMax.min = "0.000"; entropyTermMax.max = String(lims.maxTermEntropy);
        if (parseFloat(entropyTermMax.value) > lims.maxTermEntropy) entropyTermMax.value = String(lims.maxTermEntropy);
    }
    const entropyTermHint = document.getElementById('entropyTerminacionesHint');
    if (entropyTermHint) {
        entropyTermHint.innerHTML = t('filters.entropiaTerm.hint', {max: lims.maxTermEntropy});
    }

    // 10. Entropía Intervalos Bounds & Hint
    const entropyIntMin = document.getElementById('entropyIntervalosMin') as HTMLInputElement;
    const entropyIntMax = document.getElementById('entropyIntervalosMax') as HTMLInputElement;
    if (entropyIntMin && entropyIntMax) {
        entropyIntMin.min = "0.000"; entropyIntMax.max = String(lims.maxIntEntropy);
        entropyIntMax.min = "0.000"; entropyIntMax.max = String(lims.maxIntEntropy);
        if (parseFloat(entropyIntMax.value) > lims.maxIntEntropy) entropyIntMax.value = String(lims.maxIntEntropy);
    }
    const entropyIntHint = document.getElementById('entropyIntervalosHint');
    if (entropyIntHint) {
        entropyIntHint.innerHTML = t('filters.entropiaInt.hint', {max: lims.maxIntEntropy});
    }

    // 11. Desviación Estándar Bounds
    const desMin = document.getElementById('desviacionMin') as HTMLInputElement;
    const desMax = document.getElementById('desviacionMax') as HTMLInputElement;
    if (desMin && desMax) {
        desMin.min = "0.0"; desMin.max = String(lims.maxStdDev);
        desMax.min = "0.0"; desMax.max = String(lims.maxStdDev);
        if (parseFloat(desMax.value) > lims.maxStdDev) desMax.value = String(lims.maxStdDev);
    }

    // 12. Distancia Bounds
    const distMin = document.getElementById('distanciaMin') as HTMLInputElement;
    const distMax = document.getElementById('distanciaMax') as HTMLInputElement;
    if (distMin && distMax) {
        distMin.min = "1"; distMin.max = String(lims.maxDistance);
        distMax.min = "1"; distMax.max = String(lims.maxDistance);
        if (parseInt(distMax.value) > lims.maxDistance) distMax.value = String(lims.maxDistance);
    }

    // 13. Star Filters Section
    const starSection = document.getElementById('starFiltersSection');
    if (starSection) {
        if (maxStars > 1) {
            starSection.style.display = 'block';
            this.renderStarFilterOptions();
        } else {
            starSection.style.display = 'none';
        }
    }

    // 13b. Update Excluir Decenas Estrellas Options
    const excluirDecenasEstrellasOptions = document.getElementById('excluirDecenasEstrellasOptions');
    const excluirDecenasEstrellasGroup = document.getElementById('excluirDecenasEstrellasGroup');
    if (excluirDecenasEstrellasOptions) {
        excluirDecenasEstrellasOptions.innerHTML = '';
        const starDecadesCount = this.currentGame.maxStars > 0 ? Math.floor((this.currentGame.starRange - 1) / 10) + 1 : 0;
        if (this.currentGame.maxStars > 0 && starDecadesCount >= 3) {
            if (excluirDecenasEstrellasGroup) excluirDecenasEstrellasGroup.style.display = '';
            const maxDecade = Math.floor((this.currentGame.starRange - 1) / 10);
            for (let d = 0; d <= maxDecade; d++) {
                const start = d === 0 ? 1 : d * 10;
                const end = Math.min(d * 10 + 9, this.currentGame.starRange);
                const label = d === 0 ? "1-9" : `${start}-${end}`;
                
                const chip = document.createElement('div');
                chip.className = 'filter-chip' + (this.excludedStarDecades.has(d) ? ' active' : '');
                chip.dataset.decade = String(d);
                chip.textContent = label;
                excluirDecenasEstrellasOptions.appendChild(chip);
            }
        } else {
            if (excluirDecenasEstrellasGroup) excluirDecenasEstrellasGroup.style.display = 'none';
        }
    }

    // 14. Multiple Strategy Options
    this.renderMultipleStrategyOptions();

    // 15. Position Range Options (Estadísticos de Orden)
    this.renderPositionRangeFilterOptions();

    // 16. Exclude Historical Matches Options
    this.renderExcludeHistoricalFilterOptions();
  }


  renderMultipleStrategyOptions() {
      const multipleOptions = document.getElementById('multipleNumbersOptions');
      if (!multipleOptions) return;

      const isEuromillones = this.currentGame.id === 'euromillones';
      const isEurodreams = this.currentGame.id === 'eurodreams';
      const isGordo = this.currentGame.id === 'gordo';
      const isPowerball = this.currentGame.id === 'powerball';
      const isMegaMillions = this.currentGame.id === 'megamillions';
      const maxNumbers = this.currentGame.maxNumbers;
      const maxStars = this.currentGame.maxStars;

      const isPrimitiva = this.currentGame.id === 'primitiva';
      const isBonoloto = this.currentGame.id === 'bonoloto';

      let html = '<div class="numbers-select">';
      html += `<label style="font-weight: 600; color: var(--dark); margin-bottom: 8px; display: block;">¿Cuántos números quieres seleccionar? (${this.currentGame.name})</label>`;
      html += '<div class="multiple-options-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">';
      
      let numOptions: number[] = [];
      if (isEurodreams) {
          numOptions = [6, 7, 8, 9, 10];
      } else if (isGordo) {
          numOptions = [6, 7, 8, 9, 10, 11];
      } else if (isEuromillones || isPowerball || isMegaMillions) {
          numOptions = [5, 6, 7, 8, 9, 10];
      } else if (isPrimitiva || isBonoloto) {
          numOptions = [5, 7, 8, 9, 10, 11];
      } else {
          const isMain5 = this.currentGame.maxNumbers === 5;
          numOptions = isMain5 ? [5, 6, 7, 8, 9, 10] : [7, 8, 9, 10, 11];
      }

      const defaultNum = (isPrimitiva || isBonoloto) ? 7 : (isEurodreams ? 7 : (isGordo ? 6 : (this.currentGame.maxNumbers === 5 ? 6 : 7)));
      numOptions.forEach(n => {
          html += `<div class="number-option ${n === defaultNum ? 'active' : ''}" data-numbers="${n}">${n} números</div>`;
      });
      html += '</div>';

      if (this.currentGame.maxStars > 0) {
          const dreamName = isPowerball ? 'Bolas Especiales 🔴' : (isMegaMillions ? 'Mega Ball 🟡' : (isEurodreams ? 'Sueños 🌙' : (isGordo ? 'Clave 🔑' : 'Estrellas ⭐')));
          html += `<label style="margin-top: 20px; display: block; font-weight: 600; color: var(--dark); margin-bottom: 8px;">¿Cuántos/as ${dreamName} quieres seleccionar?</label>`;
          html += '<div class="star-multiple-options-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">';
          
          let starOptions: number[] = [];
          if (isEuromillones) starOptions = [2, 3, 4, 5];
          else if (isEurodreams) starOptions = [1, 2, 3, 4, 5];
          else if (isGordo) starOptions = [1];
          else starOptions = [maxStars, maxStars + 1, maxStars + 2];

          const defaultStar = isEurodreams ? 1 : (isGordo ? 1 : maxStars);
          starOptions.forEach(s => {
              html += `<div class="star-multiple-option ${s === defaultStar ? 'active' : ''}" data-stars="${s}">${s} ${isGordo ? 'Clave 🔑' : dreamName}</div>`;
          });
          html += '</div>';
      }

      html += '<div id="multipleCostSummary" style="margin-top: 15px; padding: 12px; border-radius: 8px; font-size: 0.88rem; text-align: center; font-weight: 600;"></div>';
      
      html += '</div>';
      multipleOptions.innerHTML = html;

      const updateCostBadge = () => {
          const numEl = multipleOptions.querySelector('.number-option.active') as HTMLElement;
          const starEl = multipleOptions.querySelector('.star-multiple-option.active') as HTMLElement;
          const badge = document.getElementById('multipleCostSummary');
          if (!badge) return;

          const n = parseInt(numEl?.dataset.numbers || String(maxNumbers));
          const s = parseInt(starEl?.dataset.stars || String(maxStars));

          if (isEuromillones) {
              const nCombos = this.nCr(n, 5);
              const sCombos = this.nCr(s, 2);
              const totalBets = nCombos * sCombos;
              const cost = totalBets * 2.50;

              if (totalBets > 756) {
                  badge.style.background = '#fef2f2';
                  badge.style.border = '1px solid #fecdd3';
                  badge.style.color = '#9f1239';
                  badge.innerHTML = `⚠️ <strong>${totalBets} apuestas (€${cost.toFixed(2)})</strong> — Excede el límite oficial de 756 apuestas por boleto`;
              } else {
                  badge.style.background = '#fefce8';
                  badge.style.border = '1px solid #fde047';
                  badge.style.color = '#854d0e';
                  badge.innerHTML = `💶 <strong>${totalBets} apuestas</strong> • Coste Oficial: <strong>€${cost.toFixed(2)}</strong> (${n} números + ${s} estrellas)`;
              }
          } else if (isEurodreams) {
              const nCombos = this.nCr(n, 6);
              const totalBets = nCombos * s;
              const cost = totalBets * 2.50;

              if (n > 6 && s > 1) {
                  badge.style.background = '#fef2f2';
                  badge.style.border = '1px solid #fecdd3';
                  badge.style.color = '#9f1239';
                  badge.innerHTML = `⚠️ <strong>Apuesta Incompatible</strong> — EuroDreams permite de 7 a 10 números con 1 Sueño, O BIEN 6 números con 2 a 5 Sueños.`;
              } else {
                  badge.style.background = '#f0f9ff';
                  badge.style.border = '1px solid #bae6fd';
                  badge.style.color = '#0369a1';
                  badge.innerHTML = `🌙 <strong>${totalBets} apuestas</strong> • Coste Oficial: <strong>€${cost.toFixed(2)}</strong> (${n} números + ${s} Sueño${s > 1 ? 's' : ''})`;
              }
          } else if (isGordo) {
              const nCombos = this.nCr(n, 5);
              const totalBets = nCombos * s;
              const cost = totalBets * 1.50;

              badge.style.background = '#faf5ff';
              badge.style.border = '1px solid #e9d5ff';
              badge.style.color = '#6b21a8';
              badge.innerHTML = `🔑 <strong>${totalBets} apuestas</strong> • Coste Oficial: <strong>€${cost.toFixed(2)}</strong> (${n} números + 1 Número Clave)`;
          } else if (isPowerball) {
              const nCombos = this.nCr(n, 5);
              const totalBets = nCombos * s;
              const cost = totalBets * 2.00;
              badge.style.background = '#fff1f2';
              badge.style.border = '1px solid #fecdd3';
              badge.style.color = '#9f1239';
              badge.innerHTML = `🇺🇸 <strong>${totalBets} apuestas</strong> • Coste Total: <strong>$${cost.toFixed(2)} USD</strong> (${n} blancas + ${s} Powerball)`;
          } else if (isMegaMillions) {
              const nCombos = this.nCr(n, 5);
              const totalBets = nCombos * s;
              const cost = totalBets * 2.00;
              badge.style.background = '#fefce8';
              badge.style.border = '1px solid #fde047';
              badge.style.color = '#854d0e';
              badge.innerHTML = `🇺🇸 <strong>${totalBets} apuestas</strong> • Coste Total: <strong>$${cost.toFixed(2)} USD</strong> (${n} blancas + ${s} Mega Ball)`;
          } else if (isPrimitiva) {
              const nCombos = n === 5 ? 44 : this.nCr(n, 6);
              const cost = nCombos * 1.00;
              badge.style.background = '#f0fdf4';
              badge.style.border = '1px solid #bbf7d0';
              badge.style.color = '#166534';
              badge.innerHTML = `🍀 <strong>${nCombos} apuestas</strong> • Coste Oficial: <strong>€${cost.toFixed(2)}</strong> (${n} números seleccionados)`;
          } else if (isBonoloto) {
              const nCombos = n === 5 ? 44 : this.nCr(n, 6);
              const cost = nCombos * 0.50;
              badge.style.background = '#fef2f2';
              badge.style.border = '1px solid #fecdd3';
              badge.style.color = '#9f1239';
              badge.innerHTML = `🔴 <strong>${nCombos} apuestas</strong> • Coste Oficial: <strong>€${cost.toFixed(2)}</strong> (${n} números seleccionados)`;
          } else {
              const nCombos = this.nCr(n, maxNumbers);
              badge.style.background = '#f0fdf4';
              badge.style.border = '1px solid #bbf7d0';
              badge.style.color = '#166534';
              badge.innerHTML = `🎲 <strong>${nCombos} apuestas generadas</strong> (${n} números seleccionados)`;
          }
      };

      // Re-bind events for new options
      multipleOptions.querySelectorAll('.number-option').forEach(opt => {
          opt.addEventListener('click', () => {
              multipleOptions.querySelectorAll('.number-option').forEach(o => o.classList.remove('active'));
              opt.classList.add('active');
              updateCostBadge();
          });
      });

      if (this.currentGame.maxStars > 0) {
          multipleOptions.querySelectorAll('.star-multiple-option').forEach(opt => {
              opt.addEventListener('click', () => {
                  multipleOptions.querySelectorAll('.star-multiple-option').forEach(o => o.classList.remove('active'));
                  opt.classList.add('active');
                  updateCostBadge();
              });
          });
      }

      updateCostBadge();
  }

  renderPositionRangeFilterOptions() {
    this.renderPositionRangeInfoModal();

    // 1. Main Numbers Matrix (Position Range Filter)
    const standardContainer = document.getElementById('standardFiltersContainer');
    let groupEl = document.getElementById('positionRangeFilterGroup');

    if (this.currentGame.id === 'nacional') {
      if (groupEl) groupEl.style.display = 'none';
      const starGroupEl = document.getElementById('starPositionRangeFilterGroup');
      if (starGroupEl) starGroupEl.style.display = 'none';
      return;
    }

    const geometricGroup = document.getElementById('geometricOptions')?.closest('.filter-group');

    if (!groupEl && standardContainer) {
      groupEl = document.createElement('div');
      groupEl.id = 'positionRangeFilterGroup';
      groupEl.className = 'filter-group position-range-filter-group';
      groupEl.setAttribute('data-filter-level', 'expert');
      if (geometricGroup) {
        standardContainer.insertBefore(groupEl, geometricGroup);
      } else {
        standardContainer.appendChild(groupEl);
      }
    } else if (groupEl && standardContainer && geometricGroup) {
      if (groupEl.nextElementSibling !== geometricGroup) {
        standardContainer.insertBefore(groupEl, geometricGroup);
      }
    }

    if (groupEl) {
      groupEl.style.display = 'block';

      const confidenceLevel = this.filters.positionRange?.confidenceLevel || 1.645;
      const isEnabled = !!this.filters.positionRange?.enabled;

      const mainHistorical = (this.historicalData || [])
        .map(d => d.numbers || [])
        .filter(n => n && n.length >= this.currentGame.maxNumbers);

      let ranges = this.filters.positionRange?.ranges;
      if (!ranges || ranges.length !== this.currentGame.maxNumbers) {
        ranges = calculateAllPositionRanges(
          this.currentGame.numberRange,
          this.currentGame.maxNumbers,
          mainHistorical,
          confidenceLevel
        );
      }

      this.filters.positionRange = {
        enabled: isEnabled,
        confidenceLevel,
        ranges
      };

      let html = `
        <div class="filter-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>📍 ${t('filter.positionRange.title')}</span>
            <button type="button" class="position-range-info-btn" id="positionRangeInfoBtn" title="${t('filter.positionRange.infoTitle')}">
              ℹ️
            </button>
          </div>
          <label class="switch-toggle" style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: normal; cursor: pointer;">
            <input type="checkbox" id="positionRangeEnabled" ${isEnabled ? 'checked' : ''} />
            <span>${t('filter.positionRange.enabled')}</span>
          </label>
        </div>

        <div class="position-range-controls" style="margin-top: 10px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; background: rgba(99, 102, 241, 0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.15); flex-wrap: wrap; gap: 8px;">
            <label for="positionRangeConfidence" style="font-size: 0.85rem; font-weight: 600; color: var(--dark);">
              🎯 ${t('filter.positionRange.confidenceLabel')}:
            </label>
            <select id="positionRangeConfidence" style="padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.85rem; background: white; font-weight: 600; cursor: pointer;">
              <option value="1.645" ${confidenceLevel === 1.645 ? 'selected' : ''}>90% (z = 1.645)</option>
              <option value="1.960" ${confidenceLevel === 1.960 ? 'selected' : ''}>95% (z = 1.960)</option>
              <option value="2.576" ${confidenceLevel === 2.576 ? 'selected' : ''}>99% (z = 2.576)</option>
            </select>
          </div>

          <div class="position-ranges-container">
      `;

      ranges.forEach(r => {
        html += `
          <div class="position-range-item">
            <div style="font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 4px;">
              ${t('filter.positionRange.position', { n: r.position })}
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
              <input type="number" id="positionRangeMin_${r.position}" value="${r.min}" readonly style="width: 48px; text-align: center; font-weight: bold; padding: 3px; border-radius: 4px; font-size: 0.85rem;" />
              <span style="font-size: 0.75rem; color: #94a3b8; font-weight: bold;">a</span>
              <input type="number" id="positionRangeMax_${r.position}" value="${r.max}" readonly style="width: 48px; text-align: center; font-weight: bold; padding: 3px; border-radius: 4px; font-size: 0.85rem;" />
            </div>
            ${!r.usedHistorical ? `<div id="positionRangeBadge_${r.position}" data-used-historical="false" style="font-size: 0.65rem; color: #b45309; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; padding: 2px 4px; margin-top: 4px; line-height: 1.1;" title="${t('filter.positionRange.theoreticalOnly')}">
              ⚠️ ${t('filter.positionRange.theoreticalOnly')}
            </div>` : `<div id="positionRangeBadge_${r.position}" data-used-historical="true" style="display:none;"></div>`}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;

      groupEl.innerHTML = html;

      document.getElementById('positionRangeInfoBtn')?.addEventListener('click', () => {
        this.toggleModal('positionRangeInfoModal', true);
      });

      document.getElementById('positionRangeEnabled')?.addEventListener('change', () => {
        this.updateFilterStateFromUI();
        this.updateFilterBadgesFromAudit();
      });

      document.getElementById('positionRangeConfidence')?.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const newZ = parseFloat(select.value);
        if (this.filters.positionRange) {
          this.filters.positionRange.confidenceLevel = newZ;
          delete this.filters.positionRange.ranges;
        }
        this.renderPositionRangeFilterOptions();
        this.updateFilterStateFromUI();
        this.updateFilterBadgesFromAudit();
      });
    }

    // 2. Secondary Matrix (Stars Position Range Filter) - Only if maxStars >= 2
    const starSection = document.getElementById('starFiltersSection');
    let starGroupEl = document.getElementById('starPositionRangeFilterGroup');

    if (this.currentGame.maxStars >= 2) {
      if (!starGroupEl && starSection) {
        starGroupEl = document.createElement('div');
        starGroupEl.id = 'starPositionRangeFilterGroup';
        starGroupEl.className = 'filter-group position-range-filter-group';
        starSection.appendChild(starGroupEl);
      }

      if (starGroupEl) {
        starGroupEl.style.display = 'block';

        const starConfidenceLevel = this.filters.starPositionRange?.confidenceLevel || 1.645;
        const isStarEnabled = !!this.filters.starPositionRange?.enabled;

        const starHistorical = (this.historicalData || [])
          .map(d => d.stars || [])
          .filter(s => s && s.length >= this.currentGame.maxStars);

        let starRanges = this.filters.starPositionRange?.ranges;
        if (!starRanges || starRanges.length !== this.currentGame.maxStars) {
          starRanges = calculateAllPositionRanges(
            this.currentGame.starRange,
            this.currentGame.maxStars,
            starHistorical,
            starConfidenceLevel
          );
        }

        this.filters.starPositionRange = {
          enabled: isStarEnabled,
          confidenceLevel: starConfidenceLevel,
          ranges: starRanges
        };

        let starHtml = `
          <div class="filter-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>📍 ${t('filter.positionRange.starTitle')}</span>
              <button type="button" class="position-range-info-btn" id="starPositionRangeInfoBtn" title="${t('filter.positionRange.infoTitle')}">
                ℹ️
              </button>
            </div>
            <label class="switch-toggle" style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: normal; cursor: pointer;">
              <input type="checkbox" id="starPositionRangeEnabled" ${isStarEnabled ? 'checked' : ''} />
              <span>${t('filter.positionRange.enabled')}</span>
            </label>
          </div>

          <div class="position-range-controls" style="margin-top: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; background: rgba(251, 191, 36, 0.08); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.25); flex-wrap: wrap; gap: 8px;">
              <label for="starPositionRangeConfidence" style="font-size: 0.85rem; font-weight: 600; color: var(--dark);">
                🎯 ${t('filter.positionRange.confidenceLabel')}:
              </label>
              <select id="starPositionRangeConfidence" style="padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.85rem; background: white; font-weight: 600; cursor: pointer;">
                <option value="1.645" ${starConfidenceLevel === 1.645 ? 'selected' : ''}>90% (z = 1.645)</option>
                <option value="1.960" ${starConfidenceLevel === 1.960 ? 'selected' : ''}>95% (z = 1.960)</option>
                <option value="2.576" ${starConfidenceLevel === 2.576 ? 'selected' : ''}>99% (z = 2.576)</option>
              </select>
            </div>

            <div class="position-ranges-container">
        `;

        starRanges.forEach(r => {
          starHtml += `
            <div class="position-range-item">
              <div style="font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 4px;">
                ${t('filter.positionRange.position', { n: r.position })}
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <input type="number" id="starPositionRangeMin_${r.position}" value="${r.min}" readonly style="width: 48px; text-align: center; font-weight: bold; padding: 3px; border-radius: 4px; font-size: 0.85rem;" />
                <span style="font-size: 0.75rem; color: #94a3b8; font-weight: bold;">a</span>
                <input type="number" id="starPositionRangeMax_${r.position}" value="${r.max}" readonly style="width: 48px; text-align: center; font-weight: bold; padding: 3px; border-radius: 4px; font-size: 0.85rem;" />
              </div>
              ${!r.usedHistorical ? `<div id="starPositionRangeBadge_${r.position}" data-used-historical="false" style="font-size: 0.65rem; color: #b45309; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; padding: 2px 4px; margin-top: 4px; line-height: 1.1;" title="${t('filter.positionRange.theoreticalOnly')}">
                ⚠️ ${t('filter.positionRange.theoreticalOnly')}
              </div>` : `<div id="starPositionRangeBadge_${r.position}" data-used-historical="true" style="display:none;"></div>`}
            </div>
          `;
        });

        starHtml += `
            </div>
          </div>
        `;

        starGroupEl.innerHTML = starHtml;

        document.getElementById('starPositionRangeInfoBtn')?.addEventListener('click', () => {
          this.toggleModal('positionRangeInfoModal', true);
        });

        document.getElementById('starPositionRangeEnabled')?.addEventListener('change', () => {
          this.updateFilterStateFromUI();
          this.updateFilterBadgesFromAudit();
        });

        document.getElementById('starPositionRangeConfidence')?.addEventListener('change', (e) => {
          const select = e.target as HTMLSelectElement;
          const newZ = parseFloat(select.value);
          if (this.filters.starPositionRange) {
            this.filters.starPositionRange.confidenceLevel = newZ;
            delete this.filters.starPositionRange.ranges;
          }
          this.renderPositionRangeFilterOptions();
          this.updateFilterStateFromUI();
          this.updateFilterBadgesFromAudit();
        });
      }
    } else {
      if (starGroupEl) starGroupEl.style.display = 'none';
    }
  }

  renderPositionRangeInfoModal() {
    let modal = document.getElementById('positionRangeInfoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'positionRangeInfoModal';
      modal.className = 'modal';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 520px; padding: 24px; border-radius: 16px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
          <h3 style="margin: 0; font-size: 1.2rem; color: var(--dark); font-weight: 700;">
            📊 ${t('filter.positionRange.infoTitle')}
          </h3>
          <button type="button" id="closePositionRangeInfoModalBtn" class="close-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</button>
        </div>
        <div class="modal-body" style="font-size: 0.92rem; line-height: 1.6; color: #334155;">
          <p style="margin-bottom: 14px;">${t('filter.positionRange.infoBody')}</p>
          <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border-left: 4px solid #6366f1; font-size: 0.84rem; line-height: 1.5; color: #1e293b; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-weight: 700; margin-bottom: 6px; color: #4338ca;">📐 ${t('filter.positionRange.formulaBoxTitle')}:</div>
            <div style="margin-top: 4px; font-family: monospace;">• <b>${t('filter.positionRange.formulaMeanLabel')}:</b> E[X_k] = k · (N + 1) / (n + 1)</div>
            <div style="margin-top: 4px; font-family: monospace;">• <b>${t('filter.positionRange.formulaVarianceLabel')}:</b> Var(X_k) = k · (n - k + 1) · (N + 1) · (N - n) / [(n + 1)² · (n + 2)]</div>
            <div style="margin-top: 6px;">• <b>${t('filter.positionRange.formulaCombinationLabel')}:</b> ${t('filter.positionRange.formulaCombinationText')}</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('closePositionRangeInfoModalBtn')?.addEventListener('click', () => {
      this.toggleModal('positionRangeInfoModal', false);
    });

    modal.onclick = (e) => {
      if (e.target === modal) {
        this.toggleModal('positionRangeInfoModal', false);
      }
    };
  }

  renderExcludeHistoricalFilterOptions() {
    const standardContainer = document.getElementById('standardFiltersContainer');
    let groupEl = document.getElementById('excludeHistoricalFilterGroup');

    if (this.currentGame.id === 'nacional') {
      if (groupEl) groupEl.style.display = 'none';
      return;
    }

    const geometricGroup = document.getElementById('geometricOptions')?.closest('.filter-group');

    if (!groupEl && standardContainer) {
      groupEl = document.createElement('div');
      groupEl.id = 'excludeHistoricalFilterGroup';
      groupEl.className = 'filter-group exclude-historical-filter-group';
      groupEl.setAttribute('data-filter-level', 'expert');
      if (geometricGroup) {
        standardContainer.insertBefore(groupEl, geometricGroup);
      } else {
        standardContainer.appendChild(groupEl);
      }
    } else if (groupEl && standardContainer && geometricGroup) {
      if (groupEl.nextElementSibling !== geometricGroup) {
        standardContainer.insertBefore(groupEl, geometricGroup);
      }
    }

    if (groupEl) {
      groupEl.style.display = 'block';

      const maxNumbers = this.currentGame.maxNumbers;
      const isFullChecked = !!this.filters.excludeHistoricalMatchFull;
      const isNearFullChecked = !!this.filters.excludeHistoricalMatchNearFull;

      const labelFull = t('filter.excludeHistoricalMatches.labelFull', { n: maxNumbers });
      const labelNearFull = t('filter.excludeHistoricalMatches.labelNearFull', { n: maxNumbers, 'n-1': maxNumbers - 1 });

      groupEl.innerHTML = `
        <div class="filter-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>📜 ${t('filter.excludeHistoricalMatches.titulo')}</span>
            <button type="button" class="position-range-info-btn filter-info-btn" id="excludeHistoricalInfoBtn" title="${t('filter.excludeHistoricalMatches.infoTitulo')}">
              ℹ️
            </button>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
          <label class="switch-toggle" style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: normal; cursor: pointer;">
            <input type="checkbox" id="excludeHistoricalMatchFull" ${isFullChecked ? 'checked' : ''} />
            <span>${labelFull}</span>
          </label>
          <label class="switch-toggle" style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: normal; cursor: pointer;">
            <input type="checkbox" id="excludeHistoricalMatchNearFull" ${isNearFullChecked ? 'checked' : ''} />
            <span>${labelNearFull}</span>
          </label>
        </div>
      `;

      document.getElementById('excludeHistoricalInfoBtn')?.addEventListener('click', () => {
        this.renderExpandedFilterModal('excludeHistoricalMatches');
      });

      document.getElementById('excludeHistoricalMatchFull')?.addEventListener('change', () => {
        this.updateFilterStateFromUI();
        this.updateFilterBadgesFromAudit();
      });

      document.getElementById('excludeHistoricalMatchNearFull')?.addEventListener('change', () => {
        this.updateFilterStateFromUI();
        this.updateFilterBadgesFromAudit();
      });
    }
  }


  renderStarFilterOptions() {
    const maxStars = this.currentGame.maxStars;
    const starRange = this.currentGame.starRange;

    // Par/Impar Estrellas
    const starParImparOptions = document.getElementById('starParImparOptions');
    if (starParImparOptions) {
        starParImparOptions.innerHTML = '';
        for (let p = maxStars; p >= 0; p--) {
            const i = maxStars - p;
            const chip = document.createElement('div');
            chip.className = 'filter-chip active';
            chip.dataset.value = `${p}/${i}`;
            chip.textContent = `${p}/${i}`;
            starParImparOptions.appendChild(chip);
        }
    }

    // Bajos/Altos Estrellas
    const starBajosAltosOptions = document.getElementById('starBajosAltosOptions');
    if (starBajosAltosOptions) {
        starBajosAltosOptions.innerHTML = '';
        for (let b = maxStars; b >= 0; b--) {
            const a = maxStars - b;
            const chip = document.createElement('div');
            chip.className = 'filter-chip active';
            chip.dataset.value = `${b}/${a}`;
            chip.textContent = `${b}/${a}`;
            starBajosAltosOptions.appendChild(chip);
        }
    }

    // Consecutivos Estrellas
    const starConsecutivosOptions = document.getElementById('starConsecutivosOptions');
    if (starConsecutivosOptions) {
        starConsecutivosOptions.innerHTML = '';
        const patterns = this.getCommonConsecutivePatterns(maxStars);
        patterns.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip active';
            chip.dataset.value = p;
            chip.textContent = p;
            starConsecutivosOptions.appendChild(chip);
        });
    }

    // Ranges for Stars
    const starSumMin = document.getElementById('starSumMin') as HTMLInputElement;
    const starSumMax = document.getElementById('starSumMax') as HTMLInputElement;
    if (starSumMin && starSumMax) {
        let min = 0; for(let i=1; i<=maxStars; i++) min += i;
        let max = 0; for(let i=0; i<maxStars; i++) max += (starRange - i);
        starSumMin.min = String(min); starSumMin.max = String(max);
        starSumMax.min = String(min); starSumMax.max = String(max);
        starSumMin.value = String(min);
        starSumMax.value = String(max);
    }

    const starSumaDigitosMin = document.getElementById('starSumaDigitosMin') as HTMLInputElement;
    const starSumaDigitosMax = document.getElementById('starSumaDigitosMax') as HTMLInputElement;
    if (starSumaDigitosMin && starSumaDigitosMax) {
        // Calculate all possible digit sums for numbers in starRange
        const digitSums: number[] = [];
        for (let i = 1; i <= starRange; i++) {
            const sum = i < 10 ? i : (i % 10 + Math.floor(i / 10));
            digitSums.push(sum);
        }
        digitSums.sort((a, b) => a - b);
        
        let min = 0;
        for (let i = 0; i < maxStars; i++) min += digitSums[i];
        
        let max = 0;
        const reverseDigitSums = [...digitSums].sort((a, b) => b - a);
        for (let i = 0; i < maxStars; i++) max += reverseDigitSums[i];

        starSumaDigitosMin.min = String(min); starSumaDigitosMin.max = String(max);
        starSumaDigitosMax.min = String(min); starSumaDigitosMax.max = String(max);
        starSumaDigitosMin.value = String(min);
        starSumaDigitosMax.value = String(max);
    }

    const starPrimosMin = document.getElementById('starPrimosMin') as HTMLInputElement;
    const starPrimosMax = document.getElementById('starPrimosMax') as HTMLInputElement;
    if (starPrimosMin && starPrimosMax) {
        starPrimosMin.max = String(maxStars);
        starPrimosMax.max = String(maxStars);
    }

    const starDistanciaMin = document.getElementById('starDistanciaMin') as HTMLInputElement;
    const starDistanciaMax = document.getElementById('starDistanciaMax') as HTMLInputElement;
    if (starDistanciaMin && starDistanciaMax) {
        starDistanciaMin.max = String(starRange - 1);
        starDistanciaMax.max = String(starRange - 1);
    }
  }

  checkContractAccepted() {
    const accepted = localStorage.getItem('datalotto_contract_accepted');
    const modal = document.getElementById('contractModal');
    if (!accepted && modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      const checkbox = document.getElementById('contractAcceptCheckbox') as HTMLInputElement;
      const acceptBtn = document.getElementById('contractAcceptBtn') as HTMLButtonElement;
      
      const validateForm = () => {
        const isChecked = checkbox ? checkbox.checked : false;
        if (isChecked) {
          acceptBtn.disabled = false;
          acceptBtn.style.background = 'var(--primary, #3b82f6)';
          acceptBtn.style.color = 'white';
          acceptBtn.style.cursor = 'pointer';
        } else {
          acceptBtn.disabled = true;
          acceptBtn.style.background = '#cbd5e1';
          acceptBtn.style.color = '#64748b';
          acceptBtn.style.cursor = 'not-allowed';
        }
      };
      
      checkbox?.addEventListener('change', validateForm);
      
      acceptBtn?.addEventListener('click', () => {
        const isChecked = checkbox ? checkbox.checked : false;
        if (isChecked) {
          const sigId = 'REG-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-4);
          const timestamp = new Date().toLocaleString('es-ES');
          
          const logPayload = {
            sigId: sigId,
            signer: "Usuario Anónimo",
            timestamp: timestamp,
            acceptedTerms: [
              "Esta aplicación es para entretenimiento y análisis estadístico.",
              "Ninguna estrategia a largo plazo vence al azar. Las loterías y apuestas son juegos de probabilidad pura.",
              "El juego compulsivo es una adicción. Juega con responsabilidad."
            ]
          };
          
          localStorage.setItem('datalotto_contract_accepted', 'true');
          localStorage.setItem('datalotto_contract_signature_name', "Usuario Aceptante");
          localStorage.setItem('datalotto_contract_signature_date', timestamp);
          localStorage.setItem('datalotto_contract_signature_id', sigId);
          localStorage.setItem('datalotto_contract_log', JSON.stringify(logPayload));
          
          modal.style.display = 'none';
          document.body.style.overflow = '';
          this.showToast(t('toast.disclaimerAceptado'), 'success');
          
          this.sendTelemetry('CONTRACT_SIGNED', { signer: "Usuario Aceptante", sigId: sigId });
        }
      });
    }
  }

  initFilterInfoButtons() {
    const EXPANDED_FILTERS: { [selector: string]: string } = {
      '#terminacionesOptions': 'terminaciones',
      '#terminacionesDistintasOptions': 'variedadTerm',
      '#entropyTerminacionesMin': 'entropiaTerm',
      '#sumMin': 'sumaTotal',
      '#parImparOptions': 'parImpar',
      '#bajosAltosOptions': 'bajosAltos',
      '#primosMin': 'primos',
      '#consecutivosOptions': 'consecutivos',
      '#entropyIntervalosMin': 'entropiaInt',
      '#distanciaMin': 'distancia',
      '#agrupDecenasOptions': 'agrupDecenas',
      '#excluirDecenasOptions': 'excluirDecenas',
      '#sumaDigitosMin': 'sumaDigitos',
      '#desviacionMin': 'desviacion',
      '#geometricOptions': 'geometricos',
      '#useMarkovSwitch': 'predictivos',
      '#useNashSwitch': 'nash',
      '#useGapPercentilSwitch': 'gapPercentil'
    };

    const filterGroups = document.querySelectorAll('.filter-group, .dashboard-filter-group');
    filterGroups.forEach((group) => {
      const titleEl = group.querySelector('.filter-title, .dashboard-filter-header');
      if (!titleEl) return;

      if (titleEl.querySelector('.filter-info-btn')) return;

      for (const [selector, groupKey] of Object.entries(EXPANDED_FILTERS)) {
        if (group.querySelector(selector)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'filter-info-btn filter-info-btn-expanded';
          btn.dataset.expandedKey = groupKey;
          btn.textContent = 'ℹ️';
          btn.title = t('filterInfo.shared.titleExpanded');
          titleEl.appendChild(btn);
          return;
        }
      }

      let infoText = group.getAttribute('data-info') || group.getAttribute('title') || '';
      const headerText = titleEl.textContent || '';

      if (group.querySelector('#useMarkovSwitch')) {
        infoText = t('filters.predictivos.dataInfo');
        group.setAttribute('data-info', infoText);
      } else if (headerText.includes('Suma Estrellas') || headerText.includes('Suma Soles')) {
        infoText = "Suma total de los números de las estrellas o soles seleccionados en la combinación.";
      } else if (headerText.includes('Par/Impar Estrellas') || headerText.includes('Par/Impar Soles')) {
        infoText = "Distribución y proporción de estrellas o soles pares e impares.";
      } else if (headerText.includes('Bajos/Altos Estrellas') || headerText.includes('Bajos/Altos Soles')) {
        infoText = "Proporción de estrellas o soles bajos y altos según el rango del juego actual.";
      } else if (headerText.includes('Suma Dígitos Estrellas') || headerText.includes('Suma Cifras Estrellas')) {
        infoText = "Suma de los dígitos individuales de todas las estrellas o soles elegidos.";
      } else if (headerText.includes('Primos Estrellas')) {
        infoText = "Cantidad de estrellas o soles que pertenecen al conjunto de números primos.";
      } else if (headerText.includes('Consecutivos Estrellas')) {
        infoText = "Presencia de estrellas o soles consecutivos en la combinación.";
      } else if (headerText.includes('Distancia Estrellas')) {
        infoText = "Diferencia mínima o máxima entre los valores de las estrellas o soles.";
      }

      if (!infoText) {
        infoText = "Filtro estadístico para la optimización y criba de combinaciones.";
      }

      const titleKey = group.getAttribute('data-i18n-title');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-info-btn';
      btn.setAttribute('aria-label', `Información sobre ${headerText.trim()}`);
      btn.title = "Toca para ver explicación del filtro";
      btn.setAttribute('data-info', infoText);
      if (titleKey) {
        btn.setAttribute('data-i18n-info', titleKey);
      }
      btn.textContent = 'ⓘ';

      titleEl.appendChild(btn);
    });
  }

  bindEvents() {
    this.initFilterInfoButtons();

    // Event listener for filter info popovers
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const infoBtn = target.closest<HTMLElement>('.filter-info-btn');
      if (infoBtn) {
        e.preventDefault();
        e.stopPropagation();

        const filterGroup = infoBtn.closest<HTMLElement>('.filter-group, .dashboard-filter-group');
        if (!filterGroup) return;

        if (infoBtn.classList.contains('filter-info-btn-expanded')) {
          const expandedKey = infoBtn.dataset.expandedKey;
          if (expandedKey) {
            this.renderExpandedFilterModal(expandedKey);
          }
          return;
        }

        let popover = filterGroup.querySelector<HTMLElement>('.filter-info-popover');
        const wasActive = popover?.classList.contains('active');

        document.querySelectorAll('.filter-info-popover.active').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.filter-info-btn.active').forEach(b => b.classList.remove('active'));

        if (!wasActive) {
          infoBtn.classList.add('active');
          if (!popover) {
            popover = document.createElement('div');
            popover.className = 'filter-info-popover';

            const titleEl = filterGroup.querySelector('.filter-title, .dashboard-filter-header');
            if (titleEl) {
              titleEl.insertAdjacentElement('afterend', popover);
            } else {
              filterGroup.appendChild(popover);
            }
          }

          const infoKey = filterGroup.getAttribute('data-i18n-info') || infoBtn.getAttribute('data-i18n-info');
          const text = infoKey ? t(infoKey) : (infoBtn.getAttribute('data-info') || filterGroup.getAttribute('data-info') || filterGroup.getAttribute('title') || 'Explicación del filtro.');
          const formattedText = text.split('\n').map(line => `<p style="margin: 0 0 4px 0;">${line}</p>`).join('');

          popover.innerHTML = `
            <button type="button" class="filter-info-popover-close" aria-label="Cerrar">&times;</button>
            <div>${formattedText}</div>
          `;

          popover.querySelector('.filter-info-popover-close')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            popover?.classList.remove('active');
            infoBtn.classList.remove('active');
          });

          popover.classList.add('active');
        }
        return;
      }

      if (!target.closest('.filter-info-popover')) {
        document.querySelectorAll('.filter-info-popover.active').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.filter-info-btn.active').forEach(b => b.classList.remove('active'));
      }
    });

    document.getElementById('savedTicketsGameFilter')?.addEventListener('change', () => {
        this.updateSavedTickets();
    });



    const filterSelect = document.getElementById('nacionalDrawFilterSelect') as HTMLSelectElement;
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value as 'all' | 'navidad' | 'nino';
            this.nacionalDrawFilter = val;
            
            this.applyNacionalFilter();
            this.updateDataAnalysis();
            this.analyzeNumbers();
            this.updateGridNumberStates();
            this.updateBigDataPanel();
            this.saveState();
            
            this.showToast(t('toast.estudiandoAhora', { option: filterSelect.options[filterSelect.selectedIndex].text }), 'info');
        });
    }

    document.getElementById('numbersGrid')?.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('number-ball')) this.handleNumberClick(target);
    });
    
    document.getElementById('starsGrid')?.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('number-ball')) this.handleNumberClick(target);
    });

    document.getElementById('excluirDecenasOptions')?.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.filter-chip');
      if (!chip || chip.dataset.decade === undefined) return;
      e.stopPropagation();
      const decadeIndex = parseInt(chip.dataset.decade, 10);
      this.toggleDecadeExclusion(decadeIndex);
    });

    document.getElementById('excluirDecenasEstrellasOptions')?.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.filter-chip');
      if (!chip || chip.dataset.decade === undefined) return;
      e.stopPropagation();
      const decadeIndex = parseInt(chip.dataset.decade, 10);
      this.toggleStarDecadeExclusion(decadeIndex);
    });

    document.getElementById('terminacionesOptions')?.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.filter-chip');
      if (!chip || chip.dataset.value === undefined) return;
      e.stopPropagation();
      const digit = parseInt(chip.dataset.value, 10);
      this.toggleTerminacionExclusion(digit);
    });

    document.querySelectorAll('[data-action="switch-game"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const gameId = (e.currentTarget as HTMLElement).dataset.game;
        if (gameId) this.switchGame(gameId);
      });
    });
    document.querySelector('.selection-mode-controls')?.addEventListener('click', e => {
        // FIX: Cast e.target to HTMLElement to use closest()
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.selection-mode-btn');
        if (!btn) return;
        const mode = btn.dataset.mode;
        
        // Ensure specific check for mode string to fix bug where button might not activate
        if (mode && ['cold', 'hot', 'excluded', 'figure', 'absent', 'favorites'].includes(mode)) {
            this.updateSelectionMode(mode as 'cold' | 'hot' | 'excluded' | 'figure' | 'absent' | 'favorites');
        } else if (btn.id === 'randomBtn') {
            this.randomSelect();
        } else if (btn.id === 'clearBtn') {
            this.clearSelections(true);
            this.historicalData = [];
            this.dataLoaded = false;
            this.dataType = 'none';
            this.updateDataAnalysis();
            this.analyzeNumbers();
            this.updateGridNumberStates();
            this.updateBigDataPanel();
            this.saveState();
            
            const clearBtn = document.getElementById('clearBtn');
            if (clearBtn) {
              clearBtn.classList.add('shake');
              setTimeout(() => clearBtn.classList.remove('shake'), 500);
            }
            this.showToast(t('toast.datosHistoricosBorrados'), 'info');
        } else if (btn.id === 'dataBtn') {
            document.getElementById('fileInput')?.click();
        } else if (btn.id === 'simulateBtn') {
            this.simulateHistoricalData(500, this.dataType === 'simulated' && this.historicalData.length > 0);
        } else if (btn.id === 'urlBtn') {
            this.loadDataFromUrl();
        }
    });
    document.querySelectorAll('.collapsible-header').forEach(h => h.addEventListener('click', () => {
        // FIX: Cast to HTMLElement to access dataset
        this.toggleCollapse((h as HTMLElement).dataset.target!)
    }));
    document.getElementById('filtersBottomCollapseBtn')?.addEventListener('click', () => {
        this.toggleCollapse('filters');
    });
    document.querySelectorAll('.strategy-buttons .strategy-btn').forEach(btn => btn.addEventListener('click', () => {
        // FIX: Cast to HTMLElement to access dataset
        this.updateStrategyUI((btn as HTMLElement).dataset.strategy!)
    }));
    document.querySelectorAll('.number-option').forEach(opt => opt.addEventListener('click', () => {
      document.querySelectorAll('.number-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    }));
    document.getElementById('generateBtn')?.addEventListener('click', () => this.generateCombinations());
    document.getElementById('saveBtn')?.addEventListener('click', () => this.saveTicket());
    document.getElementById('ticketDrawDate')?.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        this.validateAndWarnTicketDate(input.value);
    });
    document.getElementById('nextValidDrawDateBtn')?.addEventListener('click', () => {
      const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
      if (input) {
        const nextDate = this.getNextValidDrawDateStr(new Date());
        input.value = nextDate;
        this.validateAndWarnTicketDate(nextDate);
        const dateObj = new Date(nextDate + 'T00:00:00');
        const formatted = dateObj.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        this.showToast(t('toast.proximoSorteoFijado', { date: formatted }), 'info');
      }
    });
    document.getElementById('openDrawCalendarBtn')?.addEventListener('click', () => {
      this.openDrawDateCalendar();
    });
    document.getElementById('closeDrawCalendarBtn')?.addEventListener('click', () => {
      this.toggleModal('drawDateCalendarModal', false);
    });
    document.getElementById('closeDrawCalendarFooterBtn')?.addEventListener('click', () => {
      this.toggleModal('drawDateCalendarModal', false);
    });
    document.getElementById('drawCalPrevMonthBtn')?.addEventListener('click', () => {
      this.drawCalMonth--;
      if (this.drawCalMonth < 0) {
        this.drawCalMonth = 11;
        this.drawCalYear--;
      }
      this.renderDrawDateCalendarGrid();
    });
    document.getElementById('drawCalNextMonthBtn')?.addEventListener('click', () => {
      this.drawCalMonth++;
      if (this.drawCalMonth > 11) {
        this.drawCalMonth = 0;
        this.drawCalYear++;
      }
      this.renderDrawDateCalendarGrid();
    });
    document.getElementById('fixTicketDateBtn')?.addEventListener('click', () => {
      const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
      if (input) {
        const baseDate = input.value ? new Date(input.value + 'T00:00:00') : new Date();
        const nextValid = this.getNextValidDrawDateStr(baseDate);
        input.value = nextValid;
        this.validateAndWarnTicketDate(nextValid);
        const dateObj = new Date(nextValid + 'T00:00:00');
        const formatted = dateObj.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        this.showToast(t('toast.fechaCorregida', { date: formatted }), 'success');
      }
    });
    document.getElementById('shareBtn')?.addEventListener('click', () => this.shareTicket());
    document.getElementById('downloadTxtBtn')?.addEventListener('click', () => this.downloadTicketAsTxt());
    document.getElementById('playOnlineBtn')?.addEventListener('click', () => this.playTicketOnline(this.currentTicket!));
    document.getElementById('reducedSystemSelect')?.addEventListener('change', () => {
        this.updateReducedSystemInfo();
    });
    document.getElementById('reducedAiBaseBtn')?.addEventListener('click', () => {
        this.selectAiBase();
    });
    document.getElementById('reducedClearBaseBtn')?.addEventListener('click', () => {
        this.clearSelections(false);
        this.showToast(t('toast.seleccionesBaseBorradas'), 'info');
    });
    document.querySelector('.filters-panel')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'range') {
            const display = document.getElementById(`${target.id}Value`);
            if (display) display.textContent = target.value;
        }
        if (target.id === 'gapPercentilUmbral') {
            if (this.filters) this.filters.gapPercentilUmbral = parseFloat(target.value);
            this.applyGapFilterMemory();
            this.renderGapPercentilChart();
            this.updateGridNumberStates();
        }
        this.updateFilterBadgesFromAudit();
    });
    document.querySelector('.filters-panel')?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'useGapPercentilSwitch') {
            if (this.filters) this.filters.gapPercentilEnabled = target.checked;
            this.applyGapFilterMemory();
            this.renderGapPercentilChart();
            this.updateGridNumberStates();
        }
        if (target.type === 'range') return; // already handled by input event
        this.updateFilterBadgesFromAudit();
    });
    document.querySelector('.filters-panel')?.addEventListener('click', e => {
       const chip = (e.target as HTMLElement).closest<HTMLElement>('.filter-chip');
       if (chip) {
           if (chip.closest('#excluirDecenasOptions, #excluirDecenasEstrellasOptions, #terminacionesOptions')) return;
           chip.classList.toggle('active');
           this.updateFilterBadgesFromAudit();
       }
    });
    document.getElementById('filterModeSimpleBtn')?.addEventListener('click', () => {
        this.setFilterPanelMode('simple');
        this.showToast(t('toast.modoFiltrosSimple'), 'info');
    });
    document.getElementById('filterModeExpertBtn')?.addEventListener('click', () => {
        this.setFilterPanelMode('expert');
        this.showToast(t('toast.modoFiltrosExperto'), 'info');
    });

    document.getElementById('disclaimerBtn')?.addEventListener('click', () => this.toggleModal('disclaimerModal', true));
    document.getElementById('disclaimerCloseBtn')?.addEventListener('click', () => this.toggleModal('disclaimerModal', false));
    
    // Sidebar & Menu Events
    document.getElementById('menuBtn')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('overlay')?.addEventListener('click', () => this.closeSidebar());
    document.querySelectorAll('.sidebar-links a:not(.disabled)').forEach(link => {
        link.addEventListener('click', (e) => {
            const action = (e.currentTarget as HTMLElement).dataset.action;
            if (action === 'home') {
                this.showMainApp();
                this.closeSidebar();
            }
        });
    });

    // Dark Mode Toggle
    document.getElementById('darkModeToggleBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleDarkMode();
    });

    // Language switch button
    document.getElementById('sidebarLanguageBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const nextLocale = getLocale() === 'es' ? 'en' : 'es';
      await setLocale(nextLocale);
      // applyTranslations() (llamado dentro de setLocale) solo actualiza elementos con
      // atributos data-i18n*. Los paneles de filtros construidos dinámicamente via innerHTML
      // (p.ej. Rango Óptimo por Posición y su modal ℹ️) tienen el texto de t() "horneado" en
      // el HTML generado y no se refrescan solos — hay que volver a renderizarlos aquí.
      this.renderFilterOptions();
      this.initFilterInfoButtons();
      this.updateFilterBadgesFromAudit();

      const ticketDiv = document.getElementById('ticket');
      if (ticketDiv && ticketDiv.classList.contains('conflict')) {
        this.displayFilterFailureDiagnostics();
      }
    });

    // Notification Config Modal Events
    document.getElementById('sidebarNotificationsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.openNotificationsModal();
    });
    document.getElementById('notificationsCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('notificationsModal', false);
    });
    document.getElementById('notifCancelBtn')?.addEventListener('click', () => {
        this.toggleModal('notificationsModal', false);
    });
    document.getElementById('notifSaveBtn')?.addEventListener('click', () => {
        this.saveNotificationsFromModal();
    });

    document.getElementById('configUrlsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openConfigUrlsModal();
    });
    document.getElementById('contactBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openContactModal();
    });
    document.getElementById('closeContactBtn')?.addEventListener('click', () => this.toggleModal('contactModal', false));
    document.getElementById('sendContactBtn')?.addEventListener('click', () => this.sendContactForm());
    
    document.getElementById('closeFilterInfoExpandedModalBtn')?.addEventListener('click', () => {
      this.toggleModal('filterInfoExpandedModal', false);
    });

    document.getElementById('closeFilterStatsModalBtn')?.addEventListener('click', () => {
      this.toggleModal('filterStatsModal', false);
    });

    // Nash & Popularity Map Events
    document.getElementById('nashStrictModeSwitch')?.addEventListener('change', (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.filters.nashStrictMode = isChecked;
      const strictSliders = document.getElementById('nashStrictSliders');
      if (strictSliders) {
        strictSliders.style.display = isChecked ? 'block' : 'none';
      }
      if (isChecked) {
        this.renderNashScoreHistogram();
      }
      this.saveState();
    });

    const bindRangeDisplay = (id: string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (!el) return;
      el.addEventListener('input', () => {
        const displayEl = document.getElementById(`${id}Value`);
        if (displayEl) displayEl.textContent = el.value;
        this.updateFilterStateFromUI();
        if (this.filters.nashStrictMode) {
          this.renderNashScoreHistogram();
        }
      });
    };

    bindRangeDisplay('nashMinScore');
    bindRangeDisplay('nashMaxScore');

    document.getElementById('nashViewMapBtn')?.addEventListener('click', () => {
      this.renderPopularityMapModal();
    });

    document.getElementById('popularityMapCloseBtn')?.addEventListener('click', () => {
      this.toggleModal('popularityMapModal', false);
    });

    // Eventos de Registro de Aceptación y Condiciones de Uso
    document.getElementById('viewSignedContractBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        
        const sigDate = localStorage.getItem('datalotto_contract_signature_date') || new Date().toLocaleString(getLocale() === 'en' ? 'en-US' : 'es-ES');
        const sigId = localStorage.getItem('datalotto_contract_signature_id') || 'REG-PRE-ACCEPT';
        const anonId = this.anonymousUserId;
        
        const logContainer = document.getElementById('signedContractLogContent');
        if (logContainer) {
            logContainer.textContent = t('contract.logTemplate', { sigId, sigDate, anonId });
        }
        this.toggleModal('signedContractModal', true);
    });

    document.getElementById('closeSignedContractBtn')?.addEventListener('click', () => {
        this.toggleModal('signedContractModal', false);
    });

    document.getElementById('downloadSignedContractBtn')?.addEventListener('click', () => {
        const logContent = document.getElementById('signedContractLogContent')?.textContent || '';
        const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `registro_aceptacion_datalotto.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
    
    document.getElementById('closeConfigUrlsBtn')?.addEventListener('click', () => this.toggleModal('configUrlsModal', false));
    document.getElementById('saveConfigUrlsBtn')?.addEventListener('click', () => this.saveConfigUrls());

    document.getElementById('cancelSetUrlPromptBtn')?.addEventListener('click', () => this.toggleModal('setUrlPromptModal', false));
    document.getElementById('saveSetUrlPromptBtn')?.addEventListener('click', () => {
        const input = document.getElementById('setUrlPromptInput') as HTMLInputElement;
        const gameKey = (this as any).pendingPlayGameKey;
        if (!input || !gameKey) return;
        
        let val = input.value.trim();
        if (!val) {
            this.showToast(t('toast.enlaceInvalido'), 'warning');
            return;
        }
        
        if (!/^https?:\/\//i.test(val)) {
            val = 'https://' + val;
        }
        
        this.customGameUrls[gameKey] = val;
        this.saveState();
        this.toggleModal('setUrlPromptModal', false);
        this.showToast(t('toast.enlaceConfigurado'), 'success');
        
        // Retry playing online with the new URL!
        this.confirmPlayOnline(gameKey);
    });

    document.getElementById('closeGameSelectionBtn')?.addEventListener('click', () => this.toggleModal('gameSelectionModal', false));
    document.getElementById('closePlayOnlineModalBtn')?.addEventListener('click', () => this.toggleModal('playOnlineModal', false));
    document.querySelectorAll('.play-online-choice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const game = (e.currentTarget as HTMLElement).dataset.game;
            if (game === 'bonoloto' || game === 'primitiva') {
                this.confirmPlayOnline(game);
            }
        });
    });
    document.getElementById('cancelValidationBtn')?.addEventListener('click', () => this.toggleModal('validationModal', false));
    document.getElementById('confirmValidationBtn')?.addEventListener('click', () => this.confirmValidation());
    // FIX: Cast e.target to HTMLInputElement to access files
    document.getElementById('fileInput')?.addEventListener('change', e => (e.target as HTMLInputElement).files!.length > 0 && this.loadRealData((e.target as HTMLInputElement).files!));
    
    // Big Data Events
    document.getElementById('nextDrawDay')?.addEventListener('change', (e) => {
        this.updateBigDataPanel();
    });
    document.querySelectorAll('.bd-strat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = (e.currentTarget as HTMLElement).dataset.type;
            this.applyBigDataStrategy(type!);
        });
    });

    // Filter Presets Events
    document.getElementById('loadFiltersBtn')?.addEventListener('click', () => this.openLoadFilterModal());
    document.getElementById('saveFiltersBtn')?.addEventListener('click', () => this.openSaveFilterModal());
    document.getElementById('restaurarFiltrosBtn')?.addEventListener('click', () => this.restaurarFiltros());
    document.getElementById('closeSaveFilterBtn')?.addEventListener('click', () => this.toggleModal('saveFilterModal', false));
    document.getElementById('confirmSaveFilterBtn')?.addEventListener('click', () => this.confirmSaveFilter());
    document.getElementById('closeLoadFilterBtn')?.addEventListener('click', () => this.toggleModal('loadFilterModal', false));

    document.getElementById('historyOfResultsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.showHistoryOfResults();
    });

    document.getElementById('sidebarOfficialDrawsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.showOfficialDrawsModal();
    });

    document.getElementById('officialDrawsCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('officialDrawsModal', false);
    });

    document.getElementById('officialDrawsConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('officialDrawsModal', false);
    });

    document.getElementById('officialDrawsPrevBtn')?.addEventListener('click', () => {
        if (this.officialDrawsPage > 1) {
            this.officialDrawsPage--;
            this.updateOfficialDrawsTable();
        }
    });

    document.getElementById('officialDrawsNextBtn')?.addEventListener('click', () => {
        this.officialDrawsPage++;
        this.updateOfficialDrawsTable();
    });

    document.getElementById('officialDrawsSearchInput')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.officialDrawsSearchQuery = target.value;
        this.officialDrawsPage = 1;
        this.updateOfficialDrawsTable();
    });

    document.getElementById('officialDrawsSearchClearBtn')?.addEventListener('click', () => {
        const searchInput = document.getElementById('officialDrawsSearchInput') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }
        this.officialDrawsSearchQuery = '';
        this.officialDrawsPage = 1;
        this.updateOfficialDrawsTable();
    });

    document.getElementById('sidebarVizBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.toggleModal('dataVizModal', true);
        this.renderFrequencyChart();
    });

    document.getElementById('sidebarBigDataBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.showBigDataIntelligence();
    });

    document.getElementById('bigdataCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('bigdataModal', false);
    });

    document.getElementById('bigdataConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('bigdataModal', false);
    });

    document.getElementById('dataVizCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('dataVizModal', false);
    });

    document.getElementById('dataVizConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('dataVizModal', false);
    });

    document.getElementById('sidebarBacktestingBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.toggleModal('backtestingModal', true);
        this.updateBacktestUI();
    });

    document.getElementById('backtestingCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('backtestingModal', false);
    });

    document.getElementById('backtestingConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('backtestingModal', false);
    });

    document.getElementById('sidebarSavedTicketsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.toggleModal('savedTicketsModal', true);
        this.updateSavedTickets();
    });

    document.getElementById('savedTicketsCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('savedTicketsModal', false);
    });

    document.getElementById('savedTicketsConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('savedTicketsModal', false);
    });

    document.getElementById('sidebarJackpotsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.toggleModal('jackpotsModal', true);
        this.fetchAndRenderJackpots();
    });

    document.getElementById('jackpotsCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('jackpotsModal', false);
    });

    document.getElementById('jackpotsConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('jackpotsModal', false);
    });

    document.getElementById('sidebarCalculatorBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.updateCalculatorJackpotValue();
        this.updateCalculatorStarsWrapper();
        this.updateCalculatorResults();
        this.toggleModal('calculatorModal', true);
    });

    document.getElementById('calculatorCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('calculatorModal', false);
    });

    document.getElementById('calculatorConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('calculatorModal', false);
    });



    const updateVizModeButtons = (mode: 'heatmap' | 'ranking' | 'trend' | 'chi' | 'gaps' | 'coocurrencia') => {
        if ((mode === 'gaps' || mode === 'coocurrencia') && this.currentGame?.id === 'nacional') {
            mode = 'heatmap';
        }
        this.vizMode = mode;
        ['vizModeHeatmapBtn', 'vizModeRankingBtn', 'vizModeTrendBtn', 'vizModeChiBtn', 'vizModeGapsBtn', 'vizModeCoocurrenciaBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.toggle('active', 
                (id === 'vizModeHeatmapBtn' && mode === 'heatmap') ||
                (id === 'vizModeRankingBtn' && mode === 'ranking') ||
                (id === 'vizModeTrendBtn' && mode === 'trend') ||
                (id === 'vizModeChiBtn' && mode === 'chi') ||
                (id === 'vizModeGapsBtn' && mode === 'gaps') ||
                (id === 'vizModeCoocurrenciaBtn' && mode === 'coocurrencia')
            );
        });
        this.renderFrequencyChart();
    };

    document.getElementById('vizModeHeatmapBtn')?.addEventListener('click', () => updateVizModeButtons('heatmap'));
    document.getElementById('vizModeRankingBtn')?.addEventListener('click', () => updateVizModeButtons('ranking'));
    document.getElementById('vizModeTrendBtn')?.addEventListener('click', () => updateVizModeButtons('trend'));
    document.getElementById('vizModeChiBtn')?.addEventListener('click', () => updateVizModeButtons('chi'));
    document.getElementById('vizModeGapsBtn')?.addEventListener('click', () => updateVizModeButtons('gaps'));
    document.getElementById('vizModeCoocurrenciaBtn')?.addEventListener('click', () => updateVizModeButtons('coocurrencia'));

    document.getElementById('filterInfoExpandedModal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'filterInfoExpandedModal') {
        this.toggleModal('filterInfoExpandedModal', false);
      }
    });

    document.getElementById('filterStatsModal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'filterStatsModal') {
        this.toggleModal('filterStatsModal', false);
      }
    });

    document.querySelectorAll('.filter-stats-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const filterKey = (icon as HTMLElement).dataset.filterStats;
        if (filterKey) this.showFilterStatsModal(filterKey);
      });
    });

    document.getElementById('filterStatsWindowSelect')?.addEventListener('change', () => {
      if (this.currentStatsFilterKey) this.showFilterStatsModal(this.currentStatsFilterKey);
    });

    document.getElementById('vizTargetSelect')?.addEventListener('change', (e) => {
        this.vizTarget = (e.target as HTMLSelectElement).value as 'number' | 'star';
        this.renderFrequencyChart();
    });

    document.getElementById('hrCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('historyOfResultsModal', false);
    });

    document.getElementById('hrCloseBtn2')?.addEventListener('click', () => {
        this.toggleModal('historyOfResultsModal', false);
    });

    document.getElementById('hrGameFilter')?.addEventListener('change', () => {
        this.updateHistoryDashboard();
    });

    document.getElementById('runBacktestBtn')?.addEventListener('click', () => {
        this.runBacktest();
    });

    // ===== MODO PEÑA EVENT LISTENERS =====
    document.getElementById('sidebarPeniaBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        this.openPeniaModal();
    });

    document.getElementById('peniaCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('peniaModal', false);
    });

    document.getElementById('peniaConfirmCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('peniaModal', false);
    });

    document.getElementById('peniaSelector')?.addEventListener('change', (e) => {
        this.activePeniaId = (e.target as HTMLSelectElement).value;
        this.renderActivePeniaDetails();
    });

    document.getElementById('openCreatePeniaModalBtn')?.addEventListener('click', () => {
        this.toggleModal('createPeniaModal', true);
    });

    document.getElementById('createPeniaCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('createPeniaModal', false);
    });

    document.getElementById('createPeniaCancelBtn')?.addEventListener('click', () => {
        this.toggleModal('createPeniaModal', false);
    });

    document.getElementById('confirmCreatePeniaBtn')?.addEventListener('click', () => {
        this.createNewPeniaFromModal();
    });

    document.getElementById('openJoinPeniaModalBtn')?.addEventListener('click', () => {
        this.toggleModal('joinPeniaModal', true);
    });

    document.getElementById('joinPeniaCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('joinPeniaModal', false);
    });

    document.getElementById('joinPeniaCancelBtn')?.addEventListener('click', () => {
        this.toggleModal('joinPeniaModal', false);
    });

    document.getElementById('confirmJoinPeniaBtn')?.addEventListener('click', () => {
        this.joinPeniaWithCode();
    });

    document.getElementById('deleteActivePeniaBtn')?.addEventListener('click', () => {
        this.deleteActivePenia();
    });

    document.getElementById('addCurrentTicketToPeniaBtn')?.addEventListener('click', () => {
        this.addCurrentTicketToActivePenia();
    });

    document.getElementById('addTicketFromSavedToPeniaBtn')?.addEventListener('click', () => {
        this.openAddSavedTicketToPeniaModal();
    });

    document.getElementById('addTicketToPeniaCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('addTicketToPeniaModal', false);
    });

    document.getElementById('addTicketToPeniaCancelBtn')?.addEventListener('click', () => {
        this.toggleModal('addTicketToPeniaModal', false);
    });

    document.getElementById('validatePeniaTicketsBtn')?.addEventListener('click', () => {
        this.validateActivePeniaTickets();
    });

    document.getElementById('addPeniaMemberBtn')?.addEventListener('click', () => {
        this.addMemberToActivePenia();
    });

    document.getElementById('simPeniaAlertBtn')?.addEventListener('click', () => {
        this.generateTestAlertForPenia();
    });

    document.getElementById('copyPeniaUrlBtn')?.addEventListener('click', () => {
        this.copyPeniaInviteUrl();
    });

    document.getElementById('sharePeniaWhatsAppBtn')?.addEventListener('click', () => {
        this.shareWhatsAppPenia();
    });

    document.getElementById('sharePeniaSummaryBtn')?.addEventListener('click', () => {
        this.sharePeniaSummary();
    });

    document.getElementById('peniaSendChatBtn')?.addEventListener('click', () => {
        this.sendPeniaChatMessage();
    });

    document.getElementById('peniaChatMessageInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            this.sendPeniaChatMessage();
        }
    });

    document.getElementById('peniaShareCurrentTicketChatBtn')?.addEventListener('click', () => {
        this.shareCurrentTicketInChat();
    });

    document.getElementById('openChangeAliasModalBtn')?.addEventListener('click', () => {
        this.openChangeAliasModal();
    });

    document.getElementById('changeAliasCloseBtn')?.addEventListener('click', () => {
        this.toggleModal('changeAliasModal', false);
    });

    document.getElementById('changeAliasCancelBtn')?.addEventListener('click', () => {
        this.toggleModal('changeAliasModal', false);
    });

    document.getElementById('confirmChangeAliasBtn')?.addEventListener('click', () => {
        this.saveUserAlias();
    });

    this.initCalculator();
  }

  // ===== MODO SIMPLE / EXPERTO DE FILTROS =====
  initFilterPanelMode() {
    const saved = localStorage.getItem('filterPanelMode');
    if (saved === 'expert' || saved === 'simple') {
      this.filterPanelMode = saved;
    } else {
      this.filterPanelMode = 'simple';
    }
    this.setFilterPanelMode(this.filterPanelMode, false);
  }

  setFilterPanelMode(mode: 'simple' | 'expert', saveToStorage: boolean = true) {
    this.filterPanelMode = mode;
    if (saveToStorage) {
      localStorage.setItem('filterPanelMode', mode);
    }

    const panel = document.querySelector('.filters-panel');
    if (panel) {
      if (mode === 'simple') {
        panel.classList.add('mode-simple');
        panel.classList.remove('mode-expert');
      } else {
        panel.classList.add('mode-expert');
        panel.classList.remove('mode-simple');
      }
    }

    const simpleBtn = document.getElementById('filterModeSimpleBtn');
    const expertBtn = document.getElementById('filterModeExpertBtn');
    const badge = document.getElementById('filterModeBadge');

    if (simpleBtn && expertBtn) {
      if (mode === 'simple') {
        simpleBtn.classList.add('active');
        expertBtn.classList.remove('active');
      } else {
        expertBtn.classList.add('active');
        simpleBtn.classList.remove('active');
      }
    }

    if (badge) {
      badge.textContent = mode === 'simple' ? t('filters.modoSimple') : t('filters.modoExperto');
      (badge as HTMLElement).style.background = mode === 'simple' ? '#e0e7ff' : '#fef3c7';
      (badge as HTMLElement).style.color = mode === 'simple' ? '#3730a3' : '#92400e';
    }
  }

  renderPopularityMapModal() {
    const gridContainer = document.getElementById('popularityMapGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    const totalNumbers = this.currentGame?.numberRange || 49;
    const cols = this.currentGame?.gridCols || 10;
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    for (let n = 1; n <= totalNumbers; n++) {
      const weight = getPopularityWeight(n, totalNumbers);
      const alpha = 0.15 + (weight / 100) * 0.8;
      const bg = `rgba(249, 115, 22, ${alpha.toFixed(2)})`;
      const textColor = weight > 50 ? '#ffffff' : '#1e293b';
      const border = weight > 50 ? '1px solid #ea580c' : '1px solid #fed7aa';

      const cell = document.createElement('div');
      cell.style.cssText = `
        background-color: ${bg};
        color: ${textColor};
        border: ${border};
        border-radius: 8px;
        padding: 6px 2px;
        text-align: center;
        font-weight: bold;
        font-size: 0.85rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 32px;
      `;
      cell.title = `Número ${n}: Peso Popularidad = ${weight}/100`;

      cell.innerHTML = `
        <span>${n}</span>
        <span style="font-size: 0.65rem; opacity: 0.85; font-weight: normal;">${weight}</span>
      `;

      gridContainer.appendChild(cell);
    }

    this.toggleModal('popularityMapModal', true);
  }

  computeNashScoreDistribution(): { gameId: string; binEdges: number[]; counts: number[] } {
    const game = this.currentGame;
    if (this.nashScoreDistributionCache?.gameId === game.id) return this.nashScoreDistributionCache;

    const N = game.numberRange;
    const k = game.maxNumbers;
    const samples = 20000;
    const scores: number[] = [];
    for (let i = 0; i < samples; i++) {
      const pool = Array.from({ length: N }, (_, idx) => idx + 1);
      const combo: number[] = [];
      for (let j = 0; j < k; j++) {
        const idx = Math.floor(Math.random() * pool.length);
        combo.push(pool[idx]);
        pool.splice(idx, 1);
      }
      scores.push(getNashScoreAverage(combo, N));
    }
    scores.sort((a, b) => a - b);

    const binSize = 0.2;
    const minScore = Math.floor(scores[0] / binSize) * binSize;
    const maxScore = Math.ceil(scores[scores.length - 1] / binSize) * binSize;
    const binEdges: number[] = [];
    for (let b = minScore; b <= maxScore; b += binSize) binEdges.push(Number(b.toFixed(2)));

    const counts = new Array(binEdges.length - 1).fill(0);
    scores.forEach(s => {
      let idx = Math.floor((s - minScore) / binSize);
      if (idx >= counts.length) idx = counts.length - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });

    const result = { gameId: game.id, binEdges, counts };
    this.nashScoreDistributionCache = result;
    return result;
  }

  renderNashScoreHistogram() {
    const container = document.getElementById('nashScoreHistogramContainer');
    if (!container || !this.filters.nashStrictMode) return;

    const { binEdges, counts } = this.computeNashScoreDistribution();
    const maxCount = Math.max(...counts);
    const minScore = binEdges[0];
    const maxScore = binEdges[binEdges.length - 1];

    const svgWidth = 800;
    const svgHeight = 260;
    const marginTop = 20;
    const marginBottom = 40;
    const marginLeft = 45;
    const marginRight = 20;
    const chartW = svgWidth - marginLeft - marginRight;
    const chartH = svgHeight - marginTop - marginBottom;

    const scaleX = (score: number) => marginLeft + ((score - minScore) / (maxScore - minScore)) * chartW;
    const barWidth = chartW / counts.length;

    const barsHTML = counts.map((c, i) => {
      const barH = (c / maxCount) * chartH;
      const x = marginLeft + i * barWidth;
      const y = marginTop + chartH - barH;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barWidth - 1).toFixed(1)}" height="${barH.toFixed(1)}" fill="#94a3b8" opacity="0.75" />`;
    }).join('');

    const minLine = this.filters.nashMinScore ?? 0;
    const maxLine = this.filters.nashMaxScore ?? 10;
    const minX = scaleX(Math.max(minScore, minLine));
    const maxX = scaleX(Math.min(maxScore, maxLine));

    const thresholdLinesHTML = `
      <line x1="${minX.toFixed(1)}" y1="${marginTop}" x2="${minX.toFixed(1)}" y2="${marginTop + chartH}" stroke="#dc2626" stroke-width="2" stroke-dasharray="4" />
      <line x1="${maxX.toFixed(1)}" y1="${marginTop}" x2="${maxX.toFixed(1)}" y2="${marginTop + chartH}" stroke="#dc2626" stroke-width="2" stroke-dasharray="4" />
      <rect x="${minX.toFixed(1)}" y="${marginTop}" width="${(maxX - minX).toFixed(1)}" height="${chartH}" fill="#10b981" opacity="0.12" />
    `;

    const axesHTML = `
      <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
      <line x1="${marginLeft}" y1="${marginTop + chartH}" x2="${svgWidth - marginRight}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
    `;

    const xTicksHTML = `
      <text x="${marginLeft}" y="${svgHeight - 16}" font-size="11" fill="#64748b" text-anchor="start">${minScore.toFixed(1)}</text>
      <text x="${(marginLeft + chartW / 2).toFixed(1)}" y="${svgHeight - 16}" font-size="11" fill="#64748b" text-anchor="middle">${((minScore + maxScore) / 2).toFixed(1)}</text>
      <text x="${svgWidth - marginRight}" y="${svgHeight - 16}" font-size="11" fill="#64748b" text-anchor="end">${maxScore.toFixed(1)}</text>
    `;

    // % de combinaciones simuladas dentro del rango [nashMinScore, nashMaxScore]
    const totalSamples = counts.reduce((a, b) => a + b, 0);
    let passCount = 0;
    counts.forEach((c, i) => {
      const binCenter = binEdges[i];
      if (binCenter >= minLine && binCenter <= maxLine) passCount += c;
    });
    const passPct = totalSamples > 0 ? Math.round((passCount / totalSamples) * 100) : 0;

    container.innerHTML = `
      <p style="text-align: center; font-size: 0.8rem; font-weight: 700; color: #334155; margin: 0 0 4px 0;">
        ${t('filters.nash.histogramTitle')}
      </p>
      <div style="width: 100%; overflow-x: auto;">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: auto; max-height: 300px; display: block; background: #ffffff; font-family: system-ui, sans-serif;">
          ${axesHTML}
          ${barsHTML}
          ${thresholdLinesHTML}
          ${xTicksHTML}
          <text x="${(marginLeft + chartW / 2).toFixed(1)}" y="${svgHeight - 2}" font-size="10" fill="#94a3b8" text-anchor="middle">${t('filters.nash.axisX')}</text>
          <text x="12" y="${(marginTop + chartH / 2).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="middle" transform="rotate(-90, 12, ${(marginTop + chartH / 2).toFixed(1)})">${t('filters.nash.axisY')}</text>
        </svg>
      </div>
      <div style="display: flex; justify-content: center; gap: 14px; font-size: 0.72rem; color: #64748b; margin-top: 4px; flex-wrap: wrap;">
        <span>🟩 ${t('filters.nash.legendRange')}</span>
        <span>┃ ${t('filters.nash.legendThreshold')}</span>
        <span>▬ ${t('filters.nash.legendDistribution')}</span>
      </div>
      <p style="text-align: center; font-size: 0.85rem; color: #475569; margin-top: 6px; font-weight: 600;">
        ${t('filters.nash.histogramPassPct', { pct: passPct })}
      </p>
      <p style="text-align: center; font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">
        ${t('filters.nash.histogramMapHint')}
      </p>
    `;
  }

  // ===== FILTROS (Reactivados y completos) =====
  updateFilterStateFromUI() {
      // FIX: Added type safety for DOM element access.
      const getVal = (id: string, isFloat = false): number => {
          const el = document.getElementById(id) as HTMLInputElement;
          if (!el || el.value === undefined || el.value === '') return isFloat ? 0.0 : 0;
          const parsed = isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
          return isNaN(parsed) ? (isFloat ? 0.0 : 0) : parsed;
      };
      const getChecked = (id: string): boolean => (document.getElementById(id) as HTMLInputElement)?.checked || false;
      const getActiveChips = (selector: string): string[] => Array.from(document.querySelectorAll(selector)).map(el => (el as HTMLElement).dataset.value!);

      this.filters.terminaciones = getActiveChips('#terminacionesOptions .filter-chip.active').map(Number);
      this.filters.excluirDecenas = Array.from(this.excludedDecades);
      this.filters.excluirTerminaciones = Array.from(this.excludedTerminaciones);
      this.filters.excluirStarDecades = Array.from(this.excludedStarDecades);
      this.filters.terminacionesDistintas = getActiveChips('#terminacionesDistintasOptions .filter-chip.active').map(Number);
      this.filters.sum = { min: getVal('sumMin'), max: getVal('sumMax') };
      this.filters.parImpar = getActiveChips('#parImparOptions .filter-chip.active');
      this.filters.bajosAltos = getActiveChips('#bajosAltosOptions .filter-chip.active');
      this.filters.primos = { min: getVal('primosMin'), max: getVal('primosMax') };
      this.filters.consecutivos = getActiveChips('#consecutivosOptions .filter-chip.active');
      this.filters.distancia = { min: getVal('distanciaMin'), max: getVal('distanciaMax') };
      this.filters.agrupDecenas = getActiveChips('#agrupDecenasOptions .filter-chip.active');
      this.filters.sumaDigitos = { min: getVal('sumaDigitosMin'), max: getVal('sumaDigitosMax') };
      this.filters.desviacion = { min: getVal('desviacionMin', true), max: getVal('desviacionMax', true) };
      this.filters.entropyTerminaciones = { min: getVal('entropyTerminacionesMin', true), max: getVal('entropyTerminacionesMax', true) };
      this.filters.entropyIntervalos = { min: getVal('entropyIntervalosMin', true), max: getVal('entropyIntervalosMax', true) };
      
      // Star filters
      this.filters.starSum = { min: getVal('starSumMin'), max: getVal('starSumMax') };
      this.filters.starParImpar = getActiveChips('#starParImparOptions .filter-chip.active');
      this.filters.starBajosAltos = getActiveChips('#starBajosAltosOptions .filter-chip.active');
      this.filters.starSumaDigitos = { min: getVal('starSumaDigitosMin'), max: getVal('starSumaDigitosMax') };
      this.filters.starPrimos = { min: getVal('starPrimosMin'), max: getVal('starPrimosMax') };
      this.filters.starConsecutivos = getActiveChips('#starConsecutivosOptions .filter-chip.active');
      this.filters.starDistancia = { min: getVal('starDistanciaMin'), max: getVal('starDistanciaMax') };

      const geometricChips = Array.from(document.querySelectorAll('#geometricOptions .filter-chip.active')) as HTMLElement[];
      this.filters.geometric = {
          exclude: geometricChips.filter(el => el.textContent!.startsWith('🚫')).map(el => el.dataset.value!),
          favor: geometricChips.filter(el => el.textContent!.startsWith('👍')).map(el => el.dataset.value!),
      };
      
      this.filters.useMarkov = getChecked('useMarkovSwitch');
      this.filters.useNash = getChecked('useNashSwitch');
      this.filters.useRegression = getChecked('useRegressionSwitch');
      this.filters.gapPercentilEnabled = getChecked('useGapPercentilSwitch');
      this.filters.gapPercentilUmbral = getVal('gapPercentilUmbral');
      this.filters.nashStrictMode = getChecked('nashStrictModeSwitch');
      this.filters.nashMinScore = getVal('nashMinScore', true);
      this.filters.nashMaxScore = getVal('nashMaxScore', true);
      
      this.filters.ai.markovDepth = getVal('markovDepth');
      this.filters.ai.nashWeight = getVal('nashWeight');
      this.filters.ai.regressionBonus = getVal('regressionBonus');

      if (this.currentGame.id !== 'nacional') {
          this.filters.excludeHistoricalMatchFull = getChecked('excludeHistoricalMatchFull');
          this.filters.excludeHistoricalMatchNearFull = getChecked('excludeHistoricalMatchNearFull');
          const posEnabled = getChecked('positionRangeEnabled');
          const confEl = document.getElementById('positionRangeConfidence') as HTMLSelectElement;
          const confVal = confEl ? parseFloat(confEl.value) : 1.645;
          const ranges: PositionRangeConfig[] = [];
          for (let k = 1; k <= this.currentGame.maxNumbers; k++) {
              const minVal = getVal(`positionRangeMin_${k}`);
              const maxVal = getVal(`positionRangeMax_${k}`);
              const usedHistBadge = document.getElementById(`positionRangeBadge_${k}`);
              const usedHist = usedHistBadge ? usedHistBadge.dataset.usedHistorical === 'true' : false;
              ranges.push({ position: k, min: minVal, max: maxVal, usedHistorical: usedHist });
          }
          this.filters.positionRange = { enabled: posEnabled, confidenceLevel: confVal, ranges };

          if (this.currentGame.maxStars >= 2) {
              const starPosEnabled = getChecked('starPositionRangeEnabled');
              const starConfEl = document.getElementById('starPositionRangeConfidence') as HTMLSelectElement;
              const starConfVal = starConfEl ? parseFloat(starConfEl.value) : 1.645;
              const starRanges: PositionRangeConfig[] = [];
              for (let k = 1; k <= this.currentGame.maxStars; k++) {
                  const minVal = getVal(`starPositionRangeMin_${k}`);
                  const maxVal = getVal(`starPositionRangeMax_${k}`);
                  const starUsedHistBadge = document.getElementById(`starPositionRangeBadge_${k}`);
                  const starUsedHist = starUsedHistBadge ? starUsedHistBadge.dataset.usedHistorical === 'true' : false;
                  starRanges.push({ position: k, min: minVal, max: maxVal, usedHistorical: starUsedHist });
              }
              this.filters.starPositionRange = { enabled: starPosEnabled, confidenceLevel: starConfVal, ranges: starRanges };
          } else {
              delete this.filters.starPositionRange;
          }
      } else {
          delete this.filters.positionRange;
          delete this.filters.starPositionRange;
          delete this.filters.excludeHistoricalMatchFull;
          delete this.filters.excludeHistoricalMatchNearFull;
      }

      if (this.currentGame.id === 'nacional') {

          const getSelectStr = (id: string): string => {
              const el = document.getElementById(id) as HTMLSelectElement;
              return el ? el.value : 'all';
          };
          this.filters.nacionalSumaDigitos = { min: getVal('nacionalSumaDigitosMin'), max: getVal('nacionalSumaDigitosMax') };
          this.filters.nacionalCapicua = getSelectStr('nacionalCapicua');
          this.filters.nacionalPrimo = getSelectStr('nacionalPrimo');
          this.filters.nacionalCuadradoCubo = getSelectStr('nacionalCuadradoCubo');
          this.filters.nacionalRepdigits = getSelectStr('nacionalRepdigits');
          this.filters.nacionalMultiploDe = getVal('nacionalMultiploDe');
          this.filters.nacionalFranja = { min: getVal('nacionalFranjaMin'), max: getVal('nacionalFranjaMax') };
          
          const objEl = document.getElementById('nacionalObjetivo') as HTMLInputElement;
          this.filters.nacionalObjetivo = objEl ? objEl.value.trim() : '00000';
          this.filters.nacionalDistanciaObjetivo = { min: getVal('nacionalDistanciaObjetivoMin'), max: getVal('nacionalDistanciaObjetivoMax') };
          
          this.filters.nacionalParidad = [];
          this.filters.nacionalAltoBajo = [];
          for (let i = 1; i <= 5; i++) {
              this.filters.nacionalParidad.push(getSelectStr(`nacionalParidadD${i}`));
              this.filters.nacionalAltoBajo.push(getSelectStr(`nacionalAltoBajoD${i}`));
          }
          
          this.filters.nacionalConsecutivos = getSelectStr('nacionalConsecutivos');
          this.filters.nacionalSumaMitades = getSelectStr('nacionalSumaMitades');
          
          this.filters.nacionalParesConteo = getActiveChips('#nacionalParesConteoOptions .filter-chip.active');
          this.filters.nacionalAltosConteo = getActiveChips('#nacionalAltosConteoOptions .filter-chip.active');
          
          const unicos = getActiveChips('#nacionalUnicosOptions .filter-chip.active').map(Number);
          this.filters.nacionalUnicos = unicos.length > 0 ? unicos : [1, 2, 3, 4, 5];
          
          this.filters.nacionalModaRepeticiones = { min: getVal('nacionalModaRepeticionesMin'), max: getVal('nacionalModaRepeticionesMax') };
          this.filters.nacionalCeros = getActiveChips('#nacionalCerosOptions .filter-chip.active');
          this.filters.nacionalPrimosDigitos = { min: getVal('nacionalPrimosDigitosMin'), max: getVal('nacionalPrimosDigitosMax') };
          this.filters.nacionalRangoInterno = { min: getVal('nacionalRangoInternoMin'), max: getVal('nacionalRangoInternoMax') };
          this.filters.nacionalDesviacion = { min: getVal('nacionalDesviacionMin', true), max: getVal('nacionalDesviacionMax', true) };
          this.filters.nacionalEntropiaDigitos = { min: getVal('nacionalEntropiaDigitosMin', true), max: getVal('nacionalEntropiaDigitosMax', true) };
      }

      this.saveState();
  }

  // ===== SELECCIÓN DE NÚMEROS (CORREGIDO) =====
  handleNumberClick(ball: HTMLElement) {
    const number = parseInt(ball.dataset.number!);
    const type = (ball.dataset.type || 'number') as 'number' | 'star';
    const icon = ball.querySelector('.number-icon');
    if (!icon) return;
    
    // Check if decade is excluded as a block
    const decadeIndex = Math.floor((number - 1) / 10);
    if (type === 'number' && this.excludedDecades.has(decadeIndex)) {
        this.showToast(t('toast.decenaBloqueada'), 'warning');
        return;
    }
    if (type === 'number' && this.excludedTerminaciones.has(number % 10)) {
        this.showToast(t('toast.decenaBloqueada'), 'warning');
        return;
    }
    if (type === 'star' && this.excludedStarDecades.has(decadeIndex)) {
        this.showToast(t('toast.decenaBloqueada'), 'warning');
        return;
    }
    
    const excludedSet = type === 'number' ? this.excludedNumbers : this.excludedStars;
    const selectedSet = type === 'number' ? this.selectedNumbers : this.selectedStars;
    const favoriteSet = type === 'number' ? this.favoriteNumbers : this.favoriteStars;
    const hotSet = type === 'number' ? this.hotNumbers : this.hotStars;
    const coldSet = type === 'number' ? this.coldNumbers : this.coldStars;
    const absentSet = type === 'number' ? this.absentNumbers : this.absentStars;
    const suggestedSet = type === 'number' ? this.suggestedNumbers : this.suggestedStars;

    if (excludedSet.has(number) && this.currentSelectionMode !== 'excluded') {
        this.showToast(t('toast.numeroExcluido'), 'warning');
        return;
    }

    // Si es una sugerencia, al hacer click la aceptamos
    if (suggestedSet.has(number) && this.currentSelectionMode === null) {
        suggestedSet.delete(number);
        ball.classList.remove('suggested');
        this.addNumber(number, type); // Añadir a seleccionados
        this.updateGridNumberStates(); 
        return;
    }

    switch (this.currentSelectionMode) {
        case 'favorites':
            if (favoriteSet.has(number)) {
                favoriteSet.delete(number);
                ball.classList.remove('favorite');
                icon.textContent = '';
                this.updateGridNumberStates();
            } else {
                if (favoriteSet.size >= 10) {
                    this.showToast(t('toast.maximoFavoritos'), 'warning');
                    return;
                }
                favoriteSet.add(number);
                ball.classList.add('favorite');
                icon.textContent = '⭐';
            }
            this.saveState();
            break;

        case 'excluded':
            if (selectedSet.has(number)) {
                this.showToast(t('toast.noExcluirSeleccionado'), 'warning');
                return;
            }
            excludedSet.has(number) ? excludedSet.delete(number) : excludedSet.add(number);
            this.updateGridNumberStates();
            break;

        case 'hot':
            if (coldSet.has(number)) coldSet.delete(number);
            if (absentSet.has(number)) absentSet.delete(number);
            hotSet.has(number) ? hotSet.delete(number) : hotSet.add(number);
            this.updateGridNumberStates();
            break;

        case 'cold':
            if (hotSet.has(number)) hotSet.delete(number);
            if (absentSet.has(number)) absentSet.delete(number);
            coldSet.has(number) ? coldSet.delete(number) : coldSet.add(number);
            this.updateGridNumberStates();
            break;

        case 'absent':
            if (hotSet.has(number)) hotSet.delete(number);
            if (coldSet.has(number)) coldSet.delete(number);
            absentSet.has(number) ? absentSet.delete(number) : absentSet.add(number);
            this.updateGridNumberStates();
            break;

        case 'figure':
            if (type === 'number') {
              ball.classList.toggle('figure-selection');
            }
            break;

        default:
            if (selectedSet.has(number)) {
                this.removeNumber(number, type);
            } else {
                this.addNumber(number, type);
            }
            break;
    }
  }

  toggleDecadeExclusion(decadeIndex: number) {
    const start = decadeIndex === 0 ? 1 : decadeIndex * 10;
    const end = Math.min(decadeIndex * 10 + 9, this.currentGame.numberRange);
    const numbersInDecade: number[] = [];
    for (let n = start; n <= end; n++) {
      numbersInDecade.push(n);
    }

    if (this.excludedDecades.has(decadeIndex)) {
      // Deactivate
      this.excludedDecades.delete(decadeIndex);
      const snapshot = this.excludedDecadesSnapshot.get(decadeIndex) || [];
      const snapshotSet = new Set(snapshot);
      numbersInDecade.forEach(n => {
        if (!snapshotSet.has(n)) {
          this.excludedNumbers.delete(n);
        }
      });
      this.excludedDecadesSnapshot.delete(decadeIndex);
    } else {
      // Activate
      const snapshot = numbersInDecade.filter(n => this.excludedNumbers.has(n));
      this.excludedDecadesSnapshot.set(decadeIndex, snapshot);
      this.excludedDecades.add(decadeIndex);
      numbersInDecade.forEach(n => {
        this.excludedNumbers.add(n);
        this.selectedNumbers.delete(n);
        this.favoriteNumbers.delete(n);
      });
    }

    this.filters.excluirDecenas = Array.from(this.excludedDecades);

    const chip = document.querySelector(`#excluirDecenasOptions .filter-chip[data-decade="${decadeIndex}"]`);
    if (chip) {
      chip.classList.toggle('active', this.excludedDecades.has(decadeIndex));
    }

    this.updateGridNumberStates();
    this.updateSelectedDisplay();
    this.updateDecadasBadge();
    this.updateFilterBadgesFromAudit();
    this.saveState();
  }

  updateDecadasBadge() {
    const container = document.querySelector('#excluirDecenasOptions')?.closest('.filter-group');
    if (!container) return;

    const titleEl = container.querySelector('.filter-title');
    if (!titleEl) return;

    let badgeEl = titleEl.querySelector('.decadas-exclude-badge') as HTMLElement;

    if (this.excludedDecades.size === 0) {
      if (badgeEl) badgeEl.remove();
      return;
    }

    const startNum = this.currentGame.id === 'nacional' ? 10 : 1;
    const totalRange = this.currentGame.id === 'nacional' 
      ? (this.currentGame.numberRange - 9) 
      : this.currentGame.numberRange;

    let excludedCount = 0;
    this.excludedDecades.forEach(d => {
      const start = d === 0 ? 1 : d * 10;
      const end = Math.min(d * 10 + 9, this.currentGame.numberRange);
      if (end >= startNum) {
        const effectiveStart = Math.max(start, startNum);
        excludedCount += Math.max(0, end - effectiveStart + 1);
      }
    });

    const pct = Math.round((excludedCount / totalRange) * 100);

    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.className = 'decadas-exclude-badge';
      badgeEl.style.cssText = 'margin-left: 8px; font-size: 0.75rem; color: #dc2626; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-weight: 600;';
      titleEl.appendChild(badgeEl);
    }

    badgeEl.textContent = t('filter.excludeBadge', { pct });
  }

  updateStarDecadasBadge() {
    const container = document.querySelector('#excluirDecenasEstrellasOptions')?.closest('.filter-group');
    if (!container) return;

    const titleEl = container.querySelector('.filter-title');
    if (!titleEl) return;

    let badgeEl = titleEl.querySelector('.star-decadas-exclude-badge') as HTMLElement;

    if (this.excludedStarDecades.size === 0 || !this.currentGame.starRange) {
      if (badgeEl) badgeEl.remove();
      return;
    }

    const totalRange = this.currentGame.starRange;
    let excludedCount = 0;
    this.excludedStarDecades.forEach(d => {
      const start = d === 0 ? 1 : d * 10;
      const end = Math.min(d * 10 + 9, totalRange);
      excludedCount += Math.max(0, end - start + 1);
    });

    const pct = Math.round((excludedCount / totalRange) * 100);

    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.className = 'star-decadas-exclude-badge';
      badgeEl.style.cssText = 'margin-left: 8px; font-size: 0.75rem; color: #dc2626; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-weight: 600;';
      titleEl.appendChild(badgeEl);
    }

    badgeEl.textContent = t('filter.excludeBadge', { pct });
  }

  toggleTerminacionExclusion(digit: number) {
    const startNum = this.currentGame.id === 'nacional' ? 10 : 1;
    const numbersWithEnding: number[] = [];
    for (let n = startNum; n <= this.currentGame.numberRange; n++) {
      if (n % 10 === digit) numbersWithEnding.push(n);
    }

    if (this.excludedTerminaciones.has(digit)) {
      // Desactivar: solo quitar de excludedNumbers los que NO estaban excluidos antes de activar este dígito
      this.excludedTerminaciones.delete(digit);
      const snapshot = this.excludedTerminacionesSnapshot.get(digit) || [];
      const snapshotSet = new Set(snapshot);
      numbersWithEnding.forEach(n => {
        if (!snapshotSet.has(n)) this.excludedNumbers.delete(n);
      });
      this.excludedTerminacionesSnapshot.delete(digit);
    } else {
      // Activar: recordar cuáles ya estaban excluidos antes (memoria antes/después)
      const snapshot = numbersWithEnding.filter(n => this.excludedNumbers.has(n));
      this.excludedTerminacionesSnapshot.set(digit, snapshot);
      this.excludedTerminaciones.add(digit);
      numbersWithEnding.forEach(n => {
        this.excludedNumbers.add(n);
        this.selectedNumbers.delete(n);
        this.favoriteNumbers.delete(n);
      });
    }

    const chip = document.querySelector(`#terminacionesOptions .filter-chip[data-value="${digit}"]`);
    if (chip) chip.classList.toggle('active', this.excludedTerminaciones.has(digit));

    this.filters.terminaciones = Array.from(this.excludedTerminaciones);

    this.updateGridNumberStates();
    this.updateSelectedDisplay();
    this.updateTerminacionesBadge();
    this.updateFilterBadgesFromAudit();
    this.saveState();
  }

  updateTerminacionesBadge() {
    const container = document.querySelector('#terminacionesOptions')?.closest('.filter-group');
    if (!container) return;

    const titleEl = container.querySelector('.filter-title');
    if (!titleEl) return;

    let badgeEl = titleEl.querySelector('.terminaciones-exclude-badge') as HTMLElement;

    if (this.excludedTerminaciones.size === 0) {
      if (badgeEl) badgeEl.remove();
      return;
    }

    const startNum = this.currentGame.id === 'nacional' ? 10 : 1;
    const totalRange = this.currentGame.id === 'nacional' 
      ? (this.currentGame.numberRange - 9) 
      : this.currentGame.numberRange;

    let excludedCount = 0;
    for (let n = startNum; n <= this.currentGame.numberRange; n++) {
      if (this.excludedTerminaciones.has(n % 10)) {
        excludedCount++;
      }
    }

    const pct = Math.round((excludedCount / totalRange) * 100);

    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.className = 'terminaciones-exclude-badge';
      badgeEl.style.cssText = 'margin-left: 8px; font-size: 0.75rem; color: #dc2626; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-weight: 600;';
      titleEl.appendChild(badgeEl);
    }

    badgeEl.textContent = t('filter.excludeBadge', { pct });
  }

  toggleStarDecadeExclusion(decadeIndex: number) {
    const start = decadeIndex === 0 ? 1 : decadeIndex * 10;
    const end = Math.min(decadeIndex * 10 + 9, this.currentGame.starRange);
    const numbersInDecade: number[] = [];
    for (let n = start; n <= end; n++) {
      numbersInDecade.push(n);
    }

    if (this.excludedStarDecades.has(decadeIndex)) {
      // Deactivate
      this.excludedStarDecades.delete(decadeIndex);
      const snapshot = this.excludedStarDecadesSnapshot.get(decadeIndex) || [];
      const snapshotSet = new Set(snapshot);
      numbersInDecade.forEach(n => {
        if (!snapshotSet.has(n)) {
          this.excludedStars.delete(n);
        }
      });
      this.excludedStarDecadesSnapshot.delete(decadeIndex);
    } else {
      // Activate
      const snapshot = numbersInDecade.filter(n => this.excludedStars.has(n));
      this.excludedStarDecadesSnapshot.set(decadeIndex, snapshot);
      this.excludedStarDecades.add(decadeIndex);
      numbersInDecade.forEach(n => {
        this.excludedStars.add(n);
        this.selectedStars.delete(n);
        this.favoriteStars.delete(n);
      });
    }

    this.filters.excluirStarDecades = Array.from(this.excludedStarDecades);

    const chip = document.querySelector(`#excluirDecenasEstrellasOptions .filter-chip[data-decade="${decadeIndex}"]`);
    if (chip) {
      chip.classList.toggle('active', this.excludedStarDecades.has(decadeIndex));
    }

    this.updateGridNumberStates();
    this.updateSelectedDisplay();
    this.updateStarDecadasBadge();
    this.updateFilterBadgesFromAudit();
    this.saveState();
  }

  addNumber(number: number, type: 'number' | 'star' = 'number') {
    const strategy = (document.querySelector('.strategy-buttons .strategy-btn.active') as HTMLElement)?.dataset.strategy || 'simple';
    const isMultiple = strategy === 'multiple';
    const isEuromillones = this.currentGame.id === 'euromillones';

    if (type === 'number') {
      if (this.currentGame.id === 'nacional') {
        const targetCol = Math.floor(number / 10);
        let foundExisting: number | null = null;
        this.selectedNumbers.forEach(n => {
          if (Math.floor(n / 10) === targetCol) {
            foundExisting = n;
          }
        });
        if (foundExisting !== null) {
          this.removeNumber(foundExisting, 'number');
        }
      }
      let limit = this.currentGame.maxNumbers;
      if (isMultiple) {
        limit = this.currentGame.maxNumbers === 5 ? 10 : 11;
      } else if (strategy === 'reducida') {
        const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
        const gameId = this.currentGame.id;
        const systems = REDUCED_SYSTEMS[gameId] || [];
        const system = systems.find(s => s.id === select?.value);
        limit = system ? system.baseNumbersCount : 11;
      }
      if (this.selectedNumbers.size < limit) {
        this.selectedNumbers.add(number);
        document.querySelector(`.number-ball[data-number="${number}"][data-type="number"]`)?.classList.add('selected');
      } else {
        this.showToast(t('toast.limiteNumeros', { limit }), 'warning');
      }
    } else {
      const limit = isMultiple ? 5 : this.currentGame.maxStars;
      if (this.selectedStars.size < limit) {
        this.selectedStars.add(number);
        document.querySelector(`.number-ball[data-number="${number}"][data-type="star"]`)?.classList.add('selected');
      } else {
        this.showToast(t('toast.limiteEstrellas', { limit }), 'warning');
      }
    }
    this.updateSelectedDisplay();
    this.updateStats();
    this.updateCorrelationScore();
  }

  removeNumber(number: number, type: 'number' | 'star' = 'number') {
    if (type === 'number') {
      this.selectedNumbers.delete(number);
      document.querySelector(`.number-ball[data-number="${number}"][data-type="number"]`)?.classList.remove('selected');
    } else {
      this.selectedStars.delete(number);
      document.querySelector(`.number-ball[data-number="${number}"][data-type="star"]`)?.classList.remove('selected');
    }
    this.updateSelectedDisplay();
    this.updateStats();
    this.updateCorrelationScore();
  }

  clearSelections(fullClear: boolean) {
    this.selectedNumbers.clear();
    this.selectedStars.clear();
    this.reducedBaseNumbers.clear();
    this.suggestedNumbers.clear();
    this.suggestedStars.clear();
    document.querySelectorAll('.number-ball.figure-selection').forEach(b => b.classList.remove('figure-selection'));
    
    if (fullClear) {
      this.excludedNumbers.clear();
      this.excludedStars.clear();
      this.excludedDecades.clear();
      this.excludedDecadesSnapshot.clear();
      this.excludedStarDecades.clear();
      this.excludedStarDecadesSnapshot.clear();
      this.excludedTerminaciones.clear();
      this.excludedTerminacionesSnapshot.clear();
      this.filters.terminaciones = [];
      this.gapFilterSnapshotAntes = null;
      this.gapFilterExclusionesPropias = new Set();
      document.querySelectorAll('#excluirDecenasOptions .filter-chip, #excluirDecenasEstrellasOptions .filter-chip, #terminacionesOptions .filter-chip').forEach(c => c.classList.remove('active'));
      this.updateTerminacionesBadge();
      this.updateDecadasBadge();
      this.updateStarDecadasBadge();
      this.hotNumbers.clear();
      this.hotStars.clear();
      this.coldNumbers.clear();
      this.coldStars.clear();
      this.absentNumbers.clear();
      this.absentStars.clear();
      this.favoriteNumbers.clear();
      this.favoriteStars.clear();
      
      document.querySelectorAll('.number-ball').forEach(b => {
          b.classList.remove('excluded', 'hot', 'cold', 'absent', 'suggested', 'favorite', 'base-reduced');
          const icon = b.querySelector('.number-icon');
          if (icon) icon.textContent = '';
      });
      this.saveState();
    }
    document.querySelectorAll('.number-ball.selected').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.number-ball.suggested').forEach(b => b.classList.remove('suggested'));
    document.querySelectorAll('.number-ball.base-reduced').forEach(b => b.classList.remove('base-reduced'));
    this.clearGridHighlights();
    this.updateSelectedDisplay();
    this.updateStats();
    this.updateCorrelationScore();
  }
  randomSelect() {
    this.clearSelections(false);
    const availableNumbers = this.getAvailableUniverse('number');
    const availableStars = this.getAvailableUniverse('star');
    
    if (availableNumbers.length < this.currentGame.maxNumbers) {
      this.showToast(t('toast.noSuficientesNumeros', { count: this.currentGame.maxNumbers }), 'warning');
      return;
    }
    if (this.currentGame.maxStars > 0 && availableStars.length < this.currentGame.maxStars) {
        this.showToast(t('toast.noSuficientesEstrellas', { count: this.currentGame.maxStars }), 'warning');
        return;
    }
    
    const randomNumbers: number[] = [];
    while (randomNumbers.length < this.currentGame.maxNumbers) {
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers.splice(randomIndex, 1)[0];
      randomNumbers.push(number);
      const ball = document.querySelector(`.number-ball[data-number="${number}"][data-type="number"]`);
      if (ball) {
        ball.classList.add('random-pick');
        const icon = ball.querySelector('.number-icon');
        if (icon) icon.textContent = '🎲';
      }
    }

    const randomStars: number[] = [];
    if (this.currentGame.maxStars > 0) {
        while (randomStars.length < this.currentGame.maxStars) {
            const randomIndex = Math.floor(Math.random() * availableStars.length);
            const number = availableStars.splice(randomIndex, 1)[0];
            randomStars.push(number);
            const ball = document.querySelector(`.number-ball[data-number="${number}"][data-type="star"]`);
            if (ball) {
                ball.classList.add('random-pick');
                const icon = ball.querySelector('.number-icon');
                if (icon) icon.textContent = '🎲';
            }
        }
    }
    
    this.selectedNumbers = new Set(randomNumbers);
    this.selectedStars = new Set(randomStars);
    this.updateTopDisplayWithCombination(randomNumbers, 'random', randomStars);
    this.updateStats();
    this.updateCorrelationScore();
  }
  getAvailableUniverse(type: 'number' | 'star' = 'number'): number[] {
    // If in figure mode and type is number, the universe is the selected numbers
    if (type === 'number' && this.currentSelectionMode === 'figure' && this.selectedNumbers.size > 0) {
        return Array.from(this.selectedNumbers);
    }

    const range = type === 'number' ? this.currentGame.numberRange : this.currentGame.starRange;
    const excluded = type === 'number' ? this.excludedNumbers : this.excludedStars;
    const universe: number[] = [];
    
    const startNum = (type === 'number' && this.currentGame.id === 'nacional') ? 10 : 1;
    for (let i = startNum; i <= range; i++) {
      if (excluded.has(i)) continue;
      
      // Additional filter for main numbers: excluded endings
      if (type === 'number' && this.filters.terminaciones && this.filters.terminaciones.length > 0 && this.filters.terminaciones.includes(i % 10)) {
          continue;
      }
      
      universe.push(i);
    }
    return universe;
  }
  updateSelectionMode(mode: 'excluded' | 'hot' | 'cold' | 'figure' | 'absent' | 'favorites') {
    const isTogglingOff = this.currentSelectionMode === mode;
    
    // Clear previous mode state
    if (this.currentSelectionMode === 'figure') {
        this.clearSelections(false); // Clear figure selections
    }
    this.currentSelectionMode = null;

    document.querySelectorAll('.selection-mode-btn[data-mode]').forEach(b => {
        // FIX: Cast to HTMLElement to access dataset
        const btn = b as HTMLElement;
        if (['cold', 'hot', 'excluded', 'figure', 'absent', 'favorites'].includes(btn.dataset.mode!)) {
            btn.classList.remove('active');
        }
    });

    if (isTogglingOff) {
        this.showToast(t('toast.modoSeleccionNormal'), 'info');
    } else {
        this.currentSelectionMode = mode;
        document.querySelector(`.selection-mode-btn[data-mode="${mode}"]`)?.classList.add('active');
        const modeText = {
            excluded: t('selection.modeText.excluded'),
            hot: t('selection.modeText.hot'),
            cold: t('selection.modeText.cold'),
            figure: t('selection.modeText.figure'),
            absent: t('selection.modeText.absent'),
            favorites: t('selection.modeText.favorites')
        };
        this.showToast(t('toast.modoActivado', { mode: modeText[mode] }), 'info');
        if (mode === 'figure') {
            this.clearSelections(false);
        }
    }
  }
  updateSelectedDisplay() {
    const display = document.getElementById('selectedDisplay');
    if (!display) return;
    display.innerHTML = '';
    
    if (this.currentSelectionMode === 'figure') {
        const count = this.selectedNumbers.size;
        display.innerHTML = `<div style="color:#666; font-style: italic;">${count} números seleccionados para la figura.</div>`;
        return;
    }
    
    if (this.selectedNumbers.size === 0 && this.selectedStars.size === 0) {
      display.innerHTML = `<div style="color:#666; font-style: italic;">Selecciona hasta ${this.currentGame.maxNumbers} números${this.currentGame.maxStars > 0 ? ' y ' + this.currentGame.maxStars + ' estrellas' : ''}</div>`;
    } else {
      // Main numbers
      Array.from(this.selectedNumbers).sort((a,b)=>a-b).forEach(num => {
        const ball = document.createElement('div');
        ball.classList.add('number-ball', 'selected');
        ball.style.cssText = 'width: 35px; height: 35px; cursor: default;';
        ball.textContent = this.currentGame.id === 'nacional' ? String(num % 10) : String(num);
        display.appendChild(ball);
      });

      // Stars
      if (this.selectedStars.size > 0) {
        const separator = document.createElement('div');
        separator.style.cssText = 'margin: 0 10px; font-weight: bold; color: #666;';
        separator.textContent = '+';
        display.appendChild(separator);

        Array.from(this.selectedStars).sort((a,b)=>a-b).forEach(num => {
          const ball = document.createElement('div');
          ball.classList.add('number-ball', 'star-ball', 'selected');
          ball.style.cssText = 'width: 35px; height: 35px; cursor: default; background: #fbbf24; color: #000;';
          ball.textContent = String(num);
          display.appendChild(ball);
        });
      }
    }
  }

  updateTopDisplayWithCombination(combination: number[], type = 'generated', stars: number[] = []) {
    const display = document.getElementById('selectedDisplay');
    if (!display) return;
    display.innerHTML = '';
    if (!combination || combination.length === 0) {
        display.innerHTML = `<div style="color:#666; font-style: italic;">No se generó ninguna combinación.</div>`;
        return;
    }

    const className = type === 'random' ? 'random-pick' : 'generated-pick';

    [...combination].sort((a, b) => a - b).forEach(num => {
        const ball = document.createElement('div');
        ball.classList.add('number-ball', className);
        ball.style.cssText = 'width: 35px; height: 35px; cursor: default;';
        ball.textContent = this.currentGame.id === 'nacional' ? String(num % 10) : String(num);
        display.appendChild(ball);
    });

    if (stars && stars.length > 0) {
        const separator = document.createElement('div');
        separator.style.cssText = 'margin: 0 10px; font-weight: bold; color: #666;';
        separator.textContent = '+';
        display.appendChild(separator);

        [...stars].sort((a, b) => a - b).forEach(num => {
            const ball = document.createElement('div');
            ball.classList.add('number-ball', 'star-ball', className);
            ball.style.cssText = 'width: 35px; height: 35px; cursor: default; background: #fbbf24; color: #000;';
            ball.textContent = String(num);
            display.appendChild(ball);
        });
    }
  }

  // ===== UI STRATEGY =====
  updateStrategyUI(strategy: string) {
    document.querySelectorAll('.strategy-buttons .strategy-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.strategy-buttons .strategy-btn[data-strategy="${strategy}"]`)?.classList.add('active');
    const winningOptions = document.getElementById('winningOptions') as HTMLElement;
    const multipleOptions = document.getElementById('multipleNumbersOptions') as HTMLElement;
    const reducedOptions = document.getElementById('reducedOptions') as HTMLElement;
    const realTimeStatsSection = document.getElementById('realTimeStatsSection');

    if(winningOptions) winningOptions.style.display = strategy === 'winning' ? 'block' : 'none';
    if(multipleOptions) multipleOptions.style.display = strategy === 'multiple' ? 'block' : 'none';
    if(reducedOptions) reducedOptions.style.display = strategy === 'reducida' ? 'block' : 'none';
    if(realTimeStatsSection) realTimeStatsSection.style.display = strategy === 'simple' ? 'block' : 'none';
    
    this.clearSelections(false);
    this.updateSelectionTitle();
    this.updateReducedSystemInfo();
  }
  
  // ===========================================
  // ===== MOTOR DE GENERACIÓN (CORREGIDO) =====
  // ===========================================
  async generateCombinations() {
    if (this.isGenerating) return;
    
    let strategy = (document.querySelector('.strategy-buttons .strategy-btn.active') as HTMLElement)?.dataset.strategy;
    if (!strategy) {
        strategy = 'simple';
        this.updateStrategyUI('simple');
    }

    this.clearUITrigger();
    this.showFilterSpinner();
    // Don't clear selections if in figure mode (as they ARE the universe) or if in reducida strategy (as they are the base)
    if (this.currentSelectionMode !== 'figure' && strategy !== 'reducida') {
        this.clearSelections(false);
    }

    this.isGenerating = true;
    this.showLoading(t('main.iniciandoLoading'));
    
    this.updateFilterStateFromUI();
    this.syncExclusionsWithFilters();
    this.updateGridNumberStates();
    const availableUniverse = this.getAvailableUniverse('number');
    const availableStars = this.getAvailableUniverse('star');
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;

    if (availableUniverse.length < maxNumbers) {
      this.showToast(t('toast.imposibleGenerar', { count: maxNumbers }), 'error');
      this.hideLoading();
      this.isGenerating = false;
      this.hideFilterSpinner();
      return;
    }
    let combinations: number[][] = [];
    let starsCombinations: number[][] = [];
    let selectedSystemName = '';

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      if (strategy === 'simple') {
          this.showLoading('Buscando combinación...');
          const loadingInfo = document.getElementById('loadingInfo');
          let found = false;
          const maxSimpleAttempts = 50000;
          const chunkSize = 1500;
          
          for (let i = 0; i < maxSimpleAttempts; i++) {
              if (i > 0 && i % chunkSize === 0) {
                  if (loadingInfo) {
                      loadingInfo.textContent = `Buscando... (${i} intentos probados)`;
                  }
                  // Yield execution to the browser event loop to avoid locking the UI thread
                  await new Promise(resolve => setTimeout(resolve, 1));
              }
              
              const combo = this.generateRandomCombination(availableUniverse, maxNumbers);
              const stars = maxStars > 0 ? this.generateRandomCombination(availableStars, maxStars) : [];
              if (this.isValidCombination(combo, stars)) {
                  combinations = [combo];
                  starsCombinations = [stars];
                  found = true;
                  break;
              }
          }
          if (!found) {
              const err = new Error('No se encontró ninguna combinación que cumpla todos los filtros.');
              (err as any).i18nKey = 'error.generacion.simpleNoEncontrada';
              throw err;
          }
      } else if (strategy === 'winning') {
          const generateCount = parseInt((document.getElementById('generateCount') as HTMLInputElement)?.value || '100');
          const playCount = parseInt((document.getElementById('playCount') as HTMLInputElement)?.value || '10');
          const results = await this.findAndRankWinningCombinations(availableUniverse, generateCount, playCount);
          combinations = results.map(r => r.combo);
          starsCombinations = results.map(r => r.stars);
      } else if (strategy === 'multiple') {
          const numCount = parseInt((document.querySelector('.number-option.active') as HTMLElement)?.dataset.numbers || String(maxNumbers + 1));
          const starCount = (this.currentGame.id === 'euromillones' || this.currentGame.id === 'eurodreams' || this.currentGame.id === 'powerball' || this.currentGame.id === 'gordo') ? 
              parseInt((document.querySelector('.star-multiple-option.active') as HTMLElement)?.dataset.stars || String(maxStars)) : 
              maxStars;

          if (this.currentGame.id === 'euromillones') {
              const numCombos = this.nCr(numCount, 5);
              const starCombos = this.nCr(starCount, 2);
              const totalBets = numCombos * starCombos;
              if (totalBets > 756) {
                  const err = new Error(`❌ Límite oficial excedido: Euromillones no permite más de 756 apuestas por boleto en el canal oficial (tu selección de ${numCount} números y ${starCount} estrellas genera ${totalBets} apuestas).`);
                  (err as any).i18nKey = 'error.generacion.limiteEuromillones';
                  (err as any).i18nParams = { numCount, starCount, totalBets };
                  throw err;
              }
          }

          if (this.currentGame.id === 'eurodreams') {
              if (numCount > 6 && starCount > 1) {
                  const err = new Error(`❌ Apuesta Múltiple Cruzada no autorizada en EuroDreams. La normativa oficial SELAE permite seleccionar entre 7 y 10 números principales con 1 Sueño, O BIEN 6 números principales con 2 a 5 Sueños.`);
                  (err as any).i18nKey = 'error.generacion.cruzadaEurodreams';
                  throw err;
              }
          }

          if (availableUniverse.length < numCount) {
              const err = new Error(`No hay suficientes números (${availableUniverse.length}) para una múltiple de ${numCount}.`);
              (err as any).i18nKey = 'error.generacion.numerosInsuficientes';
              (err as any).i18nParams = { available: availableUniverse.length, numCount };
              throw err;
          }
          if (maxStars > 0 && availableStars.length < starCount) {
              const err = new Error(`No hay suficientes estrellas (${availableStars.length}) para una múltiple de ${starCount}.`);
              (err as any).i18nKey = 'error.generacion.estrellasInsuficientes';
              (err as any).i18nParams = { available: availableStars.length, starCount };
              throw err;
          }

          const result = await this.findValidSuperset(availableUniverse, numCount, starCount);
          if (result) {
              combinations = [result.superset];
              starsCombinations = [result.stars];
              this.lastMultipleStats = { validCount: result.validCount, totalCount: result.totalCount };
          }
      } else if (strategy === 'reducida') {
          const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
          const gameId = this.currentGame.id;
          const systems = REDUCED_SYSTEMS[gameId] || [];
          const system = systems.find(s => s.id === select?.value);
          if (!system) {
              const err = new Error('No se ha seleccionado ningún sistema de reducción válido o no es compatible con el juego activo.');
              (err as any).i18nKey = 'error.generacion.sistemaNoValido';
              throw err;
          }
          if (this.selectedNumbers.size !== system.baseNumbersCount) {
              const err = new Error(`Debes seleccionar exactamente ${system.baseNumbersCount} números base en la cuadrícula. Actualmente tienes ${this.selectedNumbers.size}.`);
              (err as any).i18nKey = 'error.generacion.numerosBaseIncorrectos';
              (err as any).i18nParams = { required: system.baseNumbersCount, current: this.selectedNumbers.size };
              throw err;
          }
          
          this.showLoading('Generando combinación reducida...');
          
          const baseNumbersSorted = Array.from(this.selectedNumbers).sort((a, b) => a - b);
          this.reducedBaseNumbers = new Set(baseNumbersSorted);
          selectedSystemName = system.name;
          
          const selectedStarsArr = Array.from(this.selectedStars);
          let baseStars: number[] = [];
          if (selectedStarsArr.length >= this.currentGame.maxStars) {
              baseStars = selectedStarsArr.slice(0, this.currentGame.maxStars);
          } else {
              const availableStars = this.getAvailableUniverse('star');
              const shuffledStars = [...availableStars].sort(() => Math.random() - 0.5);
              baseStars = shuffledStars.slice(0, this.currentGame.maxStars);
          }
          
          const matrix = getGreedyCovering(
              system.baseNumbersCount,
              this.currentGame.maxNumbers,
              system.id.includes('-3-3') ? 3 : (system.id.includes('-4-4') ? 4 : 5),
              system.combinationsCount
          );
          
          combinations = matrix.map(indices => {
              return indices.map(idx => baseNumbersSorted[idx]).sort((a, b) => a - b);
          });
          
          starsCombinations = combinations.map(() => [...baseStars].sort((a, b) => a - b));
      }

      if (combinations.length > 0) {
        this.displayTicket(combinations, strategy!, starsCombinations, selectedSystemName);
        
        // UI Trigger Logic
        let triggerMsg = '';
        let toastMsg = '';
        if (strategy === 'simple') {
            triggerMsg = t('generation.triggerSimple');
            toastMsg = t('toast.combinacionEncontrada');
        } else if (strategy === 'winning') {
            const generateCount = (document.getElementById('generateCount') as HTMLInputElement)?.value || '100';
            const playCount = combinations.length;
            triggerMsg = t('generation.triggerGanadora', { count: generateCount, best: playCount });
            toastMsg = t('toast.combinacionesGanadora', { count: generateCount, best: playCount });
        } else if (strategy === 'multiple' && this.lastMultipleStats) {
            const { validCount, totalCount } = this.lastMultipleStats;
            const percentage = ((validCount / totalCount) * 100).toFixed(1);
            triggerMsg = t('generation.triggerMultiple', { valid: validCount, total: totalCount, pct: percentage });
            toastMsg = t('toast.multipleEncontrada', { valid: validCount, total: totalCount, pct: percentage });
        } else if (strategy === 'reducida') {
            triggerMsg = t('generation.triggerReducida', { count: combinations.length, system: selectedSystemName });
            toastMsg = t('toast.reducidaGenerada');
        }

        if (triggerMsg) {
            this.showToast(toastMsg, 'success');
            this.showUITrigger(triggerMsg);
        }
      } else {
         this.showToast(t('toast.sinCombinacion'), 'warning');
         this.displayFilterFailureDiagnostics();
      }

    } catch (error: any) {
        const displayMessage = error.i18nKey ? t(error.i18nKey, error.i18nParams || {}) : error.message;
        this.showToast(t('toast.errorGenerico', { message: displayMessage }), 'error');
        const esErrorDeCombinacionNoEncontrada = error.message && (
            error.message.includes('No se encontró') ||
            error.message.includes('No se encontraron') ||
            error.message.includes('no se encontró') ||
            error.message.includes('no se encontraron') ||
            error.message.includes('flexibilizar los filtros')
        );
        if (esErrorDeCombinacionNoEncontrada) {
            try {
                this.displayFilterFailureDiagnostics();
            } catch (diagErr) {
                console.error("Fallo al mostrar el diagnóstico detallado:", diagErr);
            }
        }
    } finally {
        this.hideLoading();
        this.isGenerating = false;
        this.hideFilterSpinner();
        try {
            this.updateFilterBadgesFromAudit();
        } catch (badgeErr) {
            console.error("No se pudieron actualizar los visuales de filtros:", badgeErr);
        }
    }
  }


  async findAndRankWinningCombinations(universe: number[], generateCount: number, playCount: number): Promise<{combo: number[], stars: number[]}[]> {
    const availableStars = this.getAvailableUniverse('star');
    const loadingInfo = document.getElementById('loadingInfo');
    const optimizationContext = {
      hotNumbers: this.hotNumbers,
      coldNumbers: this.coldNumbers,
      absentNumbers: this.absentNumbers,
      favoriteNumbers: this.favoriteNumbers,
      hotStars: this.hotStars,
      favoriteStars: this.favoriteStars,
      filters: this.filters,
      historicalData: this.historicalData,
      currentGame: this.currentGame,
      primes: this.primes
    };

    return runFindAndRankWinningCombinations(
      universe,
      generateCount,
      playCount,
      this.currentGame,
      this.filters,
      availableStars,
      optimizationContext,
      (msg) => { this.showLoading(msg); if (loadingInfo) loadingInfo.textContent = msg; }
    );
  }

  async findValidSuperset(universe: number[], numCount: number, starCount: number = 0): Promise<{ superset: number[], stars: number[], validCount: number, totalCount: number } | null> {
    const availableStars = this.getAvailableUniverse('star');
    const loadingInfo = document.getElementById('loadingInfo');

    return runFindValidSuperset(
      universe,
      numCount,
      starCount,
      this.currentGame,
      this.filters,
      availableStars,
      this.TOLERANCE_LEVELS,
      this.primes,
      (msg) => { this.showLoading(msg); if (loadingInfo) loadingInfo.textContent = msg; }
    );
  }

  findValidCombinations(universe: number[], count: number, maxAttempts: number): number[][] {
    return runFindValidCombinations(universe, count, maxAttempts, this.currentGame, this.filters, this.primes);
  }
  
  isValidCombination(combination: number[], stars: number[] = [], customHistoricalData?: { numbers: number[] }[]): boolean {
    return validateCombination(combination, stars, this.currentGame, this.filters, this.primes, false, customHistoricalData ?? this.historicalData);
  }

  generateRandomCombination(universe: number[], count: number): number[] {
    return generateRandomCombination(universe, count, this.currentGame?.id);
  }
  
  getCombinations(source: number[], k: number): number[][] {
    return getCombinations(source, k);
  }
  
  // ===== ESTADÍSTICAS Y VALIDACIÓN (CORREGIDO) =====
  updateStats() {
    this.displayCombinationStats(Array.from(this.selectedNumbers), Array.from(this.selectedStars));
  }

  displayCombinationStats(combination: number[], stars: number[] = []) {
    const statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    
    const safeSetText = (id: string, text: string | number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(text);
    };
    
    const maxNumbers = this.currentGame.maxNumbers;
    if (!combination || combination.length !== maxNumbers) {
        statsContent.querySelectorAll('.stat-value').forEach(el => el.textContent = '-');
        return;
    }
    const stats = this.getCombinationStats(combination, stars);
    for (const key in stats) {
        if (key.startsWith('_')) continue; // No mostrar valores raw
        const elId = `stat${key.charAt(0).toUpperCase() + key.slice(1)}`;
        // FIX: Cast stats[key] to any to satisfy safeSetText. The types are compatible.
        safeSetText(elId, (stats as any)[key]);
    }
  }

  getCombinationStats(combination: number[], stars: number[] = []) {
    return getCombinationStats(combination, stars, this.currentGame, this.primes);
  }
  
  clearGridHighlights() {
    document.querySelectorAll('.number-ball.generated-pick, .number-ball.random-pick').forEach(ball => {
        ball.classList.remove('generated-pick', 'random-pick');
        // Restore persistent icons/states
        this.updateGridNumberStates(); 
    });
  }
  
  // ===== TICKET & STORAGE =====
  displayTicket(combinations: number[][], strategy: string, starsCombinations: number[][] = [], systemName?: string) {
    let finalCombinations = combinations;
    
    // YA NO EXPLOTAMOS AQUÍ LA MÚLTIPLE.
    // La dejamos tal cual para que se muestre como un bloque.
    // La validación se encargará de explotarla.

    this.currentTicket = { 
        date: new Date().toISOString(), 
        combinations: finalCombinations, 
        strategy,
        gameId: this.currentGame.id, // NEW: Store game ID
        stars: starsCombinations.length > 0 ? starsCombinations : undefined,
        systemName
    };

    const costInfo = this.calculateTicketCost(this.currentTicket);

    const ticketDiv = document.getElementById('ticket');
    if (!ticketDiv) return;

    if (!document.getElementById('ticketCombinations') || ticketDiv.classList.contains('conflict')) {
        ticketDiv.classList.remove('conflict');
        ticketDiv.innerHTML = `
          <div class="ticket-header">
            <h4>${t('ticket.tituloBoleto')}</h4>
            <p id="ticketDate"></p>
          </div>
          <div class="ticket-draw-date-selector">
              <label for="ticketDrawDate" style="display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 0.9rem; color: var(--dark); margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                <span>${t('ticket.fechaSorteoLabel')}</span>
                <span id="ticketDrawDaysBadge" class="ticket-draw-days-badge" style="background: #e0e7ff; color: #3730a3; font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border-radius: 12px; border: 1px solid #c7d2fe;">${t('ticket.diasDeSorteoDefault')}</span>
              </label>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input type="date" id="ticketDrawDate" style="flex: 1; min-width: 150px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; outline: none;">
                <button type="button" id="nextValidDrawDateBtn" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="${t('ticket.proximoSorteoTitle')}">
                  ${t('ticket.proximoSorteoBtn')}
                </button>
                <button type="button" id="openDrawCalendarBtn" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="${t('ticket.verCalendarioTitle')}">
                  ${t('ticket.verCalendarioBtn')}
                </button>
              </div>
              <div id="ticketDateWarning" style="display: none; margin-top: 8px; padding: 8px 12px; background: #fffbe3; border: 1px solid #fef08a; border-radius: 6px; font-size: 0.82rem; color: #713f12; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                <span id="ticketDateWarningText"></span>
                <button type="button" id="fixTicketDateBtn" style="background: #d97706; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: bold; cursor: pointer;">${t('ticket.corregirProximoSorteoBtn')}</button>
              </div>
          </div>
          <div id="ticketCombinations"></div>
          <div class="ticket-actions">
            <button class="ticket-btn save-btn" id="saveBtn">
              ${t('ticket.guardarBoletoBtn')}
            </button>
            <button class="ticket-btn share-btn" id="shareBtn">
              ${t('ticket.compartirBtn')}
            </button>
            <button class="ticket-btn download-btn" id="downloadTxtBtn">
              ${t('ticket.descargarTxtBtn')}
            </button>
          </div>
        `;
        
        // Re-attach listeners to the reconstructed buttons
        document.getElementById('saveBtn')?.addEventListener('click', () => this.saveTicket());
        document.getElementById('shareBtn')?.addEventListener('click', () => this.shareTicket());
        document.getElementById('downloadTxtBtn')?.addEventListener('click', () => this.downloadTicketAsTxt());
        document.getElementById('nextValidDrawDateBtn')?.addEventListener('click', () => {
          const input = document.getElementById('ticketDrawDate') as HTMLInputElement;
          if (input) {
            const nextDate = this.getNextValidDrawDateStr(new Date());
            input.value = nextDate;
            this.validateAndWarnTicketDate(nextDate);
          }
        });
        document.getElementById('openDrawCalendarBtn')?.addEventListener('click', () => this.openDrawDateCalendar());
    }

    const combinationsDiv = document.getElementById('ticketCombinations');
    const ticketDateEl = document.getElementById('ticketDate');
    if (ticketDateEl) ticketDateEl.textContent = new Date().toLocaleString();
    
    if (!combinationsDiv) return;
    combinationsDiv.innerHTML = '';
    
    finalCombinations.forEach((combo, idx) => {
        const comboDiv = document.createElement('div');
        const maxNumbers = this.currentGame.maxNumbers;
        const isSystem = combo.length > maxNumbers;
        
        comboDiv.className = `ticket-combination ${isSystem ? 'system' : ''}`;
        
        if (isSystem) {
            const badge = document.createElement('div');
            badge.className = 'system-badge';
            badge.textContent = `Múltiple de ${combo.length} Números`;
            comboDiv.appendChild(badge);
        }

        const numbersContainer = document.createElement('div');
        numbersContainer.style.display = 'flex';
        numbersContainer.style.flexWrap = 'wrap';
        numbersContainer.style.gap = '8px';
        numbersContainer.style.alignItems = 'center';
        numbersContainer.style.justifyContent = isSystem ? 'center' : 'flex-start';

        if (this.currentGame.id === 'nacional') {
            const digits = [0, 0, 0, 0, 0];
            combo.forEach(n => {
                const col = Math.floor(n / 10) - 1;
                if (col >= 0 && col < 5) digits[col] = n % 10;
            });
            digits.forEach(digit => {
                const numDiv = document.createElement('div');
                numDiv.className = 'ticket-number';
                numDiv.textContent = String(digit);
                numbersContainer.appendChild(numDiv);
            });
        } else {
            [...combo].sort((a,b)=>a-b).forEach(num => {
                const numDiv = document.createElement('div');
                numDiv.className = 'ticket-number';
                numDiv.textContent = String(num);
                numbersContainer.appendChild(numDiv);
            });
        }

        if (starsCombinations[idx] && starsCombinations[idx].length > 0) {
            const separator = document.createElement('div');
            separator.style.color = '#9ca3af';
            separator.style.fontWeight = 'bold';
            separator.style.margin = '0 4px';
            separator.textContent = '+';
            numbersContainer.appendChild(separator);

            [...starsCombinations[idx]].sort((a,b)=>a-b).forEach(num => {
                const starDiv = document.createElement('div');
                starDiv.className = 'ticket-number star';
                starDiv.style.background = '#fbbf24';
                starDiv.style.color = '#000';
                starDiv.textContent = String(num);
                numbersContainer.appendChild(starDiv);
            });
        }

        comboDiv.appendChild(numbersContainer);
        combinationsDiv.appendChild(comboDiv);
    });
    
    this.clearGridHighlights();

    if (strategy !== 'multiple' && finalCombinations.length > 0) {
        this.updateTopDisplayWithCombination(finalCombinations[0], 'generated', starsCombinations[0]);
    } else if (strategy === 'multiple') {
        // Mostrar el superset generado en el display superior también
        if (finalCombinations.length > 0) {
             this.updateTopDisplayWithCombination(finalCombinations[0], 'generated', starsCombinations[0]);
        }
    } else {
        const display = document.getElementById('selectedDisplay');
        const message = strategy === 'multiple' ? 'Múltiple generada. Ver boleto.' : 'Selecciona hasta 6 números';
        if(display) display.innerHTML = `<div style="color:#666; font-style: italic;">${message}</div>`;
    }

    // Highlight picks
    if (finalCombinations.length > 0) {
        // Set as active selection
        if (strategy === 'reducida') {
            this.selectedNumbers = new Set(this.reducedBaseNumbers);
            this.selectedStars = new Set(starsCombinations[0] || []);
        } else {
            this.selectedNumbers = new Set(finalCombinations[0]);
            this.selectedStars = new Set(starsCombinations[0] || []);
        }

        finalCombinations[0].forEach(num => {
            const ball = document.querySelector(`.number-ball[data-number="${num}"][data-type="number"]`);
            if (ball) {
                ball.classList.add('selected', 'generated-pick');
                const icon = ball.querySelector('.number-icon');
                if(icon) icon.textContent = '🤖';
            }
        });

        if (starsCombinations.length > 0 && starsCombinations[0]) {
            starsCombinations[0].forEach(star => {
                const ball = document.querySelector(`.number-ball[data-number="${star}"][data-type="star"]`);
                if (ball) {
                    ball.classList.add('selected', 'generated-pick');
                    const icon = ball.querySelector('.number-icon');
                    if(icon) icon.textContent = '⭐';
                }
            });
        }

        this.updateSelectedDisplay();
        this.updateStats();
        this.updateCorrelationScore();
        
        if (strategy === 'multiple') {
             if (false) { /*
                 return; // starsCombinations[0].forEach(star => {
                     const ball = document.querySelector(`.number-ball.star-ball[data-number="${star}"]`);
                     if (ball) {
                         ball.classList.add('generated-pick');
                         const icon = ball.querySelector('.number-icon');
                         if(icon) icon.textContent = '⭐';
                     }
                 });
             */ }
             // No stats for superset
             this.displayCombinationStats([]);
        } else {
            this.displayCombinationStats(finalCombinations[0], starsCombinations[0] || []);
        }
    }
    
    this.updateTicketDrawDateBadge();
    ticketDiv.classList.add('show');
    // Scroll to ticket with safety delay and mobile optimization
    setTimeout(() => {
        try {
            ticketDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            ticketDiv.scrollIntoView();
        }
    }, 150);
  }
  calculateTicketMetrics(ticket: Ticket) {
    return calculateTicketMetrics(ticket, this.currentGame?.id);
  }

  getTicketValidationData(ticket: Ticket, winningNumbers: number[], winningStars: number[] = []) {
    return getTicketValidationDataUtil(ticket, winningNumbers, winningStars, this.currentGame?.id);
  }

  saveTicket() {
    if (!this.currentTicket) return;

    const drawDateEl = document.getElementById('ticketDrawDate') as HTMLInputElement;
    if (drawDateEl && drawDateEl.value) {
      const selectedDate = new Date(drawDateEl.value + 'T00:00:00');
      const dayOfWeek = selectedDate.getDay();
      const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
      if (!allowedDays.includes(dayOfWeek)) {
        const DAY_NAMES = [t('common.dias.domingo'), t('common.dias.lunes'), t('common.dias.martes'), t('common.dias.miercoles'), t('common.dias.jueves'), t('common.dias.viernes'), t('common.dias.sabado')];
        this.showToast(t('toast.juegoNoSeJuegaEsteDia', { game: this.currentGame.name, day: DAY_NAMES[dayOfWeek], days: this.getGameAllowedDaysText() }), 'warning');
        return;
      }
      this.currentTicket.drawDate = drawDateEl.value;
    }

    const savedTicketCopy = { ...this.currentTicket };
    this.savedTickets.unshift(this.currentTicket);
    this.saveState();
    this.updateSavedTickets();

    // Telemetry
    const metrics = this.calculateTicketMetrics(savedTicketCopy);
    const activeFavorites = Array.from(this.favoriteNumbers || []);
    const activeSecondaryFavorites = Array.from(this.favoriteStars || []);
    this.sendTelemetry('save_ticket', {
        gameId: metrics.gameId,
        combinationsCount: metrics.combinationsCount,
        betType: metrics.betType,
        numbersCount: metrics.numbersCount,
        starsCount: metrics.starsCount,
        drawDate: savedTicketCopy.drawDate || 'Desconocida',
        favoriteNumbers: activeFavorites.length > 0 ? activeFavorites : undefined,
        favoriteSecondaryNumbers: activeSecondaryFavorites.length > 0 ? activeSecondaryFavorites : undefined
    });

    this.currentTicket = null;
    const ticketDiv = document.getElementById('ticket');
    if(ticketDiv) ticketDiv.classList.remove('show');
    this.showToast(t('toast.boletoGuardado'), 'success');
  }

  downloadTicketAsTxt() {
    if (!this.currentTicket) return;
    const game = this.currentGame;
    const maxNumbers = game.maxNumbers;

    let combosToPlay: number[][] = this.currentTicket.combinations;
    let starsToPlay: number[][] = [];

    const isSuperset = this.currentTicket.combinations.length === 1 && this.currentTicket.combinations[0].length > maxNumbers;

    if (isSuperset) {
      combosToPlay = this.getCombinations(this.currentTicket.combinations[0], maxNumbers);

      if (game.maxStars > 0 && this.currentTicket.stars && this.currentTicket.stars[0]) {
        const starSuperset = this.currentTicket.stars[0];
        const isStarSuperset = starSuperset.length > game.maxStars;
        const starCombos = isStarSuperset
          ? this.getCombinations(starSuperset, game.maxStars)
          : [starSuperset];

        // Emparejamiento "al directo": cada combo de números x cada combo de estrellas,
        // igual que calculateTicketCost() en src/utils/combinatorial.ts
        const pairedCombos: number[][] = [];
        const pairedStars: number[][] = [];
        combosToPlay.forEach(c => {
          starCombos.forEach(s => {
            pairedCombos.push(c);
            pairedStars.push(s);
          });
        });
        combosToPlay = pairedCombos;
        starsToPlay = pairedStars;
      }
    } else if (game.maxStars > 0 && this.currentTicket.stars) {
      starsToPlay = this.currentTicket.stars;
    }

    const lines = combosToPlay.map((combo, idx) => {
      const numsStr = [...combo].sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join(',');
      const stars = starsToPlay[idx];
      if (game.maxStars > 0 && stars && stars.length > 0) {
        const starsStr = [...stars].sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join(',');
        return `${numsStr}+${starsStr}`;
      }
      return numsStr;
    });

    const txtContent = lines.join('\n');

    try {
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = this.currentTicket.drawDate || new Date().toISOString().slice(0, 10);
      a.download = `datalotto_${game.id}_${dateStr}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(t('toast.boletoDescargadoTxt'), 'success');
    } catch (error) {
      this.showToast(t('toast.errorDescargarTxt'), 'error');
      console.error('Download txt error:', error);
    }
  }

  deleteTicket(date: string) {
    this.savedTickets = this.savedTickets.filter(t => t.date !== date);
    this.saveState();
    this.updateSavedTickets();
    this.showToast(t('toast.boletoEliminado'), 'info');
  }

  updateSavedTicketsStats() {
    const statsSection = document.getElementById('savedTicketsStatsSection') as HTMLElement;
    if (!statsSection) return;

    if (this.savedTickets.length === 0) {
        statsSection.style.display = 'none';
        return;
    }

    statsSection.style.display = 'block';

    const safeSetText = (id: string, text: string | number) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = String(text); // Use innerHTML to render styled text
    };

    // Calculate total combinations
    let totalCombinations = 0;
    this.savedTickets.forEach(ticket => {
        if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
             // Calculate how many 6-number combos are in this multiple ticket
             const n = ticket.combinations[0].length;
             // nCr formula: n! / (r! * (n-r)!) where r=6
             let combos = 1;
             for(let i=0; i<6; i++) combos *= (n-i)/(i+1);
             totalCombinations += Math.round(combos);
        } else {
            totalCombinations += ticket.combinations.length;
        }
    });
    safeSetText('totalTicketsSaved', totalCombinations);

    // Strategy Distribution
    const strategyCounts: { [key: string]: number } = { simple: 0, winning: 0, multiple: 0 };
    const strategyMap: { [key: string]: string } = { simple: 'Simple', winning: 'E. Ganadora', multiple: 'Múltiple' };
    
    this.savedTickets.forEach(ticket => {
      if (strategyCounts.hasOwnProperty(ticket.strategy)) {
        strategyCounts[ticket.strategy] += ticket.combinations.length;
      } else {
        strategyCounts[ticket.strategy] = ticket.combinations.length;
      }
    });

    const mostUsed = Object.entries(strategyCounts).sort((a, b) => b[1] - a[1])[0];
    safeSetText('mostUsedStrategy', mostUsed && mostUsed[1] > 0 ? `${strategyMap[mostUsed[0]] || mostUsed[0]} (${mostUsed[1]})` : 'N/A');
    
    safeSetText('strategyDistribution', Object.entries(strategyCounts)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${strategyMap[key] || key}: ${value}`)
      .join(' | '));

    // Hit analysis
    // Note: For simplicity in this overview statistic, we won't explode multiples here unless already validated.
    const validatedTickets = this.savedTickets.filter(t => t.validation);
    const PROBS: { [key: number]: number } = { 3: 0.0176504, 4: 0.0009686, 5: 0.0000184, 6: 0.0000000715 };
    const hitCounts: { [key: number]: number } = { 3: 0, 4: 0, 5: 0, 6: 0 };
    let totalValidatedCombos = 0;

    validatedTickets.forEach(ticket => {
        // Handle Multiple specially if it has summary data
        if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
             // To properly count hits in stats, we'd need to store the summary breakdown in the ticket validation object.
             // Currently `validation.hits` stores matches against the superset.
             // For this general stat display, we might skip detailed math for multiples to avoid complexity overflow here,
             // or simply check if `hits` > 6, which means it's a raw match count, not a combo result.
             // Let's skip multiples in this aggregate stats for now to keep it accurate for standard tickets.
        } else {
            totalValidatedCombos += ticket.combinations.length;
            ticket.validation!.hits.forEach(hitCount => {
                if (hitCounts.hasOwnProperty(hitCount)) {
                    hitCounts[hitCount]++;
                }
            });
        }
    });

    if (totalValidatedCombos > 0) {
        Object.keys(PROBS).forEach(tierStr => {
            const tier = parseInt(tierStr);
            const count = hitCounts[tier];
            const userRate = count / totalValidatedCombos;
            const statRate = (PROBS as any)[tier];
            
            let colorStyle = '';
            let performanceIndicator = '';

            if (userRate > statRate) {
                colorStyle = 'style="color: #166534;"'; // dark green
                performanceIndicator = '👍';
            } else if (userRate > 0 && userRate < statRate) {
                colorStyle = 'style="color: #991b1b;"'; // dark red
                performanceIndicator = '👎';
            }

            const userRatePercent = (userRate * 100).toFixed(4);
            const statRatePercent = (statRate * 100).toFixed(4);

            const text = `<span ${colorStyle}>${count} <small>(${userRatePercent}%)</small></span> <small>vs. ${statRatePercent}%</small> ${performanceIndicator}`;
            safeSetText(`hits${tier}`, text);
        });
    } else {
        safeSetText('hits3', 'N/A');
        safeSetText('hits4', 'N/A');
        safeSetText('hits5', 'N/A');
        safeSetText('hits6', 'N/A');
    }
}

  getWinningTicketInfo(ticket: Ticket): { isWinning: boolean; prizeSummary: string } {
    return getWinningTicketInfoUtil(ticket);
  }

  getTicketPrizeSummary(ticket: Ticket): { hasPrize: boolean; prizeLabel: string } {
    return getTicketPrizeSummaryUtil(ticket);
  }

  updateSavedTicketsBadge() {
    const badgeEl = document.getElementById('savedTicketsBadge');
    if (!badgeEl) return;

    const unreadValidatedCount = this.savedTickets.filter(t => t.validation && !t.seenValidation).length;

    if (unreadValidatedCount > 0) {
      badgeEl.style.display = 'inline-flex';
      badgeEl.style.alignItems = 'center';
      badgeEl.style.justifyContent = 'center';
      badgeEl.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      badgeEl.style.color = 'white';
      badgeEl.style.borderRadius = '12px';
      badgeEl.style.padding = '2px 8px';
      badgeEl.style.fontSize = '0.75rem';
      badgeEl.style.fontWeight = 'bold';
      badgeEl.style.marginLeft = '6px';
      badgeEl.style.boxShadow = '0 2px 6px rgba(16, 185, 129, 0.4)';
      badgeEl.textContent = `${unreadValidatedCount} validado${unreadValidatedCount > 1 ? 's' : ''}`;
    } else {
      badgeEl.style.display = 'none';
      badgeEl.textContent = '';
    }
  }

  updateSavedTickets() {
    this.updateSavedTicketsStats();
    this.updateHistoryDashboard();
    const container = document.getElementById('savedTickets');
    if (!container) return;
    container.innerHTML = '';
    if (this.savedTickets.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; padding: 20px;">${t('tickets.sinBoletos')}</div>`;
      this.updateSavedTicketsBadge();
      return;
    }

    const filterSelect = document.getElementById('savedTicketsGameFilter') as HTMLSelectElement;
    const filterVal = filterSelect ? filterSelect.value : 'all';

    const filteredTickets = filterVal === 'all'
      ? this.savedTickets
      : this.savedTickets.filter(t => t.gameId === filterVal);

    if (filteredTickets.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; padding: 20px;">${t('tickets.sinBoletosParaJuego')}</div>`;
      this.updateSavedTicketsBadge();
      return;
    }

    const strategyMap: { [key: string]: string } = {
        simple: t('tickets.strategy.simple'),
        winning: t('tickets.strategy.ganadora'),
        multiple: t('tickets.strategy.multiple')
    };

    let hasUnreadChanged = false;

    filteredTickets.forEach(ticket => {
      const item = document.createElement('div');
      item.className = 'saved-ticket-item';

      const winningInfo = this.getWinningTicketInfo(ticket);
      let prizeBannerHTML = '';

      if (ticket.validation && winningInfo.isWinning) {
        item.style.border = '2px solid #10b981';
        item.style.background = 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)';
        item.style.borderRadius = '12px';
        item.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.25)';
        item.style.marginBottom = '16px';
        item.style.padding = '14px';

        prizeBannerHTML = `
          <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 10px 14px; border-radius: 8px; font-weight: bold; font-size: 0.88rem; margin-top: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 3px 8px rgba(16,185,129,0.3); border: 1px solid #047857; flex-wrap: wrap; gap: 6px;">
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🏆</span>
              <span><strong>${t('tickets.boletoConAciertos')}</strong></span>
            </span>
            <span style="background: rgba(255,255,255,0.25); padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 700; white-space: nowrap;">
              ✨ ${winningInfo.prizeSummary}
            </span>
          </div>
        `;
      } else if (ticket.validation) {
        item.style.border = '1px solid #cbd5e1';
        item.style.background = '#ffffff';
        item.style.borderRadius = '12px';
        item.style.marginBottom = '12px';
        item.style.padding = '14px';

        prizeBannerHTML = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; padding: 6px 12px; border-radius: 8px; font-weight: 600; font-size: 0.82rem; margin-top: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span style="display: flex; align-items: center; gap: 6px;">ℹ️ <strong>${t('tickets.boletoValidado')}</strong> — ${t('tickets.sinAciertosPremiados')}</span>
            <span style="color: #475569; font-size: 0.75rem;">${t('tickets.verificadoCheck')}</span>
          </div>
        `;
      } else {
        item.style.border = '1px solid #e2e8f0';
        item.style.background = '#ffffff';
        item.style.borderRadius = '12px';
        item.style.marginBottom = '12px';
        item.style.padding = '14px';
        prizeBannerHTML = '';
      }

      const strategyName = strategyMap[ticket.strategy] || ticket.strategy;
      const gameName = ticket.gameId && GAMES[ticket.gameId] ? GAMES[ticket.gameId].name : 'DataLotto 6/49';
      const strategyHTML = `<span class="saved-ticket-strategy">${strategyName}</span> <span class="saved-ticket-game" style="font-size: 0.75rem; color: #6b7280; margin-left: 5px;">(${gameName})</span>`;
      const drawDateHTML = ticket.drawDate ? `<span class="saved-ticket-draw-date">${t('tickets.sorteo')} ${new Date(ticket.drawDate + 'T00:00:00').toLocaleDateString()}</span>` : '';

      let combosHTML = '';
      let actionsHTML = '';
      const playOnlineHTML = `<button class="play-online-btn-saved">${t('tickets.jugarOnline')}</button>`;

      const gameColors: { [key: string]: { bg: string; border: string; headerText: string; accent: string; rowBg: string } } = {
        bonoloto:  { bg: '#ecfdf5', border: '#6ee7b7', headerText: '#065f46', accent: '#059669', rowBg: '#d1fae5' },
        primitiva: { bg: '#fff7ed', border: '#fdba74', headerText: '#9a3412', accent: '#ea580c', rowBg: '#ffedd5' },
        nacional:  { bg: '#eef2ff', border: '#c7d2fe', headerText: '#3730a3', accent: '#4f46e5', rowBg: '#e0e7ff' },
      };

      // Check if it's a system ticket (Multiple with > 6 numbers)
      const isSystemTicket = ticket.combinations.length > 0 && (
        ticket.combinations[0].length > (GAMES[ticket.gameId || 'bonoloto']?.maxNumbers || 6) ||
        (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > (GAMES[ticket.gameId || 'bonoloto']?.maxStars || 1))
      );

      if (ticket.gameId === 'powerball') {
        const isMultipleTicket = ticket.strategy === 'multiple' ||
          (ticket.combinations.length > 0 && ticket.combinations[0].length > (GAMES[ticket.gameId]?.maxNumbers || 5));
        const superset = ticket.combinations[0] || [];
        const redSuperset = ticket.stars ? ticket.stars[0] : [1];
        const costData = this.calculateTicketCost(ticket);

        if (ticket.validation) {
          const cascade = this.calculatePowerballCascade(
            ticket,
            ticket.validation.winningNumbers,
            ticket.validation.stars || []
          );

          const winningWhiteSet = new Set(ticket.validation.winningNumbers);
          const winningRedSet = new Set(ticket.validation.stars || []);

          const tierRows = cascade.tiers.map(t => `
            <tr style="${t.count > 0 ? 'background: #ffe4e6; font-weight: bold; color: #881337;' : 'color: #64748b;'}">
              <td style="padding: 6px 10px; border: 1px solid #fecdd3; font-weight: 600;">${t.name}</td>
              <td style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center;">${t.hits} + ${t.starHits}🔴</td>
              <td style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${t.count > 0 ? '#be123c' : '#64748b'};">${t.count}</td>
            </tr>
          `).join('');

          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#e11d48' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">${t('tickets.masPB')}</span>
                  ${redSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningRedSet.has(r) ? '#9f1239' : '#fda4af'}; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
              const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
              const hitClass = (hits >= 3 || (hits >= 1 && starHits >= 1) || starHits >= 1) ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits');
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);

              const comboBalls = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#e11d48' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningRedSet.has(r) ? '#9f1239' : '#fda4af'}; color: white; font-weight: bold;">${r}</div>`).join('');

              return `
                <div class="saved-combination" style="margin-bottom: 8px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">${t('tickets.masPB')}</span>
                    ${starBalls}
                  </div>
                  <div class="hit-count ${hitClass}">${hits} + ${starHits}🔴 ${t('tickets.aciertos')}</div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #9f1239; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.powerball.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                <span style="background: #be123c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
              </div>

              ${combinationsListHTML}

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #ffe4e6; color: #881337; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: left;">${t('tickets.categoria')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #9f1239; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>${t('tickets.totalApuestasPremiadas')}</span>
                <span style="font-size: 1.1rem; color: #fef08a;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} ${t('tickets.apuestaSufijo')}</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
        } else {
          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">${t('tickets.masPB')}</span>
                  ${redSuperset.map(r => `<div class="saved-combination-number" style="background: #e11d48; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);
              const comboBalls = combo.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: #e11d48; color: white; font-weight: bold;">${r}</div>`).join('');
              return `
                <div class="saved-combination" style="margin-bottom: 6px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">${t('tickets.masPB')}</span>
                    ${starBalls}
                  </div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #9f1239; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.powerball.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
              </div>
              ${combinationsListHTML}
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
        }
      } else if (ticket.gameId === 'megamillions') {
        const isMultipleTicket = ticket.strategy === 'multiple' ||
          (ticket.combinations.length > 0 && ticket.combinations[0].length > (GAMES[ticket.gameId]?.maxNumbers || 5));
        const superset = ticket.combinations[0] || [];
        const goldSuperset = ticket.stars ? ticket.stars[0] : [1];
        const costData = this.calculateTicketCost(ticket);

        if (ticket.validation) {
          const cascade = this.calculateMegaMillionsCascade(
            ticket,
            ticket.validation.winningNumbers,
            ticket.validation.stars || []
          );

          const winningWhiteSet = new Set(ticket.validation.winningNumbers);
          const winningGoldSet = new Set(ticket.validation.stars || []);

          const tierRows = cascade.tiers.map(t => `
            <tr style="${t.count > 0 ? 'background: #fefce8; font-weight: bold; color: #854d0e;' : 'color: #64748b;'}">
              <td style="padding: 6px 10px; border: 1px solid #fde047; font-weight: 600;">${t.name}</td>
              <td style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t.hits} + ${t.starHits}🟡</td>
              <td style="padding: 6px 10px; border: 1px solid #fde047; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${t.count > 0 ? '#ca8a04' : '#64748b'};">${t.count}</td>
            </tr>
          `).join('');

          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#eab308' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">${t('tickets.masMB')}</span>
                  ${goldSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningGoldSet.has(r) ? '#854d0e' : '#fde047'}; color: ${winningGoldSet.has(r) ? '#fff' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
              const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
              const hitClass = (hits >= 3 || (hits >= 1 && starHits >= 1) || starHits >= 1) ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits');
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);

              const comboBalls = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#eab308' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningGoldSet.has(r) ? '#854d0e' : '#fde047'}; color: ${winningGoldSet.has(r) ? '#fff' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('');

              return `
                <div class="saved-combination" style="margin-bottom: 8px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">${t('tickets.masMB')}</span>
                    ${starBalls}
                  </div>
                  <div class="hit-count ${hitClass}">${hits} + ${starHits}🟡 ${t('tickets.aciertos')}</div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fefce8; border: 1.5px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.megamillions.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                <span style="background: #ca8a04; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
              </div>

              ${combinationsListHTML}

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #fef08a; color: #854d0e; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: left;">${t('tickets.categoria')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #a16207; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>${t('tickets.totalApuestasPremiadas')}</span>
                <span style="font-size: 1.1rem; color: #fef08a;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} ${t('tickets.apuestaSufijo')}</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
        } else {
          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">${t('tickets.masMB')}</span>
                  ${goldSuperset.map(r => `<div class="saved-combination-number" style="background: #eab308; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);
              const comboBalls = combo.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: #eab308; color: white; font-weight: bold;">${r}</div>`).join('');
              return `
                <div class="saved-combination" style="margin-bottom: 6px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">${t('tickets.masMB')}</span>
                    ${starBalls}
                  </div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.megamillions.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
              </div>
              ${combinationsListHTML}
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
        }
      } else if (ticket.gameId === 'euromillones') {
        const isMultipleTicket = ticket.strategy === 'multiple' ||
          (ticket.combinations.length > 0 && ticket.combinations[0].length > (GAMES[ticket.gameId]?.maxNumbers || 5));
        const superset = ticket.combinations[0] || [];
        const starSuperset = ticket.stars ? ticket.stars[0] : [1, 2];
        const costData = this.calculateTicketCost(ticket);

        if (ticket.validation) {
          const cascade = this.calculateEuromillonesCascade(
            ticket,
            ticket.validation.winningNumbers,
            ticket.validation.stars || []
          );

          const winningWhiteSet = new Set(ticket.validation.winningNumbers);
          const winningStarSet = new Set(ticket.validation.stars || []);

          const tierRows = cascade.tiers.map(t => `
            <tr style="${t.count > 0 ? 'background: #fefce8; font-weight: bold; color: #854d0e;' : 'color: #64748b;'}">
              <td style="padding: 6px 10px; border: 1px solid #fde047; font-weight: 600;">${t.name}</td>
              <td style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t.hits} + ${t.starHits}⭐</td>
              <td style="padding: 6px 10px; border: 1px solid #fde047; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${t.count > 0 ? '#a16207' : '#64748b'};">${t.count}</td>
            </tr>
          `).join('');

          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#2563eb' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">${t('tickets.masEstrella')}</span>
                  ${starSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningStarSet.has(r) ? '#eab308' : '#fef08a'}; color: ${winningStarSet.has(r) ? '#000' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
              const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
              const hitClass = (hits >= 2 || (hits >= 1 && starHits >= 2) || starHits >= 2) ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits');
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1, 2]);

              const comboBalls = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#2563eb' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningStarSet.has(r) ? '#eab308' : '#fef08a'}; color: ${winningStarSet.has(r) ? '#000' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('');

              return `
                <div class="saved-combination" style="margin-bottom: 8px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">${t('tickets.masEstrella')}</span>
                    ${starBalls}
                  </div>
                  <div class="hit-count ${hitClass}">${hits} + ${starHits}⭐ ${t('tickets.aciertos')}</div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fefce8; border: 1.5px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.euromillones.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                <span style="background: #eab308; color: #000; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
              </div>

              ${combinationsListHTML}

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #fef08a; color: #713f12; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: left;">${t('tickets.categoria')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #ca8a04; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>${t('tickets.totalApuestasPremiadas')}</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} ${t('tickets.apuestaSufijo')}</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
        } else {
          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">${t('tickets.masEstrella')}</span>
                  ${starSuperset.map(r => `<div class="saved-combination-number" style="background: #eab308; color: #000; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1, 2]);
              const comboBalls = combo.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: #eab308; color: #000; font-weight: bold;">${r}</div>`).join('');
              return `
                <div class="saved-combination" style="margin-bottom: 6px;">
                  <div class="saved-combination-content" style="flex-wrap: gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">${t('tickets.masEstrella')}</span>
                    ${starBalls}
                  </div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.euromillones.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
              </div>
              ${combinationsListHTML}
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
        }
      } else if (ticket.gameId === 'eurodreams') {
        const isMultipleTicket = ticket.strategy === 'multiple' ||
          (ticket.combinations.length > 0 && ticket.combinations[0].length > (GAMES[ticket.gameId]?.maxNumbers || 6));
        const superset = ticket.combinations[0] || [];
        const dreamSuperset = ticket.stars ? ticket.stars[0] : [1];
        const costData = this.calculateTicketCost(ticket);

        if (ticket.validation) {
          const cascade = this.calculateEurodreamsCascade(
            ticket,
            ticket.validation.winningNumbers,
            ticket.validation.stars || []
          );

          const winningWhiteSet = new Set(ticket.validation.winningNumbers);
          const winningDreamSet = new Set(ticket.validation.stars || []);

          const tierRows = cascade.tiers.map(t => `
            <tr style="${t.count > 0 ? 'background: #f0f9ff; font-weight: bold; color: #0369a1;' : 'color: #64748b;'}">
              <td style="padding: 6px 10px; border: 1px solid #bae6fd; font-weight: 600;">${t.name}</td>
              <td style="padding: 6px 10px; border: 1px solid #bae6fd; text-align: center;">${t.hits} + ${t.starHits}🌙</td>
              <td style="padding: 6px 10px; border: 1px solid #bae6fd; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${t.count > 0 ? '#0284c7' : '#64748b'};">${t.count}</td>
            </tr>
          `).join('');

          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#0284c7' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                  ${dreamSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningDreamSet.has(r) ? '#38bdf8' : '#e0f2fe'}; color: ${winningDreamSet.has(r) ? '#fff' : '#0369a1'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
              const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
              const hitClass = (hits >= 2 || starHits >= 1) ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits');
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);

              const comboBalls = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#0284c7' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningDreamSet.has(r) ? '#38bdf8' : '#e0f2fe'}; color: ${winningDreamSet.has(r) ? '#fff' : '#0369a1'}; font-weight: bold;">${r}</div>`).join('');

              return `
                <div class="saved-combination" style="margin-bottom: 8px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                    ${starBalls}
                  </div>
                  <div class="hit-count ${hitClass}">${hits} + ${starHits}🌙 ${t('tickets.aciertos')}</div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #f0f9ff; border: 1.5px solid #38bdf8; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #0369a1; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.eurodreams.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                <span style="background: #38bdf8; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
              </div>

              ${combinationsListHTML}

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #bae6fd; color: #0369a1; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: left;">${t('tickets.categoria')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #0284c7; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>${t('tickets.totalApuestasPremiadas')}</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} ${t('tickets.apuestaSufijo')}</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
        } else {
          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                  ${dreamSuperset.map(r => `<div class="saved-combination-number" style="background: #38bdf8; color: #fff; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [1]);
              const comboBalls = combo.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: #38bdf8; color: #fff; font-weight: bold;">${r}</div>`).join('');
              return `
                <div class="saved-combination" style="margin-bottom: 6px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                    ${starBalls}
                  </div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #0369a1; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.eurodreams.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
              </div>
              ${combinationsListHTML}
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
        }
      } else if (ticket.gameId === 'gordo') {
        const isMultipleTicket = ticket.strategy === 'multiple' ||
          (ticket.combinations.length > 0 && ticket.combinations[0].length > (GAMES[ticket.gameId]?.maxNumbers || 5));
        const superset = ticket.combinations[0] || [];
        const claveSuperset = ticket.stars ? ticket.stars[0] : [0];
        const costData = this.calculateTicketCost(ticket);

        if (ticket.validation) {
          const cascade = this.calculateGordoCascade(
            ticket,
            ticket.validation.winningNumbers,
            ticket.validation.stars || []
          );

          const winningWhiteSet = new Set(ticket.validation.winningNumbers);
          const winningClaveSet = new Set(ticket.validation.stars || []);

          const tierRows = cascade.tiers.map(t => `
            <tr style="${t.count > 0 ? 'background: #faf5ff; font-weight: bold; color: #6b21a8;' : 'color: #64748b;'}">
              <td style="padding: 6px 10px; border: 1px solid #e9d5ff; font-weight: 600;">${t.name}</td>
              <td style="padding: 6px 10px; border: 1px solid #e9d5ff; text-align: center;">${t.hits} + ${t.starHits}🔑</td>
              <td style="padding: 6px 10px; border: 1px solid #e9d5ff; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${t.count > 0 ? '#7e22ce' : '#64748b'};">${t.count}</td>
            </tr>
          `).join('');

          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#7e22ce' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">${t('tickets.masLlave')}</span>
                  ${claveSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningClaveSet.has(r) ? '#a855f7' : '#f3e8ff'}; color: ${winningClaveSet.has(r) ? '#fff' : '#6b21a8'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
              const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
              const hitClass = (hits >= 2 || starHits >= 1) ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits');
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [0]);

              const comboBalls = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#7e22ce' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningClaveSet.has(r) ? '#a855f7' : '#f3e8ff'}; color: ${winningClaveSet.has(r) ? '#fff' : '#6b21a8'}; font-weight: bold;">${r}</div>`).join('');

              return `
                <div class="saved-combination" style="margin-bottom: 8px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">${t('tickets.masLlave')}</span>
                    ${starBalls}
                  </div>
                  <div class="hit-count ${hitClass}">${hits} + ${starHits}🔑 ${t('tickets.aciertos')}</div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #faf5ff; border: 1.5px solid #c084fc; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #6b21a8; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.gordo.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                <span style="background: #a855f7; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
              </div>

              ${combinationsListHTML}

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #e9d5ff; color: #6b21a8; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: left;">${t('tickets.categoria')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #7e22ce; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>${t('tickets.totalApuestasPremiadas')}</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} ${t('tickets.apuestaSufijo')}</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
        } else {
          let combinationsListHTML = '';
          if (isMultipleTicket) {
            combinationsListHTML = `
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">${t('tickets.masLlave')}</span>
                  ${claveSuperset.map(r => `<div class="saved-combination-number" style="background: #a855f7; color: #fff; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            combinationsListHTML = ticket.combinations.map((combo, index) => {
              const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : [0]);
              const comboBalls = combo.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('');
              const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: #a855f7; color: #fff; font-weight: bold;">${r}</div>`).join('');
              return `
                <div class="saved-combination" style="margin-bottom: 6px;">
                  <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
                    ${comboBalls}
                    <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">${t('tickets.masLlave')}</span>
                    ${starBalls}
                  </div>
                </div>
              `;
            }).join('');
          }

          combosHTML = `
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #6b21a8; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>${t('tickets.gordo.nombre')} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
              </div>
              ${combinationsListHTML}
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
        }
      } else if (isSystemTicket) {
          // === VISUALIZACIÓN MÚLTIPLE ===
          const colors = gameColors[ticket.gameId || 'bonoloto'] || gameColors.bonoloto;
          const superset = ticket.combinations[0];
          let summaryTableHTML = '';
          let validationStatusBtn = `<button class="validate">${t('tickets.validar')}</button>`;

          if (ticket.validation) {
             const winningNumbersSet = new Set(ticket.validation.winningNumbers);
             validationStatusBtn = `<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;

             // Generate breakdown summary
             const explodedCombos = this.getCombinations(superset, 6);
             const breakdown = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
             explodedCombos.forEach(c => {
                 const hits = c.filter(n => winningNumbersSet.has(n)).length;
                 (breakdown as any)[hits]++;
             });
             
             const totalMatchesInSuperset = superset.filter(n => winningNumbersSet.has(n)).length;
             
             summaryTableHTML = `
                <div style="margin-top: 10px; margin-bottom: 8px; font-weight: bold; color: ${colors.accent};">
                    🎯 ${totalMatchesInSuperset} aciertos sobre los ${superset.length} números seleccionados.
                </div>
                <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                    <thead>
                      <tr style="background: ${colors.rowBg}; color: ${colors.headerText}; font-size: 0.8rem;">
                          <th style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: left;">Aciertos</th>
                          <th style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center;">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style="${breakdown[6] > 0 ? `background: ${colors.rowBg}; font-weight: bold; color: ${colors.headerText};` : 'color: #64748b;'}"><td style="padding: 6px 10px; border: 1px solid ${colors.border};">6 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800; color: ${breakdown[6] > 0 ? colors.accent : '#64748b'};">${breakdown[6]}</td></tr>
                      <tr style="${breakdown[5] > 0 ? `background: ${colors.rowBg}; font-weight: bold; color: ${colors.headerText};` : 'color: #64748b;'}"><td style="padding: 6px 10px; border: 1px solid ${colors.border};">5 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800; color: ${breakdown[5] > 0 ? colors.accent : '#64748b'};">${breakdown[5]}</td></tr>
                      <tr style="${breakdown[4] > 0 ? `background: ${colors.rowBg}; font-weight: bold; color: ${colors.headerText};` : 'color: #64748b;'}"><td style="padding: 6px 10px; border: 1px solid ${colors.border};">4 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800; color: ${breakdown[4] > 0 ? colors.accent : '#64748b'};">${breakdown[4]}</td></tr>
                      <tr style="${breakdown[3] > 0 ? `background: ${colors.rowBg}; font-weight: bold; color: ${colors.headerText};` : 'color: #64748b;'}"><td style="padding: 6px 10px; border: 1px solid ${colors.border};">3 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800; color: ${breakdown[3] > 0 ? colors.accent : '#64748b'};">${breakdown[3]}</td></tr>
                      <tr style="color: #64748b;"><td style="padding: 6px 10px; border: 1px solid ${colors.border};">0-2 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800;">${breakdown[0]+breakdown[1]+breakdown[2]}</td></tr>
                    </tbody>
                </table>
             `;
             
             // Highlight matching balls in the main display
             combosHTML = `
                <div style="background: ${colors.bg}; border: 1.5px solid ${colors.border}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
                  <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span>${t(`tickets.${ticket.gameId || 'bonoloto'}.nombre`)} (${explodedCombos.length} ${t('tickets.apuestasParentesis')})</span>
                    <span style="background: ${colors.accent}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.multipleDe')} ${superset.length}</span>
                  </div>
                  <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                      <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                          ${superset.map(n => `<div class="saved-combination-number ${winningNumbersSet.has(n) ? 'selected' : ''}">${n}</div>`).join('')}
                      </div>
                  </div>
                  ${summaryTableHTML}
                </div>
             `;

          } else {
             // Not validated yet
             const explodedCombos = this.getCombinations(superset, 6);
             combosHTML = `
                <div style="background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
                  <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span>${t(`tickets.${ticket.gameId || 'bonoloto'}.nombre`)} (${explodedCombos.length} ${t('tickets.apuestasParentesis')})</span>
                    <span style="background: ${colors.accent}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.multipleDe')} ${superset.length}</span>
                  </div>
                  <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                      <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                          ${superset.map(n => `<div class="saved-combination-number">${n}</div>`).join('')}
                      </div>
                  </div>
                </div>
             `;
          }
          
          actionsHTML = `${playOnlineHTML}${validationStatusBtn}`;

      } else {
          // === VISUALIZACIÓN ESTÁNDAR (SIMPLE / GANADORA) ===
          const colors = gameColors[ticket.gameId || 'bonoloto'] || gameColors.bonoloto;
          const costData = this.calculateTicketCost(ticket);

          if (ticket.validation) {
            const winningNumbersSet = new Set(ticket.validation.winningNumbers);
            const winningStarsSet = new Set(ticket.validation.stars || []);
            
            const combosListHTML = ticket.combinations.map((combo, index) => {
                const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
                const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;
                const hitClass = hits >= 3 ? 'high-hits' : hits > 0 ? 'low-hits' : 'no-hits';
                
                let comboHTML = '';
                if (ticket.gameId === 'nacional') {
                  const digits = [0, 0, 0, 0, 0];
                  combo.forEach(n => {
                    const col = Math.floor(n / 10) - 1;
                    if (col >= 0 && col < 5) digits[col] = n % 10;
                  });
                  comboHTML = digits.map((digit, col) => {
                    const encodedNum = (col + 1) * 10 + digit;
                    const isSelected = winningNumbersSet.has(encodedNum);
                    return `<div class="saved-combination-number ${isSelected ? 'selected' : ''}" style="border-radius: 4px; font-weight: bold; background: ${isSelected ? 'var(--secondary)' : '#f1f5f9'}; border: 1px solid #cbd5e1; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; color: ${isSelected ? '#fff' : '#1f2937'};">${digit}</div>`;
                  }).join('');
                } else {
                  comboHTML = combo.map(n => `<div class="saved-combination-number ${winningNumbersSet.has(n) ? 'selected' : ''}">${n}</div>`).join('');
                }
                
                if (ticket.stars && ticket.stars[index] && ticket.stars[index].length > 0) {
                    comboHTML += `<span style="margin: 0 4px; color: #9ca3af; font-weight: bold;">+</span>`;
                    comboHTML += ticket.stars[index].map(n => `<div class="saved-combination-number ${winningStarsSet.has(n) ? 'selected' : ''}" style="background: ${winningStarsSet.has(n) ? 'linear-gradient(135deg, #ffd700, #ffa000)' : '#fbbf24'}; color: #000;">${n}</div>`).join('');
                }

                const starHitsText = starHits > 0 ? ` + ${starHits}⭐` : '';
                return `<div class="saved-combination" style="margin-bottom: 8px;">
                            <div class="saved-combination-content">${comboHTML}</div>
                            <div class="hit-count ${hitClass}">${hits}${starHitsText} ${t('tickets.aciertos')}</div>
                        </div>`;
            }).join('');

            // Tiers summary table for standard games (Bonoloto, Primitiva, Nacional)
            const winningTiers = getTicketWinningTiers(ticket);
            let winningTiersTableHTML = '';

            if (winningTiers.length > 0) {
              const totalWinningBets = winningTiers.reduce((acc, t) => acc + t.count, 0);
              const tierRows = winningTiers.map(t => `
                <tr style="background: ${colors.rowBg}; font-weight: bold; color: ${colors.headerText};">
                  <td style="padding: 6px 10px; border: 1px solid ${colors.border}; font-weight: 600;">${t.label}</td>
                  <td style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${colors.accent};">${t.count}</td>
                </tr>
              `).join('');

              winningTiersTableHTML = `
                <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 10px; margin-bottom: 8px;">
                  <thead>
                    <tr style="background: ${colors.rowBg}; color: ${colors.headerText}; font-size: 0.8rem;">
                      <th style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: left;">${t('tickets.categoria')}</th>
                      <th style="padding: 6px 10px; border: 1px solid ${colors.border}; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tierRows}
                  </tbody>
                </table>
                <div style="padding: 10px 12px; background: ${colors.accent}; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                  <span>${t('tickets.totalApuestasPremiadas')}</span>
                  <span style="font-size: 1.1rem; color: #fef08a;">${totalWinningBets} ${t('tickets.apuestaSufijo')}</span>
                </div>
              `;
            }

            combosHTML = `
              <div style="background: ${colors.bg}; border: 1.5px solid ${colors.border}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
                <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                  <span>${t(`tickets.${ticket.gameId || 'bonoloto'}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                  ${winningTiers.length > 0 ? `<span style="background: ${colors.accent}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>` : ''}
                </div>
                ${combosListHTML}
                ${winningTiersTableHTML}
              </div>
            `;
            actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>${t('tickets.verificado')}</button>`;
          } else {
            const combosListHTML = ticket.combinations.map((combo, index) => {
                let comboHTML = '';
                if (ticket.gameId === 'nacional') {
                  const digits = [0, 0, 0, 0, 0];
                  combo.forEach(n => {
                    const col = Math.floor(n / 10) - 1;
                    if (col >= 0 && col < 5) digits[col] = n % 10;
                  });
                  comboHTML = digits.map(digit => `<div class="saved-combination-number" style="border-radius: 4px; font-weight: bold; background: #f1f5f9; border: 1px solid #cbd5e1; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; color: #1f2937;">${digit}</div>`).join('');
                } else {
                  comboHTML = combo.map(n => `<div class="saved-combination-number">${n}</div>`).join('');
                }
                if (ticket.stars && ticket.stars[index] && ticket.stars[index].length > 0) {
                    comboHTML += `<span style="margin: 0 4px; color: #9ca3af; font-weight: bold;">+</span>`;
                    comboHTML += ticket.stars[index].map(n => `<div class="saved-combination-number" style="background: #fbbf24; color: #000;">${n}</div>`).join('');
                }
                return `<div class="saved-combination" style="margin-bottom: 6px;"><div class="saved-combination-content">${comboHTML}</div></div>`;
            }).join('');

            combosHTML = `
              <div style="background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
                <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                  <span>${t(`tickets.${ticket.gameId || 'bonoloto'}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
                </div>
                ${combosListHTML}
              </div>
            `;
            actionsHTML = `${playOnlineHTML}<button class="validate">${t('tickets.validar')}</button>`;
          }
      }
      
      item.innerHTML = `
        <div class="saved-ticket-header">
            <div>
              <span class="saved-ticket-date">${new Date(ticket.date).toLocaleString()}</span>
              ${drawDateHTML}
            </div>
            <div class="saved-ticket-actions">
              ${actionsHTML}
              <button class="delete-btn">X</button>
              <button class="toggle-btn">+</button>
            </div>
        </div>
        ${prizeBannerHTML}
        <div class="saved-ticket-details">
            ${strategyHTML}
        </div>
        <div class="saved-combinations">${combosHTML}</div>`;
      
      item.querySelector('.delete-btn')?.addEventListener('click', () => this.deleteTicket(ticket.date));
      item.querySelector('.play-online-btn-saved')?.addEventListener('click', () => this.playTicketOnline(ticket));
      const validateBtn = item.querySelector('.validate:not(.verified)');
      if(validateBtn) {
          validateBtn.addEventListener('click', () => this.startValidation(ticket.date));
      }
      item.querySelector('.toggle-btn')?.addEventListener('click', (e) => {
          const comboDiv = item.querySelector('.saved-combinations') as HTMLElement;
          const target = e.target as HTMLElement;
          if (!comboDiv || !target) return;
          const isVisible = comboDiv.style.display === 'block';
          comboDiv.style.display = isVisible ? 'none' : 'block';
          target.textContent = isVisible ? '+' : '-';
      });
      container.appendChild(item);
    });

    if (hasUnreadChanged) {
      this.saveState();
    }
    this.updateSavedTicketsBadge();
  }

  autoValidateSavedTickets() {
    if (!this.historicalData || this.historicalData.length === 0) return;

    let validatedCount = 0;
    const winningTiersMap = new Map<string, number>();
    const historicalDrawsByDate: { [key: string]: { numbers: number[], stars?: number[] } } = {};
    this.historicalData.forEach(draw => {
        const drawDateStr = new Date(draw.date.getTime() - (draw.date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        historicalDrawsByDate[drawDateStr] = { numbers: draw.numbers, stars: draw.stars };
    });

    this.savedTickets.forEach(ticket => {
        if (ticket.validation) return; 

        // Compatibility check: Only validate tickets from the current game
        if (ticket.gameId && ticket.gameId !== this.currentGame.id) return;

        let winningData: { numbers: number[], stars?: number[] } | null = null;

        if (ticket.drawDate) {
            if (historicalDrawsByDate[ticket.drawDate]) {
                winningData = historicalDrawsByDate[ticket.drawDate];
            }
        } else {
            const ticketCreationDate = new Date(ticket.date);
            const sortedDrawDates = Object.keys(historicalDrawsByDate).sort();
            const matchingDrawDateStr = sortedDrawDates.find(drawDateStr => {
                const drawDate = new Date(drawDateStr + 'T00:00:00');
                return drawDate >= ticketCreationDate;
            });
            
            if (matchingDrawDateStr) {
                winningData = historicalDrawsByDate[matchingDrawDateStr];
            }
        }

        if (winningData) {
            const winningNumbers = winningData.numbers;
            const winningStars = winningData.stars || [];
            const valData = this.getTicketValidationData(ticket, winningNumbers, winningStars);

            ticket.validation = {
                winningNumbers,
                stars: winningStars.length > 0 ? winningStars : undefined,
                hits: valData.allHits,
                starHits: valData.starHits
            };
            ticket.seenValidation = false;
            const prizeSummary = this.getTicketPrizeSummary(ticket);
            if (prizeSummary.hasPrize) {
                ticket.seenWinning = false;
                const tiers = getTicketWinningTiers(ticket);
                tiers.forEach(tier => {
                    winningTiersMap.set(tier.label, (winningTiersMap.get(tier.label) || 0) + tier.count);
                });
            }
            validatedCount++;

            // Telemetry
            let prizeNotice = `${valData.maxHits} aciertos`;
            if (valData.maxStars > 0) prizeNotice += ` + ${valData.maxStars} ⭐`;
            this.sendTelemetry('validate_ticket', {
                gameId: valData.gameId,
                allHits: valData.allHits,
                maxHits: valData.maxHits,
                maxStars: valData.maxStars,
                stars: valData.starHits,
                prizeNotice: prizeNotice,
                drawDate: ticket.drawDate || 'Auto-validado',
                combinationsCount: valData.allHits.length
            });
        }
    });

    if (validatedCount > 0) {
        this.saveState();
        this.updateSavedTickets();
        this.updateSavedTicketsBadge();
        this.showToast(t('toast.boletosValidadosAuto', { count: validatedCount }), 'success');
        if (winningTiersMap.size > 0) {
            const resumenString = Array.from(winningTiersMap.entries())
                .map(([label, count]) => `${count}x (${label})`)
                .join(', ');
            this.showToast(t('toast.boletosPremiadosAuto', { resumen: resumenString }), 'success', 10000);
        }
    } else {
        this.updateSavedTicketsBadge();
    }
  }

  startValidation(date: string) {
    this.currentValidatingTicket = this.savedTickets.find(t => t.date === date) || null;
    if (!this.currentValidatingTicket) return;
    
    const winningStarsInputSection = document.getElementById('winningStarsInputSection');
    const winningStarsLabel = document.getElementById('winningStarsLabel');
    const winningStarsInput = document.getElementById('winningStarsInput') as HTMLInputElement;
    
    if (winningStarsInputSection) {
        const gameId = this.currentValidatingTicket.gameId || 'bonoloto';
        const game = GAMES[gameId];
        const maxStars = game?.maxStars || 0;
        
        if (maxStars > 0) {
            winningStarsInputSection.style.display = 'block';
            if (winningStarsLabel && winningStarsInput) {
                if (gameId === 'gordo') {
                    winningStarsLabel.innerHTML = t('validation.estrellasLabel.gordo');
                    winningStarsInput.placeholder = t('validation.estrellasPlaceholder.gordo');
                } else if (gameId === 'eurodreams') {
                    winningStarsLabel.innerHTML = t('validation.estrellasLabel.eurodreams');
                    winningStarsInput.placeholder = t('validation.estrellasPlaceholder.eurodreams');
                } else {
                    winningStarsLabel.innerHTML = t('validation.estrellasLabel.generico');
                    winningStarsInput.placeholder = t('validation.estrellasPlaceholder.generico');
                }
            }
        } else {
            winningStarsInputSection.style.display = 'none';
        }
    }

    const validationResults = document.getElementById('validationResults');
    if(validationResults) validationResults.innerHTML = '';
    const winningNumbersInput = document.getElementById('winningNumbersInput') as HTMLInputElement;
    if(winningNumbersInput) winningNumbersInput.value = '';
    if(winningStarsInput) winningStarsInput.value = '';
    this.toggleModal('validationModal', true);
  }
  confirmValidation() {
    const inputEl = document.getElementById('winningNumbersInput') as HTMLInputElement;
    const starsInputEl = document.getElementById('winningStarsInput') as HTMLInputElement;
    if (!inputEl || !this.currentValidatingTicket) return;
    
    const gameId = this.currentValidatingTicket.gameId || 'datalotto49';
    const game = GAMES[gameId];
    const maxNumbers = game?.maxNumbers || 6;
    const maxStars = game?.maxStars || 0;
    const numberRange = game?.numberRange || 49;
    const starRange = game?.starRange || 0;

    let winningNumbers: number[] = [];
    if (gameId === 'nacional') {
        const valClean = inputEl.value.trim().replace(/[ ,.]+/g, '');
        if (valClean.length === 5 && /^\d+$/.test(valClean)) {
            const digits = valClean.split('').map(Number);
            winningNumbers = digits.map((digit, col) => (col + 1) * 10 + digit);
        } else {
            const parts = inputEl.value.split(/[ ,.]+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9);
            if (parts.length === 5) {
                winningNumbers = parts.map((digit, col) => (col + 1) * 10 + digit);
            }
        }
    } else {
        winningNumbers = Array.from(new Set(inputEl.value.split(/[ ,.]+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0 && n <= numberRange)));
    }

    if (winningNumbers.length !== maxNumbers) {
      const errorMsg = gameId === 'nacional' ? 
        t('toast.validacionFormatoNacional') : 
        t('toast.validacionNumerosInvalidos', { count: maxNumbers });
      this.showToast(errorMsg, 'error');
      return;
    }

    let winningStars: number[] = [];
    if (maxStars > 0 && starsInputEl) {
        const isGordo = gameId === 'gordo';
        winningStars = Array.from(new Set(starsInputEl.value.split(/[ ,.]+/).map(n => parseInt(n)).filter(n => {
            if (isNaN(n)) return false;
            if (isGordo) {
                return n >= 0 && n < starRange;
            } else {
                return n > 0 && n <= starRange;
            }
        })));
        if (winningStars.length !== maxStars) {
            const starLabelName = gameId === 'gordo' ? t('validation.estrellasErrorLabel.gordo') : (gameId === 'eurodreams' ? t('validation.estrellasErrorLabel.eurodreams') : t('validation.estrellasErrorLabel.generico', { count: maxStars }));
            this.showToast(t('toast.validacionEstrellasInvalidas', { label: starLabelName }), 'error');
            return;
        }
    }

    const ticketToUpdate = this.savedTickets.find(t => t.date === this.currentValidatingTicket!.date);
    if (ticketToUpdate) {
        const valData = this.getTicketValidationData(ticketToUpdate, winningNumbers, winningStars);

        ticketToUpdate.validation = {
            winningNumbers: winningNumbers,
            stars: winningStars.length > 0 ? winningStars : undefined,
            hits: valData.allHits,
            starHits: valData.starHits
        };
        ticketToUpdate.seenValidation = true;
        const prizeSummary = this.getTicketPrizeSummary(ticketToUpdate);
        if (prizeSummary.hasPrize) {
            ticketToUpdate.seenWinning = true;
        }
        this.saveState();
        this.updateSavedTickets();
        this.updateSavedTicketsBadge();

        // Telemetry
        let prizeNotice = `${valData.maxHits} aciertos`;
        if (valData.maxStars > 0) prizeNotice += ` + ${valData.maxStars} ⭐`;
        this.sendTelemetry('validate_ticket', {
            gameId: valData.gameId,
            allHits: valData.allHits,
            maxHits: valData.maxHits,
            maxStars: valData.maxStars,
            stars: valData.starHits,
            prizeNotice: prizeNotice,
            drawDate: ticketToUpdate.drawDate || 'Desconocida',
            combinationsCount: valData.allHits.length
        });

        this.toggleModal('validationModal', false);
        this.showToast(t('toast.boletoValidadoManualmente'), 'success');
    } else {
        this.showToast(t('toast.errorBoletoNoEncontrado'), 'error');
    }
  }
  shareTicket() {
      if (!this.currentTicket) return;
      const text = t('ticket.shareTextTemplate', { combos: this.currentTicket.combinations.map(c => c.join(' - ')).join('\n') });
      if (navigator.share) {
          navigator.share({ title: 'Mi Boleto DataLotto', text }).catch(console.error);
      } else {
          navigator.clipboard.writeText(text).then(() => this.showToast(t('toast.boletoCopiado'), 'success'));
      }
  }

  async parseJackpotsCsvDirectly(): Promise<any[]> {
    const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcKUCZOa3NM7dBYXOzWO94y51x6RFT6jUCrTYpoLBlKAztGTbbxnygcC8pg47RScEMuVquZOX8iLCt/pub?output=csv";
    const res = await fetch(csvUrl, { method: "GET", headers: { "Accept": "text/csv; charset=utf-8" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) throw new Error("CSV vacío");

    const parseCsvRow = (rowStr: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < rowStr.length; i++) {
        const char = rowStr[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const parseBoteNumber = (boteStr: string): number => {
      if (!boteStr) return 0;
      const lower = boteStr.toLowerCase();
      if (lower.includes("no disponible") || lower.includes("consultar")) return 0;

      let multiplier = 1;
      if (lower.includes("billion") || lower.includes("billon") || lower.includes("billón")) {
        multiplier = 1000000000;
      } else if (lower.includes("million") || lower.includes("millon") || lower.includes("millón")) {
        multiplier = 1000000;
      }

      const cleanStr = lower.replace(/[^0-9,.]/g, "");
      if (!cleanStr) return 0;

      if (multiplier > 1) {
        const cleanNum = cleanStr.replace(',', '.');
        return (parseFloat(cleanNum) || 0) * multiplier;
      } else {
        const parts = cleanStr.split(',');
        const integerPart = parts[0].replace(/\./g, "");
        return parseInt(integerPart, 10) || 0;
      }
    };

    const jackpotsMap: { [id: string]: { id: string; juego: string; bote: number; fecha: string } } = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i]);
      if (cols.length < 3) continue;
      const juegoName = cols[0];
      const fecha = cols[1];
      const boteStr = cols[2];
      const lowerName = juegoName.toLowerCase();

      let id = "";
      if (lowerName.includes("powerball") || lowerName.includes("power")) id = "powerball";
      else if (lowerName.includes("mega") || lowerName.includes("millions")) id = "megamillions";
      else if (lowerName.includes("euromillones") || (lowerName.includes("euro") && lowerName.includes("mill"))) id = "euromillones";
      else if (lowerName.includes("primitiva") && !lowerName.includes("gordo")) id = "primitiva";
      else if (lowerName.includes("gordo")) id = "gordo";
      else if (lowerName.includes("eurodreams") || lowerName.includes("dreams")) id = "eurodreams";
      else if (lowerName.includes("bonoloto")) id = "bonoloto";
      else if (lowerName.includes("nacional")) id = "nacional";

      if (id) {
        const bote = parseBoteNumber(boteStr);
        jackpotsMap[id] = { id, juego: juegoName, bote, fecha };
      }
    }

    const supportedGameIds = ["powerball", "megamillions", "euromillones", "primitiva", "gordo", "eurodreams", "bonoloto", "nacional"];
    const gameNames: { [id: string]: string } = {
      powerball: "Powerball (EE. UU.)",
      megamillions: "Mega Millions (EE. UU.)",
      euromillones: "EuroMillones",
      primitiva: "La Primitiva",
      gordo: "El Gordo de la Primitiva",
      eurodreams: "EuroDreams",
      bonoloto: "BonoLoto",
      nacional: "Lotería Nacional"
    };

    const fallbackBotes: { [id: string]: number } = {
      powerball: 95000000,
      megamillions: 110000000,
      euromillones: 89000000,
      primitiva: 47000000,
      gordo: 11900000,
      eurodreams: 7200000,
      bonoloto: 2800000,
      nacional: 30000
    };

    return supportedGameIds.map(id => {
      if (jackpotsMap[id] && jackpotsMap[id].bote > 0) {
        return jackpotsMap[id];
      }
      return {
        id,
        juego: gameNames[id] || id,
        bote: jackpotsMap[id]?.bote || fallbackBotes[id] || 0,
        fecha: jackpotsMap[id]?.fecha || t('jackpots.proximoSorteoFallback')
      };
    });
  }

  async fetchAndRenderJackpots(force = false) {
    const tableBody = document.getElementById('jackpotsTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 30px; text-align: center; color: #94a3b8;">
          <div class="loading-spinner" style="margin: 0 auto 10px auto; width: 24px; height: 24px;"></div>
          ${t('jackpots.conectando')}
        </td>
      </tr>
    `;
    
    try {
      let jackpots: any[] = [];
      let isFallback = false;

      try {
        const response = await fetch(this.getApiUrl(`/api/jackpots${force ? '?refresh=true' : ''}`));
        const result = await response.json();
        if (result.success && result.data && Array.isArray(result.data)) {
          jackpots = result.data;
          (this as any).lastJackpotsData = jackpots;
          isFallback = result.isFallback || false;
        } else {
          throw new Error('API return structure invalid');
        }
      } catch (apiErr) {
        console.warn('API jackpots endpoint unreachable, attempting direct Google Sheets fetch:', apiErr);
        jackpots = await this.parseJackpotsCsvDirectly();
        (this as any).lastJackpotsData = jackpots;
      }
      
      this.updateCalculatorJackpotValue();
      this.updateCalculatorResults();
      
      // Probabilities of first-tier prizes
      const probabilities: { [key: string]: number } = {
        'powerball': 1 / 292201338,
        'megamillions': 1 / 302575350,
        'bonoloto': 1 / 13983816,
        'primitiva': 1 / 139838160,
        'gordo': 1 / 31625100,
        'euromillones': 1 / 139838160,
        'eurodreams': 1 / 23030000,
        'nacional': 1 / 100000
      };
      
      const ticketPrices: { [key: string]: number } = {
        'powerball': 2.00,
        'megamillions': 2.00,
        'bonoloto': 0.50,
        'primitiva': 1.00,
        'gordo': 1.50,
        'euromillones': 2.50,
        'eurodreams': 2.50,
        'nacional': 3.00
      };
      
      const ratedJackpots = jackpots.map((jk: any) => {
        const gameId = jk.id;
        const prob = probabilities[gameId] || (1 / 10000000);
        const price = ticketPrices[gameId] || 1.0;
        
        // Multiplier is 1e6 to make indices clean and comparable
        const score = (jk.bote * prob) / price;
        const scoreFriendly = Math.round(score * 1000) / 1000;
        
        let rating = t('jackpots.ratingEstandar');
        let badgeClass = 'background-color: #f1f5f9; color: #475569;';
        
        if (gameId === 'powerball' || gameId === 'megamillions') {
          if (jk.bote >= 200000000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 100000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'bonoloto') {
          if (jk.bote >= 2000000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 1000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'primitiva') {
          if (jk.bote >= 25000000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 10000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'gordo') {
          if (jk.bote >= 12000000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 7000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'euromillones') {
          if (jk.bote >= 100000000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 50000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'eurodreams') {
          if (jk.bote >= 7200000) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 4000000) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else {
          if (scoreFriendly >= 0.5) { rating = t('jackpots.ratingExcelente'); badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (scoreFriendly >= 0.2) { rating = t('jackpots.ratingBuena'); badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        }
        
        return {
          ...jk,
          score: scoreFriendly,
          rating,
          badgeClass
        };
      });
      
      const sorted = [...ratedJackpots].sort((a, b) => b.score - a.score);
      const best = sorted[0];
      
      tableBody.innerHTML = ratedJackpots.map((jk: any) => {
        const isDollar = jk.id === 'powerball' || jk.id === 'megamillions';
        const formattedBote = isDollar
          ? '$' + jk.bote.toLocaleString('en-US')
          : jk.bote.toLocaleString('es-ES') + ' €';
        const isCurrentGame = jk.id === this.currentGame.id;
        const highlightStyle = isCurrentGame ? 'background: #f0f9ff; font-weight: 600;' : '';
        const currentTag = isCurrentGame ? ` <span style="font-size: 0.7rem; background: #0284c7; color: white; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">${t('jackpots.activo')}</span>` : '';
        
        return `
          <tr style="border-bottom: 1px solid #e2e8f0; ${highlightStyle}">
            <td style="padding: 12px 15px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
              <span>${this.getGameFlag(jk.id)}</span>
              ${jk.juego}${currentTag}
            </td>
            <td style="padding: 12px 15px; font-weight: bold; color: var(--primary);">${formattedBote}</td>
            <td style="padding: 12px 15px; color: #475569;">${jk.fecha}</td>
            <td style="padding: 12px 15px; text-align: right; font-family: monospace; font-weight: 600; color: #0f766e;">${jk.score}</td>
            <td style="padding: 12px 15px; text-align: center;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; ${jk.badgeClass}">${jk.rating}</span>
            </td>
          </tr>
        `;
      }).join('');
      
      if (best) {
        const bestNameEl = document.getElementById('bestExpectationGameName');
        const bestReasonEl = document.getElementById('bestExpectationReasoning');
        
        if (bestNameEl) bestNameEl.innerHTML = `${this.getGameFlag(best.id)} ${t('jackpots.jugarA', { juego: best.juego })}`;
        if (bestReasonEl) {
          const bestBoteFormatted = best.id === 'powerball'
            ? '$' + best.bote.toLocaleString('en-US')
            : best.bote.toLocaleString('es-ES') + ' €';
          bestReasonEl.innerHTML = t('jackpots.recomendacionTexto', { bote: bestBoteFormatted, score: best.score, fecha: best.fecha });
        }
      }

      // Check for high jackpot alert banner
      this.checkHighJackpotAlert(ratedJackpots);
      
      if (isFallback) {
        this.showToast(t('toast.jackpotsFallback'), 'info');
      } else {
        this.showToast(t('toast.jackpotsActualizado'), 'success');
      }
      
    } catch (err: any) {
      console.error('Error fetching jackpots:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 30px; text-align: center; color: #ef4444;">
            ${t('jackpots.errorConexion', { message: err.message || err })}<br>
            <button class="modal-btn" id="jackpotsRetryBtn" style="margin-top:10px; background: #ef4444; color:white; border:none; padding: 4px 10px; border-radius:4px; cursor:pointer;">${t('jackpots.reintentar')}</button>
          </td>
        </tr>
      `;
      
      document.getElementById('jackpotsRetryBtn')?.addEventListener('click', () => {
        this.fetchAndRenderJackpots(true);
      });
    }
  }

  // =========================================================================
  // MODO OSCURO (DARK MODE)
  // =========================================================================
  initDarkMode() {
    const isDark = localStorage.getItem('datalotto_theme') === 'dark';
    this.applyDarkMode(isDark);
  }

  applyDarkMode(enable: boolean) {
    document.body.classList.toggle('dark-mode', enable);
    localStorage.setItem('datalotto_theme', enable ? 'dark' : 'light');
    
    const badge = document.getElementById('darkModeBadge');
    if (badge) {
      badge.textContent = enable ? 'ON' : 'OFF';
      badge.style.background = enable ? '#10b981' : 'rgba(99,102,241,0.15)';
      badge.style.color = enable ? '#ffffff' : 'var(--primary)';
    }
  }

  toggleDarkMode() {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    this.applyDarkMode(!isCurrentlyDark);
    this.showToast(!isCurrentlyDark ? t('toast.modoOscuroOn') : t('toast.modoOscuroOff'), 'info');
  }

  // =========================================================================
  // NOTIFICACIONES Y RECORDATORIOS (BEST-EFFORT) + ALERTAS DE BOTE ALTO
  // =========================================================================
  getNotificationSettings() {
    const saved = localStorage.getItem('datalotto_notifications_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      enabled: true,
      games: {
        powerball: true,
        megamillions: true,
        bonoloto: true,
        primitiva: true,
        euromillones: true,
        eurodreams: true,
        gordo: true,
        nacional: true
      },
      lastNotifiedDate: '',
      lastJackpotAlertDate: ''
    };
  }

  saveNotificationSettings(config: any) {
    localStorage.setItem('datalotto_notifications_config', JSON.stringify(config));
  }

  openNotificationsModal() {
    const config = this.getNotificationSettings();
    
    const masterSwitch = document.getElementById('notifMasterSwitch') as HTMLInputElement;
    if (masterSwitch) masterSwitch.checked = config.enabled;
    
    const gameKeys: ('powerball'|'megamillions'|'bonoloto'|'primitiva'|'euromillones'|'eurodreams'|'gordo'|'nacional')[] = ['powerball', 'megamillions', 'bonoloto', 'primitiva', 'euromillones', 'eurodreams', 'gordo', 'nacional'];
    gameKeys.forEach(gk => {
      const chk = document.getElementById(`notifGame_${gk}`) as HTMLInputElement;
      if (chk) chk.checked = config.games[gk] ?? true;
    });

    const updateNotifUIState = () => {
      const isEnabled = masterSwitch ? masterSwitch.checked : true;
      gameKeys.forEach(gk => {
        const chk = document.getElementById(`notifGame_${gk}`) as HTMLInputElement;
        if (chk) chk.disabled = !isEnabled;
      });
    };

    if (masterSwitch) {
      masterSwitch.onchange = updateNotifUIState;
      updateNotifUIState();
    }

    this.toggleModal('notificationsModal', true);
  }

  saveNotificationsFromModal() {
    const config = this.getNotificationSettings();
    
    const masterSwitch = document.getElementById('notifMasterSwitch') as HTMLInputElement;
    if (masterSwitch) config.enabled = masterSwitch.checked;
    
    const gameKeys: ('powerball'|'megamillions'|'bonoloto'|'primitiva'|'euromillones'|'eurodreams'|'gordo'|'nacional')[] = ['powerball', 'megamillions', 'bonoloto', 'primitiva', 'euromillones', 'eurodreams', 'gordo', 'nacional'];
    gameKeys.forEach(gk => {
      const chk = document.getElementById(`notifGame_${gk}`) as HTMLInputElement;
      if (chk) config.games[gk] = chk.checked;
    });

    this.saveNotificationSettings(config);
    this.toggleModal('notificationsModal', false);
    this.showToast(t('toast.recordatoriosGuardados'), 'success');

    if (config.enabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  initNotificationScheduler() {
    // Triggers daily draw notification check when the user opens the app
    setTimeout(() => {
      this.checkAndTriggerDrawNotifications();
    }, 1500);
  }

  checkAndTriggerDrawNotifications() {
    const config = this.getNotificationSettings();
    if (!config.enabled) return;

    const now = new Date();
    const currentDay = now.getDay();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Skip if we already alerted the user today upon opening the app
    if (config.lastNotifiedDate === todayStr) return;

    const allGamesList = getAllGames();
    const activeGamesToday = allGamesList.filter(game => {
      const gk = game.id;
      return config.games[gk] !== false && game.drawDays.includes(currentDay);
    });

    if (activeGamesToday.length > 0) {
      const dayNamesInSpanish = [t('common.dias.domingo'), t('common.dias.lunes'), t('common.dias.martes'), t('common.dias.miercoles'), t('common.dias.jueves'), t('common.dias.viernes'), t('common.dias.sabado')];
      const currentDayName = dayNamesInSpanish[currentDay];

      const drawLines = activeGamesToday.map(g => `• ${g.flag} ${g.fullName}`).join('\n');

      const notifTitle = t('notif.tituloSorteosHoy', { day: currentDayName, date: `${day}/${month}` });
      const notifBody = t('notif.cuerpoSorteosHoy', { lines: drawLines });

      // System notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(notifTitle, {
            body: activeGamesToday.map(g => `${g.flag} ${g.name}`).join(', '),
            icon: '/pwa-192x192.png'
          });
        } catch (e) {
          console.warn('System notification error:', e);
        }
      }

      // Show prominent in-app notification for 12 seconds
      this.showToast(`${notifTitle}\n${drawLines}`, 'info', 12000);
    }

    config.lastNotifiedDate = todayStr;
    this.saveNotificationSettings(config);
  }

  checkHighJackpotAlert(jackpots: any[]) {
    if (!jackpots || jackpots.length === 0) return;

    const highJk = jackpots.find((j: any) => j.bote >= 100000000 || j.rating === t('jackpots.ratingExcelente') || j.rating === '🌟 Excelente') || jackpots[0];

    if (highJk && (highJk.bote >= 50000000 || highJk.rating === t('jackpots.ratingExcelente') || highJk.rating === '🌟 Excelente')) {
      const banner = document.getElementById('highJackpotBannerContainer');
      const titleEl = document.getElementById('highJackpotTitle');
      const descEl = document.getElementById('highJackpotDesc');
      const playBtn = document.getElementById('highJackpotPlayBtn');
      const closeBtn = document.getElementById('highJackpotCloseBtn');

      if (banner && titleEl && descEl && playBtn) {
        const formattedBote = (highJk.bote / 1000000).toFixed(0) + 'M€';
        titleEl.textContent = t('jackpots.bannerTituloDinamico', { game: highJk.juego.toUpperCase(), bote: formattedBote });
        descEl.textContent = t('jackpots.bannerDescDinamico', { bote: highJk.bote.toLocaleString('es-ES'), rating: highJk.rating, score: highJk.score });
        banner.style.display = 'block';

        if ((this as any).highJackpotTimer) {
          clearTimeout((this as any).highJackpotTimer);
          (this as any).highJackpotTimer = null;
        }

        const closeBanner = () => {
          banner.style.display = 'none';
          if ((this as any).highJackpotTimer) {
            clearTimeout((this as any).highJackpotTimer);
            (this as any).highJackpotTimer = null;
          }
        };

        // Auto-close notification banner after 30 seconds (30,000 ms)
        (this as any).highJackpotTimer = setTimeout(() => {
          closeBanner();
        }, 30000);

        banner.onclick = () => {
          this.toggleModal('jackpotsModal', true);
          this.fetchAndRenderJackpots();
        };

        playBtn.onclick = (e) => {
          e.stopPropagation();
          this.switchGame(highJk.id);
          closeBanner();
        };

        if (closeBtn) {
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeBanner();
          };
        }
      }

      const config = this.getNotificationSettings();
      const todayStr = new Date().toISOString().split('T')[0];
      if (config.enabled && config.lastJackpotAlertDate !== todayStr && highJk.bote >= 100000000) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(t('jackpots.notifTitulo', { game: highJk.juego, amount: (highJk.bote/1e6).toFixed(0) }), {
            body: t('jackpots.notifBody'),
            icon: '/pwa-192x192.png'
          });
        }
        config.lastJackpotAlertDate = todayStr;
        this.saveNotificationSettings(config);
      }
    }
  }

  getGameFlag(gameId: string): string {
    return getGameConfig(gameId).flag;
  }

  playTicketOnline(ticket: Ticket) {
    if (!ticket || ticket.combinations.length === 0) {
        this.showToast(t('toast.noHayCombinacionesJugar'), 'warning');
        return;
    }

    // Store the ticket to play in a temporary property
    (this as any).pendingPlayTicket = ticket;
    this.renderPlayOnlineList();
    this.toggleModal('playOnlineModal', true);
  }

  confirmPlayOnline(gameKey: 'bonoloto' | 'primitiva' | 'euromillones' | 'eurodreams' | 'gordo') {
    const ticket = (this as any).pendingPlayTicket as Ticket;
    if (!ticket) return;

    let lotteryUrl = this.customGameUrls[gameKey] || '';
    if (!lotteryUrl || lotteryUrl.trim() === '') {
        // Enlace vacío! Avisamos al usuario y le permitimos escribirlo
        (this as any).pendingPlayGameKey = gameKey;
        const names: { [key: string]: string } = {
            bonoloto: '🇪🇸 Bonoloto España',
            primitiva: '🇪🇸 Primitiva España',
            gordo: '🏆 El Gordo',
            euromillones: '🇪🇺 Euromillones',
            eurodreams: '🌙 EuroDreams'
        };
        const label = document.getElementById('setUrlPromptLabel');
        if (label) {
            label.textContent = `${names[gameKey] || gameKey}:`;
        }
        const input = document.getElementById('setUrlPromptInput') as HTMLInputElement;
        if (input) {
            input.value = '';
            input.placeholder = 'https://...';
        }
        this.toggleModal('setUrlPromptModal', true);
        return;
    }

    let combosToPlay = ticket.combinations;

    if (ticket.combinations.length === 1 && ticket.combinations[0].length > 6) {
        combosToPlay = this.getCombinations(ticket.combinations[0], 6);
    }

    const formattedCombinations = combosToPlay
        .map(combo => 
            combo.sort((a, b) => a - b)
                 .map(n => String(n).padStart(2, '0'))
                 .join(' ')
        )
        .join('\n');

    navigator.clipboard.writeText(formattedCombinations)
        .then(() => {
            window.open(lotteryUrl, '_blank');
            this.toggleModal('playOnlineModal', false);
            this.showToast(t('toast.webAbierta'), 'success');
        })
        .catch(err => {
            console.error('Error al copiar al portapapeles:', err);
            this.showToast(t('toast.errorCopiarCombinaciones'), 'error');
        });
  }

  exportTickets() {
    if (this.savedTickets.length === 0) {
        this.showToast(t('toast.noHayBoletosExportar'), 'warning');
        return;
    }
    try {
        const dataStr = JSON.stringify(this.savedTickets, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `datalotto49_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(t('toast.boletosExportados'), 'success');
    } catch (error) {
        this.showToast(t('toast.errorExportarBoletos'), 'error');
        console.error('Export error:', error);
    }
  }


  // ===== HELPERS UI & GEOMETRIC/AI =====
  hasGeometricPattern(combination: number[], patternsToExclude: string[]): boolean {
      const startAt = this.currentGame?.numbersStartAt ?? this.currentGame?.startAt ?? 1;
      const coordsLookup = this.currentGame?.numbersLayout
          ? getCoordsLookup(this.currentGame.numbersLayout, this.currentGame.numberRange, startAt)
          : (this.currentGame?.gridCols || 10);
      return hasGeometricPattern(combination, patternsToExclude, coordsLookup);
  }
  isSpaced(combination: number[]): boolean {
      const startAt = this.currentGame?.numbersStartAt ?? this.currentGame?.startAt ?? 1;
      const coordsLookup = this.currentGame?.numbersLayout
          ? getCoordsLookup(this.currentGame.numbersLayout, this.currentGame.numberRange, startAt)
          : (this.currentGame?.gridCols || 10);
      return isSpaced(combination, coordsLookup);
  }
  isLine(coords: {row: number, col: number}[]): boolean {
      return isLine(coords);
  }
  isDiagonal(coords: {row: number, col: number}[]): boolean {
      return isDiagonal(coords);
  }
  showLoading(text: string) { 
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    const loadingInfo = document.getElementById('loadingInfo');
    if (loadingInfo) loadingInfo.textContent = 'Iniciando...';
    const loadingModal = document.getElementById('loadingModal') as HTMLElement;
    if (loadingModal) loadingModal.style.display = 'flex'; 
  }
  hideLoading() { 
    const loadingModal = document.getElementById('loadingModal') as HTMLElement;
    if (loadingModal) loadingModal.style.display = 'none';
  }
  showFilterSpinner() {
    const overlay = document.getElementById('filterSpinnerOverlay');
    if (overlay) overlay.classList.add('show');
  }
  hideFilterSpinner() {
    const overlay = document.getElementById('filterSpinnerOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  showToast(message: string, type = 'info', customDuration?: number, priorityOverride?: number) {
    if (!message || !message.trim()) return;

    const trimmedMsg = message.trim();
    const now = Date.now();

    // Prevent duplicate exact messages within 3 seconds to avoid queue spam
    if (!this.lastToastMessages) this.lastToastMessages = new Map();
    const lastTime = this.lastToastMessages.get(trimmedMsg) || 0;
    if (now - lastTime < 3000) {
      return;
    }
    this.lastToastMessages.set(trimmedMsg, now);

    // Clean old entries from lastToastMessages map
    if (this.lastToastMessages.size > 50) {
      this.lastToastMessages.forEach((time, msg) => {
        if (now - time > 10000) this.lastToastMessages.delete(msg);
      });
    }

    // Determine priority if not explicitly provided:
    // Priority 1: High priority (Errors, Game switch, direct user actions)
    // Priority 2: Medium priority (Database loaded, filters saved/loaded)
    // Priority 3: Low priority (Draw date reminders, tips)
    let priority = priorityOverride ?? 2;
    if (priorityOverride === undefined) {
      if (type === 'error' || type === 'warning' || trimmedMsg.startsWith('Cambiado a') || trimmedMsg.startsWith('⚡ Cambiado')) {
        priority = 1;
      } else if (trimmedMsg.includes('Cargados') || trimmedMsg.includes('Base de datos') || trimmedMsg.includes('actualizada') || trimmedMsg.includes('restablecidos') || trimmedMsg.includes('guardado')) {
        priority = 2;
      } else if (trimmedMsg.includes('se juega') || trimmedMsg.includes('Sorteo oficial') || trimmedMsg.includes('Próximo sorteo')) {
        priority = 3;
      } else {
        priority = trimmedMsg.length < 35 ? 2 : 3;
      }
    }

    if (!this.toastQueue) this.toastQueue = [];
    this.toastQueue.push({
      message: trimmedMsg,
      type,
      customDuration,
      priority,
      timestamp: now
    });

    // Sort queue: Priority 1 first, then Priority 2, Priority 3. Shorter text before longer text. Oldest timestamp first.
    this.toastQueue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.message.length !== b.message.length) return a.message.length - b.message.length;
      return a.timestamp - b.timestamp;
    });

    this.processToastQueue();
  }

  processToastQueue() {
    if (this.isToastShowing || !this.toastQueue || this.toastQueue.length === 0) return;

    const toast = document.getElementById('toast');
    if (!toast) return;

    const currentItem = this.toastQueue.shift();
    if (!currentItem) return;

    this.isToastShowing = true;
    const { message, type, customDuration } = currentItem;

    const isError = type === 'warning' || type === 'error';
    const showCloseBtn = isError || (customDuration && customDuration > 5000);

    toast.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <span style="flex: 1; white-space: pre-line;">${message}</span>
        ${showCloseBtn ? `
          <div style="display: flex; gap: 8px; justify-content: center;">
            ${isError ? `<button id="copyToastBtn" style="background: rgba(255,255,255,0.2); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem;">${t('toast.copiarBtn')}</button>` : ''}
            <button id="closeToastBtn" style="background: rgba(255,255,255,0.25); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem;">${t('tickets.cerrar')}</button>
          </div>
        ` : ''}
      </div>
    `;

    toast.className = `toast show ${type}`;

    let isDismissed = false;
    const dismiss = () => {
      if (isDismissed) return;
      isDismissed = true;

      if (this.currentToastTimer) {
        clearTimeout(this.currentToastTimer);
        this.currentToastTimer = null;
      }

      toast.className = 'toast';

      // Transition exit delay before displaying next queued message
      setTimeout(() => {
        this.isToastShowing = false;
        this.processToastQueue();
      }, 280);
    };

    document.getElementById('closeToastBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    if (isError) {
      document.getElementById('copyToastBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(message).then(() => {
          const originalText = message;
          const span = toast.querySelector('span');
          if (span) span.textContent = '¡Copiado!';
          setTimeout(() => { if (span) span.textContent = originalText; }, 2000);
        });
      });
    } else {
      toast.onclick = (e) => {
        e.stopPropagation();
        dismiss();
      };
    }

    // Dynamic comfortable reading time based on text length
    let duration = customDuration;
    if (!duration) {
      if (isError) {
        duration = 7000;
      } else {
        const charCount = message.length;
        duration = Math.max(2200, Math.min(5000, charCount * 45));
      }
    }

    this.currentToastTimer = setTimeout(() => {
      dismiss();
    }, duration);
  }

  showUITrigger(message: string) {
    const container = document.getElementById('ticket');
    if (!container) return;

    this.clearUITrigger();

    const trigger = document.createElement('div');
    trigger.id = 'uiTrigger';
    trigger.className = 'ui-trigger';
    trigger.innerHTML = message;

    // Append to the end of the ticket container (below actions)
    container.appendChild(trigger);
  }

  clearUITrigger() {
    const existing = document.getElementById('uiTrigger');
    if (existing) existing.remove();
  }
  toggleModal(id: string, show: boolean) { 
    const modal = document.getElementById(id) as HTMLElement;
    if (modal) {
      if (show) {
        if (id === 'savedTicketsModal') {
          let stateChanged = false;
          this.savedTickets.forEach(t => {
            if (t.validation && !t.seenValidation) {
              t.seenValidation = true;
              stateChanged = true;
            }
          });
          if (stateChanged) {
            this.saveState();
          }
          this.updateSavedTicketsBadge();
        }

        // Calculate z-index to be higher than other active modals
        const activeModals = Array.from(document.querySelectorAll('.modal')).filter(m => {
          const htmlM = m as HTMLElement;
          return htmlM.style.display === 'flex' && htmlM.id !== id;
        });
        let maxZ = 2000;
        activeModals.forEach(m => {
          const z = parseInt(window.getComputedStyle(m).zIndex) || 2000;
          if (z > maxZ) maxZ = z;
        });
        modal.style.zIndex = (maxZ + 50).toString();
        modal.style.display = 'flex';
      } else {
        modal.style.display = 'none';
        modal.style.zIndex = '';
      }
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menuBtn');
    const overlay = document.getElementById('overlay');
    if (!sidebar || !menuBtn || !overlay) return;

    const isOpen = sidebar.classList.toggle('open');
    menuBtn.classList.toggle('open', isOpen);
    overlay.classList.toggle('show', isOpen);

    this.updateTopTitleVisibility();
  }

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menuBtn');
    const overlay = document.getElementById('overlay');
    if (!sidebar || !menuBtn || !overlay) return;

    sidebar.classList.remove('open');
    menuBtn.classList.remove('open');
    overlay.classList.remove('show');

    this.updateTopTitleVisibility();
  }

  openConfigUrlsModal() {
    const container = document.getElementById('configUrlsContainer');
    if (container) {
        container.innerHTML = '';
        
        // Define a map for nice names and flags
        const names: { [key: string]: string } = {
            bonoloto: '🇪🇸 Bonoloto',
            primitiva: '🇪🇸 Primitiva',
            gordo: '🏆 El Gordo',
            euromillones: '🇪🇺 Euromillones',
            eurodreams: '🌙 EuroDreams',
            nacional: '🇪🇸 Lotería Nacional'
        };

        Object.keys(this.customGameUrls).forEach(key => {
            const gameName = names[key] || (key.charAt(0).toUpperCase() + key.slice(1));
            
            const group = document.createElement('div');
            group.className = 'input-group';
            group.style.display = 'flex';
            group.style.flexDirection = 'column';
            group.style.gap = '5px';
            
            const label = document.createElement('label');
            label.style.cssText = 'display: block; font-size: 0.85rem; color: var(--gray); font-weight: 600;';
            label.textContent = t('configurls.urlLabel', { game: gameName });
            
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `urlInput_${key}`;
            input.className = 'modal-input';
            input.style.width = '100%';
            input.value = this.customGameUrls[key] || '';
            input.placeholder = 'https://...';
            
            group.appendChild(label);
            group.appendChild(input);
            container.appendChild(group);
        });

        // Configuración de Servidor API Backend para Capacitor / Móvil
        const apiGroup = document.createElement('div');
        apiGroup.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 2px dashed #e2e8f0; display: flex; flex-direction: column; gap: 5px;';
        
        const apiLabel = document.createElement('label');
        apiLabel.style.cssText = 'display: block; font-size: 0.85rem; color: #2563eb; font-weight: bold;';
        apiLabel.textContent = '🖥️ Servidor API Backend (Móvil / Capacitor):';
        
        const apiHelp = document.createElement('span');
        apiHelp.style.cssText = 'font-size: 0.75rem; color: #64748b; margin-bottom: 4px;';
        apiHelp.textContent = 'Si usas la APK en Android, indica la URL de tu servidor backend para enviar correos y telemetría:';

        const apiInput = document.createElement('input');
        apiInput.type = 'text';
        apiInput.id = 'urlInput_customApiServer';
        apiInput.className = 'modal-input';
        apiInput.style.width = '100%';
        apiInput.value = localStorage.getItem('customApiServerUrl') || '';
        apiInput.placeholder = 'https://ais-pre-lcjdwvzchowyi3tetmqfya-7070977073.europe-west2.run.app';

        apiGroup.appendChild(apiLabel);
        apiGroup.appendChild(apiHelp);
        apiGroup.appendChild(apiInput);
        container.appendChild(apiGroup);
    }
    
    this.closeSidebar();
    this.toggleModal('configUrlsModal', true);
  }

  saveConfigUrls() {
    Object.keys(this.customGameUrls).forEach(key => {
        const input = document.getElementById(`urlInput_${key}`) as HTMLInputElement;
        if (input) {
            this.customGameUrls[key] = input.value;
        }
    });

    const apiInput = document.getElementById('urlInput_customApiServer') as HTMLInputElement;
    if (apiInput) {
      const val = apiInput.value.trim();
      if (val) {
        localStorage.setItem('customApiServerUrl', val);
      } else {
        localStorage.removeItem('customApiServerUrl');
      }
    }
    
    this.saveState();
    this.toggleModal('configUrlsModal', false);
    this.showToast(t('toast.enlacesGuardados'), 'success');
  }

  openContactModal() {
    this.closeSidebar();
    const messageInput = document.getElementById('contactMessage') as HTMLTextAreaElement;
    const emailInput = document.getElementById('contactEmail') as HTMLInputElement;
    const fallbackDiv = document.getElementById('contactMailtoFallback');
    if (messageInput) messageInput.value = '';
    if (emailInput) emailInput.value = '';
    if (fallbackDiv) fallbackDiv.style.display = 'none';
    this.toggleModal('contactModal', true);
  }

  async sendContactForm() {
    const messageInput = document.getElementById('contactMessage') as HTMLTextAreaElement;
    const emailInput = document.getElementById('contactEmail') as HTMLInputElement;
    const fallbackDiv = document.getElementById('contactMailtoFallback');
    const message = messageInput?.value.trim();
    const email = emailInput?.value.trim();

    if (fallbackDiv) fallbackDiv.style.display = 'none';

    if (!message) {
      this.showToast(t('toast.contactoSinMensaje'), 'warning');
      return;
    }

    const sendBtn = document.getElementById('sendContactBtn') as HTMLButtonElement;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = t('contact.enviando');
    }

    try {
      const targetUrl = this.getApiUrl('/api/contact');
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email })
      });

      const data = await response.json();

      if (response.ok) {
        this.showToast(t('toast.contactoEnviado'), 'success');
        this.toggleModal('contactModal', false);
      } else {
        throw new Error(data.error || t('contact.errorEnviarDefault'));
      }
    } catch (error: any) {
      console.error('Error enviando contacto:', error);
      let errMsg = error?.message || t('contact.errorEnviarReintentar');
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Network request failed')) {
        errMsg = `No se pudo conectar con el servidor backend (${this.getApiUrl('/api/contact')}). Verifica tu conexión o la URL del servidor en Ajustes.`;
      }
      this.showToast(`❌ ${errMsg}`, 'error');

      // Mostrar opción alternativa mailto
      if (fallbackDiv) {
        fallbackDiv.style.display = 'block';
        const mailtoBtn = document.getElementById('contactMailtoBtn') as HTMLAnchorElement;
        if (mailtoBtn) {
          const subject = encodeURIComponent("📬 Mensaje de contacto - DataLotto");
          const body = encodeURIComponent(`Mensaje:\n${message}\n\nEmail del remitente: ${email || "No especificado"}`);
          mailtoBtn.href = `mailto:datalotto49@gmail.com?subject=${subject}&body=${body}`;
        }
      }
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = t('contact.enviar');
      }
    }
  }

  toggleCollapse(targetId: string) {
    const content = document.getElementById(`${targetId}Content`);
    const btn = document.getElementById(`${targetId}CollapseBtn`);
    const bottomBtn = document.getElementById(`${targetId}BottomCollapseBtn`);
    if (content) {
        content.classList.toggle('expanded');
        const isExpanded = content.classList.contains('expanded');
        if (btn) btn.textContent = isExpanded ? '-' : '+';
        if (bottomBtn) bottomBtn.textContent = isExpanded ? '-' : '+';
    }
  }

  getFrequencyStats() {
    const isNacional = this.currentGame.id === 'nacional';
    const isGordo = this.currentGame.id === 'gordo';

    const N = this.vizTarget === 'star'
        ? this.historicalData.filter(d => d.stars && d.stars.length > 0).length
        : this.historicalData.filter(d => d.numbers && d.numbers.length > 0).length;
    
    const frequencies: { [key: number]: number } = {};
    const startNum = isNacional ? 10 : 1;
    for (let i = startNum; i <= this.currentGame.numberRange; i++) frequencies[i] = 0;
    
    this.historicalData.forEach(draw => {
        (draw.numbers || []).forEach(num => {
            if (frequencies[num] !== undefined) frequencies[num]++;
        });
    });

    const starFrequencies: { [key: number]: number } = {};
    if (this.currentGame.maxStars > 0) {
        const minStar = isGordo ? 0 : 1;
        const maxStar = isGordo ? 9 : this.currentGame.starRange;
        for (let i = minStar; i <= maxStar; i++) starFrequencies[i] = 0;
        this.historicalData.forEach(draw => {
            if (draw.stars) {
                draw.stars.forEach(star => {
                    if (starFrequencies[star] !== undefined) starFrequencies[star]++;
                });
            }
        });
    }

    let activeFreqs: { [key: number]: number } = {};
    let minKey = 1;
    let maxKey = 1;
    let prob = 0;

    if (isNacional) {
        activeFreqs = frequencies;
        minKey = 10;
        maxKey = 59;
        prob = 0.1;
    } else if (this.vizTarget === 'star') {
        activeFreqs = starFrequencies;
        minKey = isGordo ? 0 : 1;
        maxKey = isGordo ? 9 : this.currentGame.starRange;
        prob = isGordo ? 0.1 : (this.currentGame.maxStars / this.currentGame.starRange);
    } else {
        activeFreqs = frequencies;
        minKey = 1;
        maxKey = this.currentGame.numberRange;
        prob = this.currentGame.maxNumbers / this.currentGame.numberRange;
    }

    const mean = N > 0 ? N * prob : 0;
    const variance = N > 0 ? N * prob * (1 - prob) : 0;
    const sd = N > 0 ? Math.sqrt(variance) : 0;

    return { N, activeFreqs, minKey, maxKey, prob, mean, variance, sd, isNacional, isGordo };
  }

  computeChiSquare(activeFreqs: Record<number, number>, expectedPerCategory: number): {
    chiSquare: number;
    degreesOfFreedom: number;
  } {
    const observed = Object.values(activeFreqs);
    if (observed.length === 0 || expectedPerCategory <= 0) return { chiSquare: 0, degreesOfFreedom: 0 };
    const chiSquare = observed.reduce((sum, o) => sum + Math.pow(o - expectedPerCategory, 2) / expectedPerCategory, 0);
    const degreesOfFreedom = observed.length - 1;
    return { chiSquare, degreesOfFreedom };
  }

  chiSquareCriticalValue(df: number, zAlpha: number = 1.645): number {
    if (df <= 0) return 0;
    const term = 1 - (2 / (9 * df)) + zAlpha * Math.sqrt(2 / (9 * df));
    return df * Math.pow(term, 3);
  }

  renderTrendScatterChart() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    if (!container) return;

    if (!this.dataLoaded || !this.historicalData || this.historicalData.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding-top: 50px;">${t('dataviz.cargaGrafico')}</div>`;
      if (summary) summary.innerHTML = `<div style="color:#666; text-align: center; width: 100%;">${t('dataviz.cargaResumen')}</div>`;
      return;
    }

    const locale = getLocale() === 'en' ? 'en-US' : 'es-ES';
    const { points, slope, intercept } = getSumSeriesWithRegression(this.historicalData, locale);
    if (points.length === 0) return;

    const ys = points.map(p => p.y);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);
    const yPadding = Math.max(10, Math.round((rawMaxY - rawMinY) * 0.1));
    const minY = Math.max(0, rawMinY - yPadding);
    const maxY = rawMaxY + yPadding;
    const maxX = Math.max(1, points.length - 1);

    const svgWidth = 800;
    const svgHeight = 360;
    const marginTop = 30;
    const marginBottom = 50;
    const marginLeft = 55;
    const marginRight = 25;

    const chartW = svgWidth - marginLeft - marginRight;
    const chartH = svgHeight - marginTop - marginBottom;

    const scaleX = (x: number) => marginLeft + (x / maxX) * chartW;
    const scaleY = (y: number) => marginTop + chartH - ((y - minY) / Math.max(1, maxY - minY)) * chartH;

    let yTicksHTML = '';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round(minY + (i / ySteps) * (maxY - minY));
      const yPos = scaleY(val);
      yTicksHTML += `
        <line x1="${marginLeft}" y1="${yPos.toFixed(1)}" x2="${(svgWidth - marginRight).toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4" />
        <text x="${(marginLeft - 8).toFixed(1)}" y="${(yPos + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${val}</text>
      `;
    }

    const circlesHTML = points.map(p => {
      const cx = scaleX(p.x);
      const cy = scaleY(p.y);
      const titleText = `${p.date ? p.date + ' | ' : ''}${t('dataviz.tooltipPunto', { n: p.x + 1, sum: p.y })}`;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#64748b" opacity="0.65"><title>${titleText}</title></circle>`;
    }).join('');

    const x0 = 0;
    const y0 = intercept;
    const x1 = maxX;
    const y1 = slope * maxX + intercept;
    const regLineHTML = `<line x1="${scaleX(x0).toFixed(1)}" y1="${scaleY(y0).toFixed(1)}" x2="${scaleX(x1).toFixed(1)}" y2="${scaleY(y1).toFixed(1)}" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>`;

    const firstLabel = points[0]?.date || '#1';
    const midIndex = Math.floor(points.length / 2);
    const midLabel = points[midIndex]?.date || `#${midIndex + 1}`;
    const lastLabel = points[points.length - 1]?.date || `#${points.length}`;

    const xTicksHTML = `
      <text x="${marginLeft}" y="${svgHeight - 15}" font-size="11" fill="#64748b" text-anchor="start">${firstLabel}</text>
      <text x="${(marginLeft + chartW / 2).toFixed(1)}" y="${svgHeight - 15}" font-size="11" fill="#64748b" text-anchor="middle">${midLabel}</text>
      <text x="${svgWidth - marginRight}" y="${svgHeight - 15}" font-size="11" fill="#64748b" text-anchor="end">${lastLabel}</text>
    `;

    const axesHTML = `
      <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
      <line x1="${marginLeft}" y1="${marginTop + chartH}" x2="${svgWidth - marginRight}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
    `;

    container.innerHTML = `
      <div style="width: 100%; overflow-x: auto;">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: auto; max-height: 400px; display: block; background: #ffffff; font-family: system-ui, sans-serif;">
          ${yTicksHTML}
          ${axesHTML}
          ${circlesHTML}
          ${regLineHTML}
          ${xTicksHTML}
        </svg>
      </div>
    `;

    if (summary) {
      const formattedSlope = (slope >= 0 ? '+' : '') + slope.toFixed(4);
      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
          <div style="font-weight: 700; color: #1e293b; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
            <span>📈 ${t('dataviz.tendenciaResumen', { slope: formattedSlope })}</span>
            <span style="font-size: 0.85rem; padding: 2px 8px; border-radius: 6px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">${t('dataviz.pendienteLabel', { slope: formattedSlope })}</span>
          </div>
          <div style="font-size: 0.82rem; color: #64748b; font-style: italic; line-height: 1.4;">
            ${t('dataviz.tendenciaAviso')}
          </div>
        </div>
      `;
    }
  }

  renderChiSquareCard() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    if (!container) return;

    if (!this.dataLoaded || !this.historicalData || this.historicalData.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding-top: 50px;">${t('dataviz.cargaGrafico')}</div>`;
      if (summary) summary.innerHTML = `<div style="color:#666; text-align: center; width: 100%;">${t('dataviz.cargaResumen')}</div>`;
      return;
    }

    const { activeFreqs, mean, N } = this.getFrequencyStats();
    const { chiSquare, degreesOfFreedom } = this.computeChiSquare(activeFreqs, mean);
    const criticalVal = this.chiSquareCriticalValue(degreesOfFreedom, 1.645);
    const isSignificant = chiSquare > criticalVal;

    const statusBg = isSignificant ? '#fef2f2' : '#f0fdf4';
    const statusBorder = isSignificant ? '#fca5a5' : '#86efac';
    const statusColor = isSignificant ? '#dc2626' : '#16a34a';
    const verdictText = isSignificant ? t('dataviz.chiSignificativo') : t('dataviz.chiNoSignificativo');

    if (summary) {
      summary.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 8px;">
          <div>
            🔬 <strong>${t('dataviz.chiTitulo')}</strong>
          </div>
          <div style="font-size: 0.85rem; color: #475569;">
            ${t('dataviz.analizar')}: <strong>${this.vizTarget === 'star' ? t('dataviz.estrellasGenerico') : t('dataviz.numerosPrincipales')}</strong> | ${t('dataviz.nSorteos', { n: N })}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="padding: 10px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.chiValor')}</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${chiSquare.toFixed(2)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.chiGL')}</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${degreesOfFreedom}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.chiCritico')}</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${criticalVal.toFixed(2)}</div>
          </div>
        </div>

        <div style="background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 12px; padding: 16px; text-align: center; color: ${statusColor}; font-weight: 700; font-size: 0.98rem; line-height: 1.5;">
          ${verdictText}
        </div>

        <div style="font-size: 0.82rem; color: #64748b; font-style: italic; line-height: 1.5; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          ${t('dataviz.chiAviso')}
        </div>
      </div>
    `;
  }

  renderGapHistogramChart() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    if (!container) return;

    if (!this.dataLoaded || !this.historicalData || this.historicalData.length < 30) {
      container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding: 40px 10px; font-weight: 500;">⚠️ ${t('dataviz.gaps.sinDatos')}</div>`;
      if (summary) {
        summary.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
            <div style="font-weight: 700; color: #1e293b;">📐 ${t('dataviz.gaps.titulo')}</div>
            <div style="font-size: 0.85rem; color: #64748b;">${t('dataviz.gaps.subtitulo')}</div>
          </div>
        `;
      }
      return;
    }

    const numberRange = this.currentGame?.numberRange || 49;
    const maxNumbers = this.currentGame?.maxNumbers || 6;

    if (this.selectedGapNumber < 1 || this.selectedGapNumber > numberRange) {
      this.selectedGapNumber = 1;
    }

    const num = this.selectedGapNumber;
    const { gaps, huecoActual } = calcularGaps(this.historicalData, num);
    const percentil = percentilHueco(gaps, huecoActual);
    const p = maxNumbers / numberRange;
    const mediaTeorica = 1 / p;
    const mediaEmpirica = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const histogramData = construirHistogramaGaps(gaps, maxNumbers, numberRange);

    if (summary) {
      let optionsHtml = '';
      for (let i = 1; i <= numberRange; i++) {
        optionsHtml += `<option value="${i}" ${i === num ? 'selected' : ''}>${i}</option>`;
      }

      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <div style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">📐 ${t('dataviz.gaps.titulo')}</div>
              <div style="font-size: 0.82rem; color: #64748b;">${t('dataviz.gaps.subtitulo')}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label for="datavizGapNumberSelect" style="font-weight: 600; font-size: 0.88rem; color: #334155;">${t('dataviz.gaps.seleccionarNumero')}</label>
              <select id="datavizGapNumberSelect" class="modal-filter-select" style="min-width: 80px; padding: 4px 8px; font-weight: bold; border-color: var(--primary);">
                ${optionsHtml}
              </select>
            </div>
          </div>
          <div style="font-size: 0.8rem; color: #64748b; font-style: italic; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
            ${t('dataviz.gaps.aviso')}
          </div>
        </div>
      `;

      const selectEl = document.getElementById('datavizGapNumberSelect') as HTMLSelectElement;
      if (selectEl) {
        selectEl.addEventListener('change', (e) => {
          this.selectedGapNumber = parseInt((e.target as HTMLSelectElement).value, 10);
          this.renderGapHistogramChart();
        });
      }
    }

    const svgWidth = 800;
    const svgHeight = 360;
    const marginTop = 30;
    const marginBottom = 60;
    const marginLeft = 55;
    const marginRight = 25;

    const chartW = svgWidth - marginLeft - marginRight;
    const chartH = svgHeight - marginTop - marginBottom;

    const maxVal = Math.max(...histogramData.map(d => Math.max(d.empirico, d.teorico)), 1) * 1.15;

    const nBuckets = histogramData.length;
    const colWidth = chartW / nBuckets;
    const barWidth = Math.max(8, colWidth * 0.55);

    let yTicksHTML = '';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((i / ySteps) * maxVal);
      const yPos = marginTop + chartH - (val / maxVal) * chartH;
      yTicksHTML += `
        <line x1="${marginLeft}" y1="${yPos.toFixed(1)}" x2="${(svgWidth - marginRight).toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4" />
        <text x="${(marginLeft - 8).toFixed(1)}" y="${(yPos + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${val}</text>
      `;
    }

    let barsHTML = '';
    let linePoints: { x: number; y: number }[] = [];

    histogramData.forEach((row, idx) => {
      const cx = marginLeft + (idx + 0.5) * colWidth;
      const barH = (row.empirico / maxVal) * chartH;
      const barY = marginTop + chartH - barH;
      const barX = cx - barWidth / 2;

      const teoricoY = marginTop + chartH - (row.teorico / maxVal) * chartH;
      linePoints.push({ x: cx, y: teoricoY });

      const tooltipText = `Rango ${row.rangoLabel}: Real = ${row.empirico}, Teórico = ${row.teorico}`;

      barsHTML += `
        <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="#3b82f6" rx="3" opacity="0.85">
          <title>${tooltipText}</title>
        </rect>
      `;
    });

    let linePathD = '';
    linePoints.forEach((pt, i) => {
      if (i === 0) {
        linePathD += `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      } else {
        linePathD += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
    });

    const lineHTML = `<path d="${linePathD}" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

    const pointsHTML = linePoints.map((pt, i) => {
      const row = histogramData[i];
      return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="#ef4444"><title>Rango ${row.rangoLabel}: Teórico = ${row.teorico}</title></circle>`;
    }).join('');

    let xTicksHTML = '';
    histogramData.forEach((row, idx) => {
      const cx = marginLeft + (idx + 0.5) * colWidth;
      xTicksHTML += `<text x="${cx.toFixed(1)}" y="${(svgHeight - 20).toFixed(1)}" font-size="10" fill="#64748b" text-anchor="middle">${row.rangoLabel}</text>`;
    });

    const axesHTML = `
      <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
      <line x1="${marginLeft}" y1="${marginTop + chartH}" x2="${svgWidth - marginRight}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
    `;

    container.innerHTML = `
      <div id="gapsHistogramContainer" style="padding: 10px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.huecoActual')}</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${huecoActual} <span style="font-size: 0.85rem; font-weight: normal; color: #64748b;">sorteos</span></div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.percentilActual')}</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: ${percentil >= 90 ? '#dc2626' : '#1e293b'}; margin-top: 4px;">P${percentil}%</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.mediaComparada')}</div>
            <div style="font-size: 1.3rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${mediaEmpirica.toFixed(1)} / ${mediaTeorica.toFixed(1)}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: center; gap: 20px; align-items: center; font-size: 0.82rem; color: #475569;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 12px; height: 12px; background-color: #3b82f6; border-radius: 2px;"></span>
            <span>${t('dataviz.gaps.leyendaEmpirico')}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 16px; height: 3px; background-color: #ef4444; border-radius: 2px;"></span>
            <span>${t('dataviz.gaps.leyendaTeorico')}</span>
          </div>
        </div>

        <div style="width: 100%; overflow-x: auto;">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: auto; max-height: 380px; display: block; background: #ffffff; font-family: system-ui, sans-serif;">
            ${yTicksHTML}
            ${axesHTML}
            ${barsHTML}
            ${lineHTML}
            ${pointsHTML}
            ${xTicksHTML}
          </svg>
        </div>
      </div>
    `;
  }

  renderCoocurrenciaChart() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    if (!container) return;

    if (!this.dataLoaded || !this.historicalData || this.historicalData.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding: 40px 10px; font-weight: 500;">⚠️ ${t('coocurrencia.sinDatos')}</div>`;
      if (summary) {
        summary.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
            <div style="font-weight: 700; color: #1e293b;">🔢 ${t('coocurrencia.titulo')}</div>
            <div style="font-size: 0.85rem; color: #64748b;">${t('coocurrencia.subtitulo')}</div>
          </div>
        `;
      }
      return;
    }

    const numberRange = this.currentGame?.numberRange || 49;
    const maxNumbers = this.currentGame?.maxNumbers || 6;

    if (maxNumbers < 3 && this.coocurrenciaModo === 'trios') {
      this.coocurrenciaModo = 'pares';
    }

    if (summary) {
      const triosDisabled = maxNumbers < 3;
      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <div style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">🔢 ${t('coocurrencia.titulo')}</div>
              <div style="font-size: 0.82rem; color: #64748b;">${t('coocurrencia.subtitulo')}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 8px;">
              <button id="coocurrenciaModeParesBtn" type="button" class="modal-toggle-btn ${this.coocurrenciaModo === 'pares' ? 'active' : ''}" style="padding: 4px 12px; font-size: 0.85rem;">
                ${t('coocurrencia.modoPares')}
              </button>
              <button id="coocurrenciaModeTriosBtn" type="button" class="modal-toggle-btn ${this.coocurrenciaModo === 'trios' ? 'active' : ''}" ${triosDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed; padding: 4px 12px; font-size: 0.85rem;"' : 'style="padding: 4px 12px; font-size: 0.85rem;"'} title="${triosDisabled ? t('coocurrencia.triosNoDisponible') : ''}">
                ${t('coocurrencia.modoTrios')}
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('coocurrenciaModeParesBtn')?.addEventListener('click', () => {
        this.coocurrenciaModo = 'pares';
        this.renderCoocurrenciaChart();
      });

      document.getElementById('coocurrenciaModeTriosBtn')?.addEventListener('click', () => {
        if (!triosDisabled) {
          this.coocurrenciaModo = 'trios';
          this.renderCoocurrenciaChart();
        }
      });
    }

    let rowsHtml = '';
    let isTriosLimited = false;

    if (this.coocurrenciaModo === 'pares') {
      const matriz = construirMatrizPares(this.historicalData, numberRange);
      const pares = rankingPares(matriz, this.historicalData.length, maxNumbers, numberRange, 20);

      pares.forEach((p, idx) => {
        let ratioBg = '#f1f5f9';
        let ratioColor = '#334155';
        if (p.ratio > 1.15) {
          ratioBg = '#dcfce7';
          ratioColor = '#15803d';
        } else if (p.ratio < 0.85) {
          ratioBg = '#fee2e2';
          ratioColor = '#b91c1c';
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'}; font-size: 0.88rem;">
            <td style="padding: 10px 14px; font-weight: 700; color: #1e293b;">
              <span style="display: inline-flex; gap: 6px; align-items: center;">
                <span style="background: var(--primary, #2563eb); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${p.a}</span>
                <span style="color: #94a3b8;">+</span>
                <span style="background: var(--primary, #2563eb); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${p.b}</span>
              </span>
            </td>
            <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: #334155;">${p.count}</td>
            <td style="padding: 10px 14px; text-align: center; color: #475569;">${p.pctSobreSorteos}%</td>
            <td style="padding: 10px 14px; text-align: center; color: #64748b;">${p.esperado}</td>
            <td style="padding: 10px 14px; text-align: center;">
              <span style="background: ${ratioBg}; color: ${ratioColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                ${p.ratio.toFixed(2)}x
              </span>
            </td>
          </tr>
        `;
      });
    } else {
      if (this.historicalData.length > 2000) {
        isTriosLimited = true;
      }
      const trios = rankingTrios(this.historicalData, maxNumbers, numberRange, 20);

      trios.forEach((tItem, idx) => {
        let ratioBg = '#f1f5f9';
        let ratioColor = '#334155';
        if (tItem.ratio > 1.15) {
          ratioBg = '#dcfce7';
          ratioColor = '#15803d';
        } else if (tItem.ratio < 0.85) {
          ratioBg = '#fee2e2';
          ratioColor = '#b91c1c';
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'}; font-size: 0.88rem;">
            <td style="padding: 10px 14px; font-weight: 700; color: #1e293b;">
              <span style="display: inline-flex; gap: 6px; align-items: center;">
                <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.a}</span>
                <span style="color: #94a3b8;">+</span>
                <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.b}</span>
                <span style="color: #94a3b8;">+</span>
                <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.c}</span>
              </span>
            </td>
            <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: #334155;">${tItem.count}</td>
            <td style="padding: 10px 14px; text-align: center; color: #475569;">${tItem.pctSobreSorteos}%</td>
            <td style="padding: 10px 14px; text-align: center; color: #64748b;">${tItem.esperado}</td>
            <td style="padding: 10px 14px; text-align: center;">
              <span style="background: ${ratioBg}; color: ${ratioColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                ${tItem.ratio.toFixed(2)}x
              </span>
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div id="coocurrenciaContainer" style="padding: 10px; display: flex; flex-direction: column; gap: 16px;">
        ${isTriosLimited ? `
          <div style="font-size: 0.8rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 8px; font-weight: 500;">
            ℹ️ ${t('coocurrencia.limiteTrios')}
          </div>
        ` : ''}

        <div style="width: 100%; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 0.8rem; text-transform: uppercase; color: #64748b;">
                <th style="padding: 12px 14px;">${t('coocurrencia.colNumeros')}</th>
                <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colVeces')}</th>
                <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colPct')}</th>
                <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colEsperado')}</th>
                <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colRatio')}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <div style="font-size: 0.82rem; color: #64748b; font-style: italic; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
          ${t('coocurrencia.aviso')}
        </div>
      </div>
    `;
  }

  // ===== NEW FEATURES =====

  renderFrequencyChart() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    const targetSelectorContainer = document.getElementById('vizTargetSelectorContainer');
    const gapsBtn = document.getElementById('vizModeGapsBtn');
    const coocurrenciaBtn = document.getElementById('vizModeCoocurrenciaBtn');

    if (gapsBtn) {
      gapsBtn.style.display = this.currentGame?.id === 'nacional' ? 'none' : '';
    }
    if (coocurrenciaBtn) {
      coocurrenciaBtn.style.display = this.currentGame?.id === 'nacional' ? 'none' : '';
    }

    if (this.currentGame?.id === 'nacional' && (this.vizMode === 'gaps' || this.vizMode === 'coocurrencia')) {
      this.vizMode = 'heatmap';
      const heatmapBtn = document.getElementById('vizModeHeatmapBtn');
      if (heatmapBtn) heatmapBtn.classList.add('active');
      if (gapsBtn) gapsBtn.classList.remove('active');
      if (coocurrenciaBtn) coocurrenciaBtn.classList.remove('active');
    }

    if (!container) return;
    container.innerHTML = '';

    if (!this.dataLoaded || this.historicalData.length === 0) {
        container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding-top: 50px;">${t('dataviz.cargaGrafico')}</div>`;
        if (summary) {
            summary.innerHTML = `<div style="color:#666; text-align: center; width: 100%;">${t('dataviz.cargaResumen')}</div>`;
        }
        return;
    }

    if (this.vizMode === 'gaps') {
      if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
      this.renderGapHistogramChart();
      return;
    }

    if (this.vizMode === 'coocurrencia') {
      if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
      this.renderCoocurrenciaChart();
      return;
    }

    if (this.vizMode === 'trend') {
      if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
      this.renderTrendScatterChart();
      return;
    }

    if (this.vizMode === 'chi') {
      if (this.currentGame.maxStars > 0 && targetSelectorContainer) {
        targetSelectorContainer.style.display = 'flex';
      }
      this.renderChiSquareCard();
      return;
    }

    // Toggle target selector visibility and update star option text
    if (this.currentGame.maxStars > 0) {
        if (targetSelectorContainer) targetSelectorContainer.style.display = 'flex';
        const select = document.getElementById('vizTargetSelect') as HTMLSelectElement;
        if (select) {
            const starOption = select.querySelector('option[value="star"]') as HTMLOptionElement;
            if (starOption) {
                if (this.currentGame.id === 'gordo') {
                    starOption.textContent = t('dataviz.estrellaLabel.gordo');
                } else if (this.currentGame.id === 'eurodreams') {
                    starOption.textContent = t('dataviz.estrellaLabel.eurodreams');
                } else if (this.currentGame.id === 'powerball') {
                    starOption.textContent = t('dataviz.estrellaLabel.powerball');
                } else if (this.currentGame.id === 'megamillions') {
                    starOption.textContent = t('dataviz.estrellaLabel.megamillions');
                } else {
                    starOption.textContent = t('dataviz.estrellaLabel.generico');
                }
            }
        }
    } else {
        if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
        this.vizTarget = 'number';
        const select = document.getElementById('vizTargetSelect') as HTMLSelectElement;
        if (select) select.value = 'number';
    }

    const { N, activeFreqs, minKey, maxKey, mean, sd, isNacional, isGordo } = this.getFrequencyStats();

    // Calculate min/max actual frequencies
    let maxActualFreq = -1;
    let minActualFreq = Infinity;
    const maxFreqNum: number[] = [];
    const minFreqNum: number[] = [];

    Object.entries(activeFreqs).forEach(([keyStr, freq]) => {
        if (freq > maxActualFreq) maxActualFreq = freq;
        if (freq < minActualFreq) minActualFreq = freq;
    });

    Object.entries(activeFreqs).forEach(([keyStr, freq]) => {
        const key = parseInt(keyStr);
        if (freq === maxActualFreq) maxFreqNum.push(key);
        if (freq === minActualFreq) minFreqNum.push(key);
    });

    const formatKey = (key: number) => {
        if (isNacional) {
            const colIdx = Math.floor(key / 10);
            const digit = key % 10;
            const columnsLabels = [
                t('dataviz.cifraCorta.1'),
                t('dataviz.cifraCorta.2'),
                t('dataviz.cifraCorta.3'),
                t('dataviz.cifraCorta.4'),
                t('dataviz.cifraCorta.5')
            ];
            return `${columnsLabels[colIdx - 1]} (${digit})`;
        }
        if (this.vizTarget === 'star') {
            return isGordo ? `🔑 C${key}` : `★${key}`;
        }
        return `${key}`;
    };

    const maxFreqStr = maxFreqNum.map(formatKey).join(', ');
    const minFreqStr = minFreqNum.map(formatKey).join(', ');

    if (summary) {
        summary.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; width: 100%;">
                <div style="flex: 1; min-width: 220px;">
                    🔥 <strong>${t('dataviz.masFrecuente')}</strong> <span style="color: #ef4444; font-weight: bold;">${maxFreqStr}</span> (${t('backtest.economico.vecesCount', { count: maxActualFreq })})
                </div>
                <div style="flex: 1; min-width: 220px;">
                    ❄️ <strong>${t('dataviz.menosFrecuente')}</strong> <span style="color: #3b82f6; font-weight: bold;">${minFreqStr}</span> (${t('backtest.economico.vecesCount', { count: minActualFreq })})
                </div>
                <div style="flex: 1; min-width: 250px; text-align: right;" class="mean-indicator">
                    📈 <strong>${t('dataviz.mediaEsperada')}</strong> <span style="color: #10b981; font-weight: bold;">${mean.toFixed(2)}</span>
                    <span style="color: #64748b; font-size: 0.85rem; margin-left: 5px;">${t('dataviz.desviacionEst', { sd: sd.toFixed(2) })}</span>
                </div>
            </div>
        `;
    }

    if (this.vizMode === 'heatmap') {
        if (isNacional) {
            const columnsLabels = [
                t('dataviz.cifraLarga.1'),
                t('dataviz.cifraLarga.2'),
                t('dataviz.cifraLarga.3'),
                t('dataviz.cifraLarga.4'),
                t('dataviz.cifraLarga.5')
            ];
            
            let html = `<div style="display: flex; flex-direction: column; gap: 20px; width: 100%;">`;
            
            for (let colIdx = 0; colIdx < 5; colIdx++) {
                html += `
                    <div>
                        <div style="font-size: 0.85rem; font-weight: bold; color: #475569; margin-bottom: 8px; border-left: 3px solid var(--primary); padding-left: 8px;">
                            ${columnsLabels[colIdx]}
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px;">
                `;
                
                for (let digit = 0; digit < 10; digit++) {
                    const key = (colIdx + 1) * 10 + digit;
                    const freq = activeFreqs[key] || 0;
                    
                    const z = sd > 0 ? (freq - mean) / sd : 0;
                    const ratio = Math.min(Math.abs(z) / 2.5, 1.0);
                    let bg = 'rgba(226, 232, 240, 0.4)';
                    let color = 'var(--dark)';
                    let border = '1px solid #cbd5e1';
                    
                    if (z > 0.2) {
                        bg = `rgba(239, 68, 68, ${0.1 + 0.7 * ratio})`;
                        color = ratio > 0.6 ? '#ffffff' : '#991b1b';
                        border = `1px solid rgba(220, 38, 38, ${0.2 + 0.8 * ratio})`;
                    } else if (z < -0.2) {
                        bg = `rgba(59, 130, 246, ${0.1 + 0.7 * ratio})`;
                        color = ratio > 0.6 ? '#ffffff' : '#1e3a8a';
                        border = `1px solid rgba(37, 99, 235, ${0.2 + 0.8 * ratio})`;
                    }
                    
                    html += `
                        <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="${t('dataviz.tooltipCifra', { digit, freq, z: z.toFixed(2) })}">
                            <span style="font-size: 1.1rem; font-weight: bold;">${digit}</span>
                            <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${t('dataviz.freqAbbrev', { freq })}</span>
                        </div>
                    `;
                }
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            html += `</div>`;
            container.innerHTML = html;
        } else {
            const starCols = isGordo ? 10 : Math.min(this.currentGame.starRange, 6);
            const gridCols = this.vizTarget === 'star' ? starCols : this.currentGame.gridCols;
            let html = `
                <div style="display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: 8px; width: 100%;">
            `;
            
            for (let i = minKey; i <= maxKey; i++) {
                const freq = activeFreqs[i] || 0;
                const z = sd > 0 ? (freq - mean) / sd : 0;
                const ratio = Math.min(Math.abs(z) / 2.5, 1.0);
                let bg = 'rgba(226, 232, 240, 0.4)';
                let color = 'var(--dark)';
                let border = '1px solid #cbd5e1';
                
                if (z > 0.2) {
                    bg = `rgba(239, 68, 68, ${0.1 + 0.7 * ratio})`;
                    color = ratio > 0.6 ? '#ffffff' : '#991b1b';
                    border = `1px solid rgba(220, 38, 38, ${0.2 + 0.8 * ratio})`;
                } else if (z < -0.2) {
                    bg = `rgba(59, 130, 246, ${0.1 + 0.7 * ratio})`;
                    color = ratio > 0.6 ? '#ffffff' : '#1e3a8a';
                    border = `1px solid rgba(37, 99, 235, ${0.2 + 0.8 * ratio})`;
                }
                
                const labelStr = this.vizTarget === 'star' ? (isGordo ? `🔑 ${i}` : `★${i}`) : `${i}`;
                const titleTypeName = this.vizTarget === 'star' ? (isGordo ? t('dataviz.tipoClave') : t('dataviz.tipoEstrella')) : t('dataviz.tipoNumero');
                
                html += `
                    <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="${t('dataviz.tooltipGenerico', { tipo: titleTypeName, i, freq, z: z.toFixed(2) })}">
                        <span style="font-size: 1.1rem; font-weight: bold;">${labelStr}</span>
                        <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${t('dataviz.freqAbbrev', { freq })}</span>
                    </div>
                `;
            }
            
            html += `</div>`;
            
            html += `
                <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #f1f5f9; font-size: 0.8rem; color: #64748b; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(59, 130, 246, 0.4); border: 1px solid rgba(37, 99, 235, 0.4); border-radius: 3px;"></div>
                        <span>${t('dataviz.leyendaFrio')}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(226, 232, 240, 0.4); border: 1px solid #cbd5e1; border-radius: 3px;"></div>
                        <span>${t('dataviz.leyendaNeutro')}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(239, 68, 68, 0.4); border: 1px solid rgba(220, 38, 38, 0.4); border-radius: 3px;"></div>
                        <span>${t('dataviz.leyendaCaliente')}</span>
                    </div>
                </div>
            `;
            
            container.innerHTML = html;
        }
    } else {
        // Ranking View
        const sortedItems = Object.entries(activeFreqs)
            .map(([keyStr, freq]) => ({ key: parseInt(keyStr), freq }))
            .sort((a, b) => b.freq - a.freq);
            
        const maxFreqAcrossAll = Math.max(...Object.values(activeFreqs), 1);
        const showMeanLine = mean > 0 && maxFreqAcrossAll > 0 && mean <= maxFreqAcrossAll;
        const meanLeftPercent = showMeanLine ? (mean / maxFreqAcrossAll * 80).toFixed(2) : '0';
        
        let html = `
            <div style="position: relative; padding: 25px 0 10px 0; width: 100%;">
                ${showMeanLine ? `
                <!-- Contenedor alineado con las barras de progreso (offset de 125px a la izquierda) -->
                <div style="position: absolute; top: 25px; bottom: 10px; left: 125px; right: 0; pointer-events: none; z-index: 10;">
                    <!-- Línea vertical para la Media Esperada dentro del contenedor alineado -->
                    <div style="position: absolute; top: 0; bottom: 0; left: ${meanLeftPercent}%; border-left: 2px dashed #10b981; height: 100%;">
                        <span style="position: absolute; top: -20px; transform: translateX(-50%); font-size: 0.7rem; font-weight: bold; color: #10b981; background: #ffffff; padding: 0 4px; border-radius: 4px; border: 1px solid #10b981; white-space: nowrap;">${t('dataviz.mediaLinea', { mean: mean.toFixed(1) })}</span>
                    </div>
                </div>
                ` : ''}
                
                <div style="display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1;">
        `;
        
        sortedItems.forEach((item, index) => {
            const barWidth = (item.freq / maxFreqAcrossAll) * 80; // keep some room at the right for label
            const formatted = formatKey(item.key);
            
            let barColor = 'linear-gradient(to right, #64748b, #94a3b8)';
            if (item.freq > mean + sd) {
                barColor = 'linear-gradient(to right, #ef4444, #f87171)';
            } else if (item.freq < mean - sd) {
                barColor = 'linear-gradient(to right, #3b82f6, #60a5fa)';
            }
            
            html += `
                <div style="display: flex; align-items: center; gap: 10px; position: relative;">
                    <div style="width: 30px; font-size: 0.8rem; font-weight: bold; color: #94a3b8; text-align: right;">#${index + 1}</div>
                    <div style="width: 75px; font-size: 0.8rem; font-weight: bold; color: var(--dark); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${formatted}">${formatted}</div>
                    <div style="flex: 1; height: 26px; background: #f1f5f9; border-radius: 6px; overflow: hidden; position: relative; display: flex; align-items: center;">
                        <div style="width: ${barWidth}%; height: 100%; background: ${barColor}; border-radius: 6px 0 0 6px; transition: width 0.5s ease-out;"></div>
                        <span style="position: absolute; left: 8px; font-size: 0.8rem; font-weight: 700; color: ${barWidth > 12 ? '#ffffff' : 'var(--dark)'}; text-shadow: ${barWidth > 12 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'};">${t('backtest.economico.vecesCount', { count: item.freq })}</span>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        container.innerHTML = html;
    }
  }

  // ===== BIG DATA INTELLIGENCE =====
  
  updateBigDataPanel() {
      const lastDrawsContainer = document.getElementById('lastDrawsDisplay');
      const dayTopContainer = document.getElementById('bdDayTopNumbers');
      const alertsContainer = document.getElementById('bdAlerts');
      
      if (!lastDrawsContainer || !dayTopContainer || !alertsContainer) return;
      
      if (this.historicalData.length < 2) {
          lastDrawsContainer.innerHTML = `<div style="color: #999; font-style: italic;">${t('bigdata.datosInsuficientes')}</div>`;
          dayTopContainer.innerHTML = '<span style="font-size: 0.8rem; color: #999;">-</span>';
          return;
      }

      // 1. Contexto Inmediato (N y N-1)
      const drawN = this.historicalData[this.historicalData.length - 1];
      const drawNminus1 = this.historicalData[this.historicalData.length - 2];
      
      const renderMiniDraw = (draw: Draw, label: string) => {
          const formattedDate = draw.date instanceof Date ? draw.date.toLocaleDateString() : String(draw.date);
          const ballsHtml = draw.numbers.map(n => {
              let className = 'mini-ball';
              if (this.hotNumbers.has(n)) className += ' hot';
              else if (this.coldNumbers.has(n)) className += ' cold';
              const displayVal = this.currentGame.id === 'nacional' ? (n % 10) : n;
              return `<div class="${className}">${displayVal}</div>`;
          }).join('');

          let starsHtml = '';
          if (draw.stars && draw.stars.length > 0) {
              starsHtml = draw.stars.map(s => `<div class="mini-ball star-ball">${s}</div>`).join('');
          }

          let extraHtml = '';
          if (this.currentGame.id !== 'euromillones') {
              if (draw.complementario !== undefined) {
                  extraHtml += `<div class="mini-ball complementario-ball" title="${t('common.complementario')}">C${draw.complementario}</div>`;
              }
              if (draw.reintegro !== undefined) {
                  extraHtml += `<div class="mini-ball reintegro-ball" title="${t('common.reintegro')}">R${draw.reintegro}</div>`;
              }
          }

          return `
            <div class="mini-draw-card">
                <div class="mini-draw-header">
                    <span class="mini-draw-label">${label}</span>
                    <span class="mini-draw-date">📅 ${formattedDate}</span>
                </div>
                <div class="mini-draw-balls">
                    <div class="mini-balls-group">${ballsHtml}</div>
                    ${starsHtml ? `<div class="mini-stars-group">${starsHtml}</div>` : ''}
                    ${extraHtml ? `<div class="mini-extra-group">${extraHtml}</div>` : ''}
                </div>
            </div>
          `;
      };
      
      lastDrawsContainer.innerHTML = 
          renderMiniDraw(drawN, t('bigdata.ultimo')) + 
          renderMiniDraw(drawNminus1, t('bigdata.anterior'));

      // 2. Patrones Temporales
      this.updateNextDrawDayOptions();
      const daySelector = document.getElementById('nextDrawDay') as HTMLSelectElement;
      const selectedDay = parseInt(daySelector.value);
      
      const dayFrequencies: { [key: number]: number } = {};
      const dayStarFrequencies: { [key: number]: number } = {};
      let dayDrawCount = 0;
      
      this.historicalData.forEach(draw => {
          if (draw.date.getDay() === selectedDay) {
              dayDrawCount++;
              draw.numbers.forEach(n => {
                  dayFrequencies[n] = (dayFrequencies[n] || 0) + 1;
              });
              if (draw.stars) {
                  draw.stars.forEach(s => {
                      dayStarFrequencies[s] = (dayStarFrequencies[s] || 0) + 1;
                  });
              }
          }
      });

      if (dayDrawCount > 0) {
          const sortedDayFreq = Object.entries(dayFrequencies)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10) // Top 10
              .map(pair => parseInt(pair[0]));
              
          let html = sortedDayFreq.map(n => {
              let className = 'mini-ball';
              if (this.hotNumbers.has(n)) className += ' hot';
              else if (this.coldNumbers.has(n)) className += ' cold';
              const displayVal = this.currentGame.id === 'nacional' ? (n % 10) : n;
              const positionalName = this.currentGame.id === 'nacional' ? t('bigdata.cifraPosicional', { n: Math.floor(n / 10) }) : '';
              return `<div class="${className}" title="${t('bigdata.frecuenciaTooltip', { count: dayFrequencies[n], extra: positionalName })}">${displayVal}</div>`;
          }).join('');

          if (this.currentGame.maxStars > 0) {
              const sortedDayStarFreq = Object.entries(dayStarFrequencies)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(pair => parseInt(pair[0]));
              
              if (sortedDayStarFreq.length > 0) {
                  html += `<div style="width: 1px; height: 15px; background: #ccc; margin: 0 5px;"></div>`;
                  html += sortedDayStarFreq.map(s => {
                      let className = 'mini-ball star-ball';
                      if (this.hotStars.has(s)) className += ' hot';
                      else if (this.coldStars.has(s)) className += ' cold';
                      return `<div class="${className}" title="Frecuencia: ${dayStarFrequencies[s]}">${s}</div>`;
                  }).join('');
              }
          }
          
          dayTopContainer.innerHTML = html;
      } else {
          dayTopContainer.innerHTML = `<span style="font-size: 0.8rem; color: #999;">${t('bigdata.sinDatosDia')}</span>`;
      }

      // 3. Validación del Último Sorteo (NEW)
      let validationHtml = '';
      if (this.currentGame.id === 'euromillones') {
          const currentNumbers = Array.from(this.selectedNumbers);
          const currentStars = Array.from(this.selectedStars);
          
          if (currentNumbers.length > 0 || currentStars.length > 0) {
              const hits = currentNumbers.filter(n => drawN.numbers.includes(n)).length;
              const starHits = drawN.stars ? currentStars.filter(s => drawN.stars!.includes(s)).length : 0;
              
              validationHtml = `
                <div class="bd-alert ${hits + starHits > 0 ? 'success' : 'info'}" style="margin-bottom: 10px;">
                    ${t('bigdata.tuSeleccionVsUltimo', { hits, starHits })}
                </div>
              `;
          }

          // Validate saved tickets against last draw
          const lastDrawDateStr = new Date(drawN.date.getTime() - (drawN.date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
          const ticketsForLast = this.savedTickets.filter(t => t.gameId === 'euromillones' && t.drawDate === lastDrawDateStr);
          
          if (ticketsForLast.length > 0) {
              let totalHits = 0;
              let totalStarHits = 0;
              ticketsForLast.forEach(t => {
                  if (t.validation) {
                      totalHits += t.validation.hits.reduce((a, b) => a + b, 0);
                      if (t.validation.starHits) {
                          totalStarHits += t.validation.starHits.reduce((a, b) => a + b, 0);
                      }
                  }
              });
              
              validationHtml += `
                <div class="bd-alert success">
                    ${t('bigdata.tusBoletosVsUltimo', { hits: totalHits, starHits: totalStarHits })}
                </div>
              `;
          }
      }

      // 4. Alertas
      alertsContainer.innerHTML = validationHtml;
      
      // Check double repetition
      const intersection = drawN.numbers.filter(n => drawNminus1.numbers.includes(n));
      if (intersection.length > 0) {
          const displayIntersection = this.currentGame.id === 'nacional' 
              ? intersection.map(n => `${n % 10}${t('bigdata.cifraPosicional', { n: Math.floor(n / 10) })}`)
              : intersection;
          alertsContainer.innerHTML += `
            <div class="bd-alert warning">
                ${t('bigdata.dobleRepeticion', { numbers: displayIntersection.join(', ') })}
            </div>
          `;
      }
      
      // Check absence warning (if hot number is absent for long)
      const superHot = Array.from(this.hotNumbers).find(n => (this.numberStats[n].lastSeen < this.historicalData.length - 10));
      if (superHot) {
           alertsContainer.innerHTML += `
            <div class="bd-alert info">
                ${t('bigdata.calienteAusente', { num: superHot })}
            </div>
          `;
      }
      
      // General advice based on N
      const repeatedInLast = drawN.numbers.filter(n => this.hotNumbers.has(n)).length;
      if (repeatedInLast > 3) {
           alertsContainer.innerHTML += `
            <div class="bd-alert success">
                ${t('bigdata.ultimoMuyCaliente')}
            </div>
          `;
      }
  }

  applyBigDataStrategy(type: string) {
      if (this.historicalData.length < 2) {
          this.showToast(t('toast.bigdataDatosInsuficientes'), 'warning');
          return;
      }

      const lastDraw = this.historicalData[this.historicalData.length - 1];
      const daySelector = document.getElementById('nextDrawDay') as HTMLSelectElement;
      const selectedDay = parseInt(daySelector.value);

      // Calculate day hot numbers again (could cache this)
      const dayFrequencies: { [key: number]: number } = {};
      this.historicalData.forEach(draw => {
          if (draw.date.getDay() === selectedDay) {
              draw.numbers.forEach(n => dayFrequencies[n] = (dayFrequencies[n] || 0) + 1);
          }
      });
      const topDayNumbers = Object.entries(dayFrequencies)
          .sort((a, b) => b[1] - a[1])
          .map(p => parseInt(p[0]));

      // Base Candidates: Day Hot + General Hot
      let candidates = new Set([...topDayNumbers.slice(0, 15), ...Array.from(this.hotNumbers)]);
      let suggestions: number[] = [];

      if (type === 'conservative') {
          // 0 Repetitions from last draw
          // Remove last draw numbers from candidates
          lastDraw.numbers.forEach(n => candidates.delete(n));
          
          // Pick top 6 from remaining
          suggestions = Array.from(candidates).slice(0, 6);
          this.showToast(t('toast.bigdataSugerenciaConservadora'), 'info');

      } else if (type === 'balanced') {
          // 1 Repetition (Best one)
          // Find hottest number in last draw
          let bestRepeat = lastDraw.numbers[0];
          let maxFreq = -1;
          
          lastDraw.numbers.forEach(n => {
              const freq = this.numberStats[n].frequency;
              if (freq > maxFreq) {
                  maxFreq = freq;
                  bestRepeat = n;
              }
          });
          
          suggestions.push(bestRepeat);
          
          // Remove other last draw numbers
          lastDraw.numbers.forEach(n => {
              if (n !== bestRepeat) candidates.delete(n);
          });
           candidates.delete(bestRepeat); // Don't pick again

          // Fill rest
          suggestions.push(...Array.from(candidates).slice(0, 5));
           this.showToast(t('toast.bigdataSugerenciaBalanceada'), 'info');

      } else if (type === 'risk') {
          // 2 Repetitions
           // Find top 2 hottest in last draw
          const sortedLast = [...lastDraw.numbers].sort((a, b) => this.numberStats[b].frequency - this.numberStats[a].frequency);
          suggestions.push(sortedLast[0], sortedLast[1]);
          
           // Remove others
           lastDraw.numbers.forEach(n => {
              if (n !== sortedLast[0] && n !== sortedLast[1]) candidates.delete(n);
          });
          candidates.delete(sortedLast[0]);
          candidates.delete(sortedLast[1]);

          // Fill rest
          suggestions.push(...Array.from(candidates).slice(0, 4));
           this.showToast(t('toast.bigdataSugerenciaRiesgo'), 'warning');
      }

      this.suggestedNumbers = new Set(suggestions);
      this.updateGridNumberStates();
      
      // Scroll to grid
      document.getElementById('numbersGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showMainApp() {
    const mainApp = document.getElementById('mainAppContainer');
    const peniaPage = document.getElementById('peniaPageContainer');
    if (mainApp) {
        mainApp.style.display = 'block';
        if (peniaPage) peniaPage.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Update sidebar active state
        document.querySelectorAll('.sidebar-links li').forEach(li => li.classList.remove('active'));
        const activeLi = document.getElementById(`game-${this.currentGame.id}`);
        if (activeLi) activeLi.classList.add('active');
    }
  }

  showPeniaPage() {
    this.closeSidebar();
    const mainApp = document.getElementById('mainAppContainer');
    const peniaPage = document.getElementById('peniaPageContainer');
    if (mainApp && peniaPage) {
        mainApp.style.display = 'none';
        peniaPage.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Update sidebar active state
        document.querySelectorAll('.sidebar-links li').forEach(li => li.classList.remove('active'));
        document.getElementById('sidebarPeniaBtn')?.parentElement?.classList.add('active');

        this.initPenias();
        this.updatePeniaSelector();
        this.bindPeniaPageEvents();
        this.renderActivePeniaDetails();
    }
  }

  showBigDataIntelligence() {
    this.closeSidebar();
    this.toggleModal('bigdataModal', true);
  }

  showOfficialDrawsModal() {
    this.closeSidebar();
    
    // Reset search state
    this.officialDrawsPage = 1;
    this.officialDrawsSearchQuery = '';
    const searchInput = document.getElementById('officialDrawsSearchInput') as HTMLInputElement;
    if (searchInput) {
        searchInput.value = '';
    }

    const gameNameEl = document.getElementById('officialDrawsGameName');
    if (gameNameEl) {
        gameNameEl.textContent = `${this.currentGame.name}`;
    }

    // Toggle header columns depending on current game
    const extraHeader = document.getElementById('officialDrawsExtraHeader');
    if (extraHeader) {
        if (this.currentGame.id === 'euromillones') {
            extraHeader.textContent = t('officialdraws.extraHeader.estrellas');
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'eurodreams') {
            extraHeader.textContent = t('officialdraws.extraHeader.sueno');
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'gordo') {
            extraHeader.textContent = t('officialdraws.extraHeader.clave');
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'powerball') {
            extraHeader.textContent = t('officialdraws.extraHeader.bolaEspecial');
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'megamillions') {
            extraHeader.textContent = t('officialdraws.extraHeader.megaBall');
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'bonoloto' || this.currentGame.id === 'primitiva') {
            extraHeader.textContent = t('officialdraws.extraHeader.compReint');
            extraHeader.style.display = '';
        } else {
            extraHeader.textContent = t('officialdraws.extraHeader.reintegro');
            extraHeader.style.display = '';
        }
    }

    this.updateOfficialDrawsTable();
    this.toggleModal('officialDrawsModal', true);
  }

  updateOfficialDrawsTable() {
    const tableBody = document.getElementById('officialDrawsTableBody');
    const noDataEl = document.getElementById('officialDrawsNoData');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const query = this.officialDrawsSearchQuery.trim().toLowerCase();
    let filtered = this.historicalData;

    if (query) {
        const parts = query.split(/[,;\s]+/).map(p => p.trim()).filter(p => p);
        filtered = this.historicalData.filter(draw => {
            return parts.every(part => {
                const numVal = parseInt(part);
                if (!isNaN(numVal)) {
                    const numInNumbers = draw.numbers.includes(numVal);
                    const numInStars = draw.stars ? draw.stars.includes(numVal) : false;
                    const numInComplementario = draw.complementario === numVal;
                    const numInReintegro = draw.reintegro === numVal;
                    return numInNumbers || numInStars || numInComplementario || numInReintegro;
                } else {
                    const dateStr = draw.date.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase();
                    const drawTypeStr = draw.drawType ? draw.drawType.toLowerCase() : '';
                    return dateStr.includes(part) || drawTypeStr.includes(part);
                }
            });
        });
    }

    // Sort newest first
    const sortedDraws = [...filtered].reverse();
    const totalItems = sortedDraws.length;

    if (totalItems === 0) {
        if (noDataEl) noDataEl.style.display = 'block';
        const infoEl = document.getElementById('officialDrawsPaginationInfo');
        if (infoEl) infoEl.textContent = t('officialdraws.sinSorteos');
        const pageEl = document.getElementById('officialDrawsCurrentPage');
        if (pageEl) pageEl.textContent = t('officialdraws.paginaUnica');
        
        // Disable pagination
        const prevBtn = document.getElementById('officialDrawsPrevBtn') as HTMLButtonElement;
        const nextBtn = document.getElementById('officialDrawsNextBtn') as HTMLButtonElement;
        if (prevBtn) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
            prevBtn.style.pointerEvents = 'none';
        }
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
            nextBtn.style.pointerEvents = 'none';
        }
        return;
    }

    if (noDataEl) noDataEl.style.display = 'none';

    const totalPages = Math.ceil(totalItems / this.officialDrawsPageSize) || 1;
    if (this.officialDrawsPage > totalPages) {
        this.officialDrawsPage = totalPages;
    }
    if (this.officialDrawsPage < 1) {
        this.officialDrawsPage = 1;
    }

    const startIndex = (this.officialDrawsPage - 1) * this.officialDrawsPageSize;
    const endIndex = Math.min(startIndex + this.officialDrawsPageSize, totalItems);
    const pageItems = sortedDraws.slice(startIndex, endIndex);

    // Update pagination info
    const infoEl = document.getElementById('officialDrawsPaginationInfo');
    if (infoEl) {
        infoEl.textContent = t('officialdraws.mostrandoRango', { start: startIndex + 1, end: endIndex, total: totalItems });
    }
    const pageEl = document.getElementById('officialDrawsCurrentPage');
    if (pageEl) {
        pageEl.textContent = t('officialdraws.paginaDe', { page: this.officialDrawsPage, total: totalPages });
    }

    // Prev/Next Button states
    const prevBtn = document.getElementById('officialDrawsPrevBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('officialDrawsNextBtn') as HTMLButtonElement;
    if (prevBtn) {
        prevBtn.disabled = this.officialDrawsPage === 1;
        prevBtn.style.opacity = this.officialDrawsPage === 1 ? '0.5' : '1';
        prevBtn.style.pointerEvents = this.officialDrawsPage === 1 ? 'none' : 'auto';
    }
    if (nextBtn) {
        nextBtn.disabled = this.officialDrawsPage === totalPages;
        nextBtn.style.opacity = this.officialDrawsPage === totalPages ? '0.5' : '1';
        nextBtn.style.pointerEvents = this.officialDrawsPage === totalPages ? 'none' : 'auto';
    }

    // Build rows
    pageItems.forEach(draw => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #f1f5f9';
        
        // 1. Sorteo #
        const tdId = document.createElement('td');
        tdId.style.padding = '12px 15px';
        tdId.style.fontWeight = 'bold';
        tdId.style.color = '#475569';
        tdId.textContent = `#${draw.id}`;
        row.appendChild(tdId);

        // 2. Fecha
        const tdDate = document.createElement('td');
        tdDate.style.padding = '12px 15px';
        const rawDateStr = draw.date.toLocaleDateString(getLocale() === 'en' ? 'en-US' : 'es-ES', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        const capitalizedDate = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);
        tdDate.textContent = capitalizedDate;
        row.appendChild(tdDate);

        // 3. Combinación Ganadora
        const tdBalls = document.createElement('td');
        tdBalls.style.padding = '12px 15px';
        
        const ballsContainer = document.createElement('div');
        ballsContainer.className = 'mini-balls-group';
        
        draw.numbers.forEach(n => {
            const ballDiv = document.createElement('div');
            ballDiv.className = 'mini-ball';
            if (this.hotNumbers.has(n)) ballDiv.className += ' hot';
            else if (this.coldNumbers.has(n)) ballDiv.className += ' cold';
            
            const displayVal = this.currentGame.id === 'nacional' ? (n % 10) : n;
            ballDiv.textContent = String(displayVal);
            ballsContainer.appendChild(ballDiv);
        });
        
        tdBalls.appendChild(ballsContainer);
        row.appendChild(tdBalls);

        // 4. Adicional / ⭐
        const tdExtra = document.createElement('td');
        tdExtra.style.padding = '12px 15px';

        const extraContainer = document.createElement('div');
        extraContainer.className = 'mini-balls-group';

        if ((this.currentGame.id === 'euromillones' || this.currentGame.id === 'eurodreams' || this.currentGame.id === 'gordo' || this.currentGame.id === 'powerball') && draw.stars && draw.stars.length > 0) {
            draw.stars.forEach(s => {
                const starDiv = document.createElement('div');
                starDiv.className = 'mini-ball star-ball';
                starDiv.textContent = String(s);
                extraContainer.appendChild(starDiv);
            });
        } else if (this.currentGame.id === 'bonoloto' || this.currentGame.id === 'primitiva') {
            if (draw.complementario !== undefined) {
                const compDiv = document.createElement('div');
                compDiv.className = 'mini-ball complementario-ball';
                compDiv.title = t('common.complementario');
                compDiv.textContent = `C${draw.complementario}`;
                extraContainer.appendChild(compDiv);
            }
            if (draw.reintegro !== undefined) {
                const reDiv = document.createElement('div');
                reDiv.className = 'mini-ball reintegro-ball';
                reDiv.title = t('common.reintegro');
                reDiv.textContent = `R${draw.reintegro}`;
                extraContainer.appendChild(reDiv);
            }
        } else if (this.currentGame.id === 'nacional') {
            if (draw.reintegro !== undefined) {
                const reDiv = document.createElement('div');
                reDiv.className = 'mini-ball reintegro-ball';
                reDiv.title = t('common.reintegro');
                reDiv.textContent = `R${draw.reintegro}`;
                extraContainer.appendChild(reDiv);
            } else {
                extraContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.8rem;">-</span>';
            }
        } else {
            extraContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.8rem;">-</span>';
        }

        tdExtra.appendChild(extraContainer);
        row.appendChild(tdExtra);

        tableBody.appendChild(row);
    });
  }

  showHistoryOfResults() {
    this.closeSidebar();
    
    // Set the game filter selection to match the current game or default to 'all'
    const hrGameFilter = document.getElementById('hrGameFilter') as HTMLSelectElement;
    if (hrGameFilter) {
        hrGameFilter.value = this.currentGame.id;
    }

    this.updateHistoryDashboard();
    this.toggleModal('historyOfResultsModal', true);
  }

  updateHistoryDashboard() {
    const hrGameFilter = document.getElementById('hrGameFilter') as HTMLSelectElement;
    const hrGameFilterVal = hrGameFilter ? hrGameFilter.value : 'all';

    // Filter tickets
    const filteredTickets = hrGameFilterVal === 'all'
      ? this.savedTickets
      : this.savedTickets.filter(t => t.gameId === hrGameFilterVal);

    // Calculate total combinations generated
    let totalCombinations = 0;
    filteredTickets.forEach(ticket => {
        if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
             const n = ticket.combinations[0].length;
             let combos = 1;
             for(let i=0; i<6; i++) combos *= (n-i)/(i+1);
             totalCombinations += Math.round(combos);
        } else {
             totalCombinations += ticket.combinations.length;
        }
    });

    const elTotal = document.getElementById('hrTotalCombinations');
    if (elTotal) elTotal.innerHTML = String(totalCombinations);

    // Calculate validated combinations
    const validatedTickets = filteredTickets.filter(t => t.validation);
    let validatedCombinations = 0;
    validatedTickets.forEach(ticket => {
        validatedCombinations += ticket.validation!.hits.length;
    });

    const elValidated = document.getElementById('hrValidatedCombinations');
    if (elValidated) elValidated.innerHTML = String(validatedCombinations);

    // Calculate best combination (maximum hits)
    let maxHit = 0;
    let maxHitStars = 0;
    let hasStarsInBest = false;
    validatedTickets.forEach(ticket => {
        ticket.validation!.hits.forEach((hit, idx) => {
            const stars = ticket.validation!.starHits ? ticket.validation!.starHits[idx] : 0;
            if (hit > maxHit || (hit === maxHit && stars > maxHitStars)) {
                maxHit = hit;
                maxHitStars = stars;
                if (ticket.validation!.starHits) {
                    hasStarsInBest = true;
                }
            }
        });
    });

    const elBest = document.getElementById('hrBestCombination');
    if (elBest) {
        if (validatedCombinations > 0) {
            let bestText = `${maxHit} ${t('tickets.aciertos')}`;
            if (hasStarsInBest && maxHitStars > 0) {
                bestText += ` + ${maxHitStars} ⭐`;
            }
            elBest.innerHTML = bestText;
        } else {
            elBest.innerHTML = '-';
        }
    }

    // Comparison Table Body
    const tableBody = document.getElementById('hrComparisonTableBody');
    const warningEl = document.getElementById('hrNoValidationWarning');
    
    if (tableBody) {
        tableBody.innerHTML = '';
        
        if (validatedCombinations === 0) {
            if (warningEl) warningEl.style.display = 'block';
        } else {
            if (warningEl) warningEl.style.display = 'none';

            // Count actual hits
            const actualHitCounts: { [tier: string]: number } = { '6': 0, '5': 0, '4': 0, '3': 0, '<=2': 0 };
            const validatedCountsByGame: { [gameId: string]: number } = {};

            validatedTickets.forEach(ticket => {
                const gameId = ticket.gameId || 'bonoloto';
                const numCombos = ticket.validation!.hits.length;
                validatedCountsByGame[gameId] = (validatedCountsByGame[gameId] || 0) + numCombos;

                ticket.validation!.hits.forEach(hitCount => {
                    if (hitCount >= 6) {
                        actualHitCounts['6']++;
                    } else if (hitCount === 5) {
                        actualHitCounts['5']++;
                    } else if (hitCount === 4) {
                        actualHitCounts['4']++;
                    } else if (hitCount === 3) {
                        actualHitCounts['3']++;
                    } else {
                        actualHitCounts['<=2']++;
                    }
                });
            });

            // Adjust tiers depending on active game filter
            let activeTiers = ['6', '5', '4', '3', '<=2'];
            if (hrGameFilterVal !== 'all') {
                const cfg = getGameConfig(hrGameFilterVal);
                if (cfg && cfg.maxNumbers === 5) {
                    activeTiers = ['5', '4', '3', '<=2'];
                }
            }

            const getTheoreticalProb = (tier: string): number => {
                if (hrGameFilterVal !== 'all') {
                    const cfg = getGameConfig(hrGameFilterVal);
                    return cfg && cfg.theoreticalProbabilities ? (cfg.theoreticalProbabilities[tier] || 0) : 0;
                }
                
                // Weighted average for 'all'
                let sumWeightedProbs = 0;
                let totalWeight = 0;
                Object.entries(validatedCountsByGame).forEach(([gameId, count]) => {
                    const cfg = getGameConfig(gameId);
                    if (count > 0 && cfg && cfg.theoreticalProbabilities) {
                        const prob = cfg.theoreticalProbabilities[tier] || 0;
                        sumWeightedProbs += count * prob;
                        totalWeight += count;
                    }
                });
                if (totalWeight > 0) return sumWeightedProbs / totalWeight;
                return getGameConfig('bonoloto').theoreticalProbabilities[tier] || 0;
            };

            const tierLabels: { [key: string]: string } = {
                '6': t('history.tier.6'),
                '5': t('history.tier.5'),
                '4': t('history.tier.4'),
                '3': t('history.tier.3'),
                '<=2': t('history.tier.menos2')
            };

            activeTiers.forEach(tier => {
                const count = actualHitCounts[tier] || 0;
                const actualFrequency = (count / validatedCombinations) * 100;
                const theoreticalFrequency = getTheoreticalProb(tier);

                let perfBadge = '';
                if (count === 0 && theoreticalFrequency === 0) {
                    perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.sinDatos')}</span>`;
                } else if (actualFrequency > theoreticalFrequency) {
                    const timesBetter = theoreticalFrequency > 0 ? (actualFrequency / theoreticalFrequency).toFixed(1) : 'N/A';
                    const percentBetter = theoreticalFrequency > 0 ? (((actualFrequency - theoreticalFrequency) / theoreticalFrequency) * 100).toFixed(0) : '0';
                    perfBadge = `<span style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${t('history.superior', { timesBetter, percentBetter })}</span>`;
                } else if (actualFrequency === theoreticalFrequency) {
                    perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.esperado')}</span>`;
                } else {
                    const timesWorse = actualFrequency > 0 && theoreticalFrequency > 0 ? (theoreticalFrequency / actualFrequency).toFixed(1) : '∞';
                    perfBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">📉 ${actualFrequency > 0 ? t('history.inferior', { timesWorse }) : t('history.ceroAciertos')}</span>`;
                }

                tableBody.innerHTML += `
                    <tr style="border-bottom: 1px solid #f3f4f6; hover:background-color: #fafafa;">
                        <td style="padding: 12px 8px; font-weight: 500; color: #111827;">${tierLabels[tier] || tier}</td>
                        <td style="padding: 12px 8px; text-align: center;">${count}</td>
                        <td style="padding: 12px 8px; text-align: center; font-weight: 600; color: var(--primary);">${actualFrequency.toFixed(4)}%</td>
                        <td style="padding: 12px 8px; text-align: center; color: #4b5563;">${theoreticalFrequency.toFixed(4)}%</td>
                        <td style="padding: 12px 8px; text-align: right;">${perfBadge}</td>
                    </tr>
                `;
            });
        }
    }

    // Strategy Distribution
    const strategyCounts: { [key: string]: { total: number, validated: number, maxHits: number } } = {};
    const strategyMap: { [key: string]: string } = { simple: t('tickets.strategy.simple'), winning: t('history.estrategiaGanadora'), multiple: t('tickets.strategy.multiple') };

    filteredTickets.forEach(ticket => {
        const strat = ticket.strategy || 'simple';
        if (!strategyCounts[strat]) {
            strategyCounts[strat] = { total: 0, validated: 0, maxHits: 0 };
        }
        
        let combosCount = 0;
        if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
             const n = ticket.combinations[0].length;
             let combos = 1;
             for(let i=0; i<6; i++) combos *= (n-i)/(i+1);
             combosCount = Math.round(combos);
        } else {
             combosCount = ticket.combinations.length;
        }

        strategyCounts[strat].total += combosCount;
        if (ticket.validation) {
            strategyCounts[strat].validated += ticket.validation.hits.length;
            const ticketMax = Math.max(...ticket.validation.hits);
            if (ticketMax > strategyCounts[strat].maxHits) {
                strategyCounts[strat].maxHits = ticketMax;
            }
        }
    });

    const elStrategyDist = document.getElementById('hrStrategyDistribution');
    if (elStrategyDist) {
        let stratHtml = '';
        Object.entries(strategyCounts).forEach(([stratKey, data]) => {
            const name = strategyMap[stratKey] || stratKey;
            stratHtml += `
                <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-weight: 600; color: #374151;">${name}</span>
                        <div style="font-size: 0.8rem; color: #6b7280;">${t('history.apuestasGeneradas', { total: data.total, validated: data.validated })}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.8rem; color: #4b5563; font-weight: 500;">${t('history.mejorResultado')}</div>
                        <span style="background: #eff6ff; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">${data.validated > 0 ? `${data.maxHits} ${t('tickets.aciertos')}` : t('history.sinDatos')}</span>
                    </div>
                </div>
            `;
        });
        if (!stratHtml) {
            stratHtml = `<div style="color: #6b7280; font-style: italic; text-align: center; padding: 10px;">${t('history.sinCombinaciones')}</div>`;
        }
        elStrategyDist.innerHTML = stratHtml;
    }
  }



  // ============================================
  // MATHEMATICAL FILTERS & OPTIMIZATION
  // ============================================

  updateCorrelationScore() {
    if (!this.correlationScoreContainer || (this.selectedNumbers.size === 0 && this.selectedStars.size === 0)) {
      if (this.correlationScoreContainer) this.correlationScoreContainer.style.display = 'none';
      return;
    }

    this.correlationScoreContainer.style.display = 'block';
    
    const selected = Array.from(this.selectedNumbers);
    const selectedStars = Array.from(this.selectedStars);
    let score = 50; // Base score
    let advice = "";

    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;

    // 1. Balance Par/Impar
    const evens = selected.filter(n => n % 2 === 0).length;
    const idealEvens = Math.floor(maxNumbers / 2);
    if (evens === idealEvens || evens === idealEvens + 1) score += 15;
    else if (Math.abs(evens - idealEvens) <= 1) score += 10;
    else score -= 10;

    // 2. Balance Bajo/Alto
    const midPoint = Math.floor(this.currentGame.numberRange / 2);
    const lows = selected.filter(n => n <= midPoint).length;
    const idealLows = Math.floor(maxNumbers / 2);
    if (lows === idealLows || lows === idealLows + 1) score += 15;
    else if (Math.abs(lows - idealLows) <= 1) score += 10;
    else score -= 10;

    // 3. Correlación con Calientes/Fríos/Ausentes
    if (this.dataLoaded) {
      const hotCount = selected.filter(n => this.hotNumbers.has(n)).length;
      const coldCount = selected.filter(n => this.coldNumbers.has(n)).length;
      const neutralCount = selected.filter(n => !this.hotNumbers.has(n) && !this.coldNumbers.has(n)).length;

      const target = this.currentSuggestedProfile;
      
      if (hotCount === target.hot) score += 10;
      else if (Math.abs(hotCount - target.hot) === 1) score += 5;
      
      if (coldCount === target.cold) score += 10;
      else if (Math.abs(coldCount - target.cold) === 1) score += 5;

      if (neutralCount === target.neutral) score += 5;

      // Correlación de Estrellas
      if (maxStars > 0 && selectedStars.length === maxStars) {
          const hotStarCount = selectedStars.filter(s => this.hotStars.has(s)).length;
          const coldStarCount = selectedStars.filter(s => this.coldStars.has(s)).length;
          
          if (target.starHot !== undefined && hotStarCount === target.starHot) score += 5;
          if (target.starCold !== undefined && coldStarCount === target.starCold) score += 5;
      }
    }

    // 4. Suma Total (Dinámico según el juego)
    const totalSum = selected.reduce((a, b) => a + b, 0);
    const avgNum = (1 + this.currentGame.numberRange) / 2;
    const idealSum = avgNum * maxNumbers;
    const sumRange = idealSum * 0.2; // +/- 20%
    
    if (totalSum >= (idealSum - sumRange) && totalSum <= (idealSum + sumRange)) score += 10;
    else if (totalSum < (idealSum - sumRange * 2) || totalSum > (idealSum + sumRange * 2)) score -= 15;

    // 5. Estrellas (si aplica)
    if (maxStars > 0 && selectedStars.length === maxStars) {
        const starEvens = selectedStars.filter(n => n % 2 === 0).length;
        const starMid = Math.floor(this.currentGame.starRange / 2);
        const starLows = selectedStars.filter(n => n <= starMid).length;

        // Balance Par/Impar Estrellas
        if (maxStars === 2) {
            if (starEvens === 1) score += 10; // 1P/1I es ideal
            else score += 5;
        }

        // Balance Bajo/Alto Estrellas
        if (maxStars === 2) {
            if (starLows === 1) score += 5; // 1B/1A es ideal
        }
        
        // Suma Estrellas
        const starSum = selectedStars.reduce((a, b) => a + b, 0);
        const avgStar = (1 + this.currentGame.starRange) / 2;
        const idealStarSum = avgStar * maxStars;
        if (Math.abs(starSum - idealStarSum) <= this.currentGame.starRange * 0.5) score += 5;
    }

    // Normalizar score 0-100
    score = Math.max(0, Math.min(100, score));

    // Generar consejo
    if (score >= 80) advice = t('quality.excelente');
    else if (score >= 60) advice = t('quality.buena');
    else if (score >= 40) advice = t('quality.aceptable');
    else advice = t('quality.pocoProbable');

    // Actualizar UI
    if (this.correlationScoreValue) this.correlationScoreValue.textContent = `${score}%`;
    if (this.correlationScoreBar) {
      this.correlationScoreBar.style.width = `${score}%`;
      this.correlationScoreBar.className = 'h-full transition-all duration-500 rounded-full ' + 
        (score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-indigo-500' : 'bg-amber-500');
    }
    if (this.correlationAdvice) this.correlationAdvice.textContent = advice;
  }

  updateBacktestUI() {
      const controls = document.querySelector('.backtesting-controls') as HTMLElement;
      const actions = document.querySelector('.backtesting-actions') as HTMLElement;
      const results = document.getElementById('backtestResults') as HTMLElement;
      const alertNoData = document.getElementById('backtestNoDataAlert') as HTMLElement;

      if (!this.dataLoaded || this.historicalData.length === 0) {
          if (controls) controls.style.display = 'none';
          if (actions) actions.style.display = 'none';
          if (results) results.style.display = 'none';
          if (alertNoData) alertNoData.style.display = 'block';
      } else {
          if (controls) controls.style.display = 'grid';
          if (actions) actions.style.display = 'block';
          if (alertNoData) alertNoData.style.display = 'none';
      }
  }

  calculateDrawPrize(hits: number, starHits: number, draw: Draw, combo: number[]): number {
    return calculateDrawPrize(hits, starHits, draw, combo, this.currentGame?.id || '', this.dataType || '');
  }

  async runBacktest() {
      // Comprobar si hay datos cargados
      if (!this.dataLoaded || this.historicalData.length === 0) {
          this.showToast(t('toast.backtestSinDatos'), 'error');
          return;
      }

      this.updateFilterStateFromUI();

      const periodVal = (document.getElementById('backtestPeriod') as HTMLSelectElement).value;
      const modeVal = (document.getElementById('backtestMode') as HTMLSelectElement).value;

      let drawsToTest = [...this.historicalData];
      if (periodVal === 'outside_calibration') {
          const calibrationWindow = 100;
          drawsToTest = drawsToTest.slice(0, Math.max(0, drawsToTest.length - calibrationWindow));
      } else if (periodVal !== 'all') {
          const limit = parseInt(periodVal);
          drawsToTest = drawsToTest.slice(-limit);
      }

      const totalDraws = drawsToTest.length;
      if (totalDraws === 0) {
          this.showToast(t('toast.backtestSinSorteos'), 'error');
          return;
      }

      const btn = document.getElementById('runBacktestBtn');
      const progressContainer = document.getElementById('backtestProgressContainer');
      const progressBar = document.getElementById('backtestProgressBar');
      const progressText = document.getElementById('backtestProgressText');
      const resultsDiv = document.getElementById('backtestResults');

      if (btn) (btn as HTMLButtonElement).disabled = true;
      if (progressContainer) progressContainer.style.display = 'block';
      if (resultsDiv) resultsDiv.style.display = 'none';

      // Reset y actualización dinámica de etiquetas según la modalidad
      const lblTotalDraws = document.getElementById('lblTotalDraws');
      const lblTicketPrice = document.getElementById('lblTicketPrice');
      const lblTotalSpent = document.getElementById('lblTotalSpent');
      const lblTotalWon = document.getElementById('lblTotalWon');
      const lblBalance = document.getElementById('lblBalance');
      const lblROI = document.getElementById('lblROI');
      const btBreakdownTitle = document.getElementById('btBreakdownTitle');

      if (modeVal === 'filters') {
          if (lblTotalDraws) lblTotalDraws.textContent = t('backtest.lbl.sorteosHistoricos');
          if (lblTicketPrice) lblTicketPrice.textContent = t('backtest.lbl.ganadoresAdmitidos');
          if (lblTotalSpent) lblTotalSpent.textContent = t('backtest.lbl.ganadoresExcluidos');
          if (lblTotalWon) lblTotalWon.textContent = t('backtest.lbl.tasaAceptacion');
          if (lblBalance) lblBalance.textContent = t('backtest.lbl.reduccionUniverso');
          if (lblROI) lblROI.textContent = t('backtest.lbl.eficienciaFiltros');
          if (btBreakdownTitle) btBreakdownTitle.textContent = t('backtest.lbl.registroHistorico');
      } else {
          if (lblTotalDraws) lblTotalDraws.textContent = t('backtest.lbl.sorteosSimulados');
          if (lblTicketPrice) lblTicketPrice.textContent = t('backtest.lbl.precioApuesta');
          if (lblTotalSpent) lblTotalSpent.textContent = t('backtest.lbl.presupuestoInvertido');
          if (lblTotalWon) lblTotalWon.textContent = t('backtest.lbl.premiosRecuperados');
          if (lblBalance) lblBalance.textContent = t('backtest.lbl.balanceNeto');
          if (lblROI) lblROI.textContent = t('backtest.lbl.roi');
          if (btBreakdownTitle) btBreakdownTitle.textContent = t('backtest.lbl.desgloseAciertos');
      }

      const maxNumbers = this.currentGame.maxNumbers;
      const maxStars = this.currentGame.maxStars;
      const availableUniverse = this.getAvailableUniverse('number');
      const availableStars = this.getAvailableUniverse('star');

      // --- Rama 1: Análisis exclusivo de Eficacia de Filtros ---
      if (modeVal === 'filters') {
          let passedDrawsCount = 0;
          const drawDetails: { draw: Draw; passed: boolean }[] = [];

          // Procesar validez de sorteos reales con un ligero delay para dinamismo visual
          for (let index = 0; index < totalDraws; index++) {
              const draw = drawsToTest[index];

              const pct = Math.floor(((index + 0.3) / totalDraws) * 100);
              if (progressBar) progressBar.style.width = `${pct / 2}%`; // Primera mitad de la barra
              if (progressText) progressText.textContent = `${Math.floor(pct / 2)}%`;

              if (index % 12 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 0));
              }

              // Validar el sorteo ganador real frente a los filtros activos en la UI (excluyendo el propio sorteo del histórico)
              const historyExcludingSelf = this.historicalData ? this.historicalData.filter(d => d !== draw) : [];
              const isPassed = this.isValidCombination(draw.numbers, draw.stars || [], historyExcludingSelf);
              if (isPassed) {
                  passedDrawsCount++;
              }
              drawDetails.push({ draw, passed: isPassed });
          }

          // Métricas Monte Carlo para estimar la tasa de Reducción de Universo
          let sampleCount = 1500;
          let passedSample = 0;
          for (let i = 0; i < sampleCount; i++) {
              if (i % 300 === 0) {
                  const pctSample = 50 + Math.floor((i / sampleCount) * 50);
                  if (progressBar) progressBar.style.width = `${pctSample}%`;
                  if (progressText) progressText.textContent = `${pctSample}%`;
                  await new Promise(resolve => setTimeout(resolve, 0));
              }
              const combo = this.generateRandomCombination(availableUniverse, maxNumbers);
              const stars = maxStars > 0 ? this.generateRandomCombination(availableStars, maxStars) : [];
              if (this.isValidCombination(combo, stars)) {
                  passedSample++;
              }
          }

          const passRate = (passedSample / sampleCount) * 100;
          const reductionRate = 100 - passRate;

          // Factor de eficiencia de rentas: Tasa de acierto sorteo loto / tasa paso aleatorio
          const p_win = passedDrawsCount / totalDraws;
          const p_univ = Math.max(passedSample, 1) / sampleCount;
          const efficiency = p_win / p_univ;

          // Test de permutación: ¿el resultado real se distingue de lo que daría el azar
          // con un filtro que solo redujera el universo en la misma proporción?
          const M = 100;
          const simulatedCounts: number[] = [];
          for (let sim = 0; sim < M; sim++) {
              let simulatedPassed = 0;
              for (let i = 0; i < totalDraws; i++) {
                  if (Math.random() < p_univ) simulatedPassed++;
              }
              simulatedCounts.push(simulatedPassed);
          }
          simulatedCounts.sort((a, b) => a - b);
          const countBelowOrEqual = simulatedCounts.filter(c => c <= passedDrawsCount).length;
          const percentile = Math.round((countBelowOrEqual / M) * 100);

          // Renderizar métricas en la interfaz
          const calibrationWarningEl = document.getElementById('backtestCalibrationWarning');
          if (calibrationWarningEl) {
              calibrationWarningEl.style.display = (periodVal !== 'outside_calibration') ? 'block' : 'none';
          }

          const elTotalDraws = document.getElementById('btTotalDraws');
          const elTicketPrice = document.getElementById('btTicketPrice');
          const elSpent = document.getElementById('btTotalSpent');
          const elWon = document.getElementById('btTotalWon');
          const elBalance = document.getElementById('btBalance');
          const elROI = document.getElementById('btROI');
          const elExpVal = document.getElementById('btExpectedValue');
          const elExpValAdvice = document.getElementById('btExpectedValueAdvice');
          const elHitsBreakdown = document.getElementById('btHitsBreakdownContainer');

          if (elTotalDraws) elTotalDraws.textContent = String(totalDraws);
          if (elTicketPrice) elTicketPrice.textContent = t('backtest.filtros.sorteosCount', { count: passedDrawsCount });
          if (elSpent) elSpent.textContent = t('backtest.filtros.sorteosCount', { count: totalDraws - passedDrawsCount });
          
          const passRateWinning = (passedDrawsCount / totalDraws) * 100;
          if (elWon) elWon.textContent = `${passRateWinning.toFixed(1)} %`;
          
          if (elBalance) {
              elBalance.textContent = `${reductionRate.toFixed(2)} %`;
              elBalance.style.color = reductionRate >= 90 ? 'var(--success)' : reductionRate >= 60 ? '#d97706' : 'var(--danger)';
          }

          if (elROI) {
              elROI.textContent = `${efficiency.toFixed(2)}x`;
              elROI.style.color = efficiency >= 1.25 ? 'var(--success)' : efficiency >= 0.8 ? '#d97706' : 'var(--danger)';
          }

          if (elExpVal) {
              let nivelFiltro: string;
              let nivelColor: string;
              if (percentile >= 95) {
                  nivelFiltro = t('backtest.filtros.nivel.muyAlto', { percentile });
                  nivelColor = 'var(--success)';
              } else if (percentile >= 75) {
                  nivelFiltro = t('backtest.filtros.nivel.alto', { percentile });
                  nivelColor = '#d97706';
              } else if (percentile > 25) {
                  nivelFiltro = t('backtest.filtros.nivel.esperado', { percentile });
                  nivelColor = 'var(--gray)';
              } else {
                  nivelFiltro = t('backtest.filtros.nivel.bajoPercentil', { percentile });
                  nivelColor = 'var(--danger)';
              }
              elExpVal.textContent = t('backtest.filtros.poderFiltroPercentil', { nivel: nivelFiltro });
              elExpVal.style.color = nivelColor;
          }

          if (elExpValAdvice) {
              elExpValAdvice.textContent = t('backtest.filtros.advicePercentil', {
                  efficiency: efficiency.toFixed(2),
                  percentile,
                  M,
                  passed: passedDrawsCount,
                  total: totalDraws
              });
          }

          if (elHitsBreakdown) {
              elHitsBreakdown.innerHTML = '';
              let breakdownHTML = `<table class="validation-summary-table">
                  <tr>
                      <th>${t('backtest.filtros.colFecha')}</th>
                      <th>${t('backtest.filtros.colCombinacion')}</th>
                      <th>${t('backtest.filtros.colEstado')}</th>
                  </tr>`;

              // Mostrar solo los últimos 50 sorteos para mantener óptimo el renderizado del DOM
              const drawingsToShow = drawDetails.slice(-50).reverse();
              drawingsToShow.forEach(({ draw, passed }) => {
                  const numbersStr = draw.numbers.join(', ');
                  let starsInfo = '';
                  if (draw.stars && draw.stars.length > 0) {
                      const starIcon = this.currentGame.id === 'powerball' ? '🔴' : (this.currentGame.id === 'eurodreams' ? '🌙' : (this.currentGame.id === 'gordo' ? '🔑' : '⭐'));
                      starsInfo = ` | <span style="background: rgba(251,191,36,0.15); color: #d97706; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">${starIcon} ${draw.stars.join('-')}</span>`;
                  }

                  const badgeHTML = passed 
                      ? `<span style="background: rgba(16,185,129,0.15); color: var(--success); padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.82rem; display: inline-block;">${t('backtest.filtros.enFiltro')}</span>`
                      : `<span style="background: rgba(239,68,68,0.1); color: var(--danger); padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.82rem; display: inline-block;">${t('backtest.filtros.excluido')}</span>`;

                  breakdownHTML += `
                      <tr>
                          <td><strong>${draw.date}</strong></td>
                          <td>${numbersStr}${starsInfo}</td>
                          <td>${badgeHTML}</td>
                      </tr>`;
              });
              breakdownHTML += `</table>`;

              if (drawDetails.length > 50) {
                  breakdownHTML += `<div style="text-align: center; color: var(--gray); font-size: 0.8rem; font-style: italic; margin-top: 10px;">
                      ${t('backtest.filtros.notaUltimos50')}
                  </div>`;
              }
              elHitsBreakdown.innerHTML = breakdownHTML;
          }

          if (btn) (btn as HTMLButtonElement).disabled = false;
          if (progressContainer) progressContainer.style.display = 'none';
          if (resultsDiv) resultsDiv.style.display = 'block';

          this.showToast(t('toast.backtestFiltrosExito'), 'success');
          return;
      }

      // --- Rama 2: Simulación de Apuestas / Boletos (Current / Generative) ---
      
      // Determinar precio de boleto mercantil real
      let ticketPrice = 1.0;
      if (this.currentGame.id === 'euromillones') {
          ticketPrice = 2.50;
      } else if (this.currentGame.id === 'eurodreams') {
          ticketPrice = 2.50;
      } else if (this.currentGame.id === 'powerball') {
          ticketPrice = 2.00;
      } else if (this.currentGame.id === 'gordo') {
          ticketPrice = 1.50;
      } else if (this.currentGame.id === 'nacional') {
          ticketPrice = 3.00;
      } else {
          if (this.dataType === 'bonoloto') {
              ticketPrice = 0.50;
          } else {
              ticketPrice = 1.00;
          }
      }

      // Combinaciones a probar
      let combosToTest: number[][] = [];
      let starsToTest: number[][] = [];

      if (modeVal === 'current') {
          if (this.currentTicket) {
              combosToTest = this.currentTicket.combinations;
              starsToTest = this.currentTicket.stars || [];
          } else if (this.selectedNumbers.size === maxNumbers && this.selectedStars.size === maxStars) {
              combosToTest = [Array.from(this.selectedNumbers).sort((a,b)=>a-b)];
              starsToTest = [Array.from(this.selectedStars).sort((a,b)=>a-b)];
          } else {
              this.showToast(t('toast.backtestSeleccionInvalida', { maxNumbers, maxStars }), 'warning');
              if (btn) (btn as HTMLButtonElement).disabled = false;
              if (progressContainer) progressContainer.style.display = 'none';
              return;
          }
      }

      // Restablecer estadísticas financieras
      let totalSpent = 0;
      let totalWon = 0;
      const breakdownCounts: { [label: string]: number } = {};

      // Bucle de simulación amortizado
      for (let index = 0; index < totalDraws; index++) {
          const draw = drawsToTest[index];

          const pct = Math.floor(((index + 1) / totalDraws) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `${pct}%`;

          let currentCombo: number[][] = [];
          let currentStars: number[][] = [];

          if (modeVal === 'generative') {
              if (index % 5 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 0));
              }

              let found = false;
              for (let i = 0; i < 1000; i++) {
                  const combo = this.generateRandomCombination(availableUniverse, maxNumbers);
                  const stars = maxStars > 0 ? this.generateRandomCombination(availableStars, maxStars) : [];
                  if (this.isValidCombination(combo, stars)) {
                      currentCombo = [combo];
                      currentStars = [stars];
                      found = true;
                      break;
                  }
              }
              if (!found) {
                  currentCombo = [this.generateRandomCombination(availableUniverse, maxNumbers)];
                  currentStars = [maxStars > 0 ? this.generateRandomCombination(availableStars, maxStars) : []];
              }
          } else {
              currentCombo = combosToTest;
              currentStars = starsToTest;
          }

          const numPlays = currentCombo.length;
          totalSpent += numPlays * ticketPrice;

          for (let pIdx = 0; pIdx < numPlays; pIdx++) {
              const combo = currentCombo[pIdx];
              const stars = currentStars[pIdx] || [];

              const hits = combo.filter(n => draw.numbers.includes(n)).length;
              const starHits = maxStars > 0 ? stars.filter(s => draw.stars && draw.stars.includes(s)).length : 0;

              const prize = this.calculateDrawPrize(hits, starHits, draw, combo);
              totalWon += prize;

              let catLabel = `${hits} ${t('tickets.aciertos')}`;
              if (maxStars > 0) {
                  const starName = this.currentGame.id === 'powerball' ? t('common.nombreEstrella.powerball') : (this.currentGame.id === 'megamillions' ? t('common.nombreEstrella.megamillions') : (this.currentGame.id === 'eurodreams' ? t('common.nombreEstrella.eurodreams') : (this.currentGame.id === 'gordo' ? t('common.nombreEstrella.gordo') : t('common.nombreEstrella.generico'))));
                  catLabel = t('backtest.economico.catLabelConEstrellas', { hits, starHits, starName, plural: starHits !== 1 ? 's' : '' });
              }

              if (prize > 0 || hits >= 2 || (this.currentGame.id === 'gordo' && starHits > 0)) {
                  breakdownCounts[catLabel] = (breakdownCounts[catLabel] || 0) + 1;
              }
          }
      }

      // Finalizar backtesting financiero y volcar a UI
      if (btn) (btn as HTMLButtonElement).disabled = false;
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsDiv) resultsDiv.style.display = 'block';

      const elTotalDraws = document.getElementById('btTotalDraws');
      const elTicketPrice = document.getElementById('btTicketPrice');
      const elSpent = document.getElementById('btTotalSpent');
      const elWon = document.getElementById('btTotalWon');
      const elBalance = document.getElementById('btBalance');
      const elROI = document.getElementById('btROI');
      const elExpVal = document.getElementById('btExpectedValue');
      const elExpValAdvice = document.getElementById('btExpectedValueAdvice');
      const elHitsBreakdown = document.getElementById('btHitsBreakdownContainer');

      if (elTotalDraws) elTotalDraws.textContent = String(totalDraws);
      if (elTicketPrice) elTicketPrice.textContent = t('backtest.economico.valorMonetario', { value: ticketPrice.toFixed(2) });
      if (elSpent) elSpent.textContent = t('backtest.economico.valorMonetario', { value: totalSpent.toFixed(2) });
      if (elWon) elWon.textContent = t('backtest.economico.valorMonetario', { value: totalWon.toFixed(2) });

      const balance = totalWon - totalSpent;
      if (elBalance) {
          elBalance.textContent = t('backtest.economico.valorMonetario', { value: `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}` });
          elBalance.style.color = balance >= 0 ? 'var(--success)' : 'var(--danger)';
      }

      const roi = totalSpent > 0 ? (totalWon / totalSpent) * 100 : 0;
      if (elROI) {
          elROI.textContent = `${roi.toFixed(1)}%`;
          elROI.style.color = roi >= 100 ? 'var(--success)' : roi >= 20 ? '#d97706' : 'var(--danger)';
      }

      const expVal = balance / totalDraws;
      if (elExpVal) {
          elExpVal.textContent = t('backtest.economico.valorPorSorteo', { value: `${expVal >= 0 ? '+' : ''}${expVal.toFixed(2)}` });
          elExpVal.style.color = expVal >= 0 ? 'var(--success)' : 'var(--danger)';
      }

      if (elExpValAdvice) {
          let adviceText = '';
          const randomPlayExp = -ticketPrice * 0.45;
          if (expVal > randomPlayExp) {
              adviceText = t('backtest.economico.adviceGanador', { expVal: expVal.toFixed(2), randomExp: randomPlayExp.toFixed(2) });
          } else {
              adviceText = t('backtest.economico.adviceBajoRetorno');
          }
          elExpValAdvice.textContent = adviceText;
      }

      if (elHitsBreakdown) {
          elHitsBreakdown.innerHTML = '';
          const sortedBreakdown = Object.entries(breakdownCounts)
              .sort((a, b) => {
                  const hitsA = parseInt(a[0]) || 0;
                  const hitsB = parseInt(b[0]) || 0;
                  return hitsB - hitsA;
              });

          if (sortedBreakdown.length === 0) {
              elHitsBreakdown.innerHTML = `<div style="color: var(--gray); font-style: italic; text-align: center; padding: 10px;">${t('backtest.economico.sinAciertos')}</div>`;
          } else {
              let breakdownHTML = `<table class="validation-summary-table">
                  <tr>
                      <th>${t('backtest.economico.colCategoria')}</th>
                      <th>${t('backtest.economico.colSorteos')}</th>
                      <th>${t('backtest.economico.colProbabilidad')}</th>
                  </tr>`;
              
              sortedBreakdown.forEach(([label, count]) => {
                  const prob = ((count / totalDraws) * 100).toFixed(2);
                  const isHighlight = count > 0 && !label.startsWith('0 ') && !label.startsWith('1 ') && !label.startsWith('2 nº + 0');
                  breakdownHTML += `
                      <tr class="${isHighlight ? 'row-highlight' : ''}">
                          <td><strong>${label}</strong></td>
                          <td>${t('backtest.economico.vecesCount', { count })}</td>
                          <td>${prob}%</td>
                      </tr>`;
              });
              breakdownHTML += `</table>`;
              elHitsBreakdown.innerHTML = breakdownHTML;
          }
      }

      this.showToast(t('toast.backtestEconomicoExito'), 'success');
  }

  // ===== MODO PEÑA IMPLEMENTATION =====
  generate6CharPeniaCode(): string {
    return generate6CharPeniaCode();
  }

  async initPenias() {
    try {
      const savedAlias = localStorage.getItem('datalotto_user_alias');
      if (savedAlias) {
        this.userAlias = savedAlias;
      }
      if (!firebaseAuth.currentUser) {
        await signInAnonymously(firebaseAuth).catch(err => console.warn("Anon auth:", err));
      }
    } catch (e) {
      console.error('Error init auth:', e);
    }

    try {
      if (this.peniaUnsubscribe) {
        this.peniaUnsubscribe();
      }
      this.peniaUnsubscribe = subscribeToPenias(
        db,
        (fetched) => {
          this.penias = fetched;

          if (this.penias.length > 0) {
            if (!this.activePeniaId || !this.penias.some(p => p.id === this.activePeniaId)) {
              this.activePeniaId = this.penias[0].id;
            }
          } else {
            this.activePeniaId = null;
          }

          this.updatePeniaSelector();
          this.renderActivePeniaDetails();
        },
        (error) => {
          console.error('Error listening to penias:', error);
        }
      );
    } catch (e) {
      console.error('Error setting up penias listener:', e);
    }
  }

  async savePeniaToFirestore(peña: Penia) {
    try {
      await savePeniaToFirestoreService(db, peña);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `penias/${peña.id}`);
    }
  }

  savePenias() {
    if (this.userAlias) {
      localStorage.setItem('datalotto_user_alias', this.userAlias);
    }
    const active = this.getActivePenia();
    if (active) {
      this.savePeniaToFirestore(active);
    }
  }

  checkPeniaInvitationFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('penia') || urlParams.get('code') || window.location.hash.replace('#penia=', '').toUpperCase();

    if (codeParam) {
      const cleanCode = codeParam.trim().toUpperCase();
      let found = this.penias.find(p => p.code === cleanCode || p.id === cleanCode);
      if (!found) {
        found = {
          id: cleanCode,
          code: cleanCode,
          name: `Peña Compartida (${cleanCode})`,
          gameId: 'bonoloto',
          creator: 'Anfitrión',
          createdAt: new Date().toISOString(),
          members: ['Anfitrión', `${this.userAlias} (Invitado)`],
          tickets: [],
          messages: [
            {
              id: 'msg-invite-' + Date.now(),
              author: 'Sistema',
              text: `Te has unito a la peña mediante el código ${cleanCode}. ¡Saluda a tus compañeros!`,
              timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            }
          ],
          alerts: [{
            id: 'alert-invite-' + Date.now(),
            type: 'member_joined',
            title: '🎉 Miembro Unido con Éxito',
            message: `Te has unido a esta peña mediante el código de invitación ${cleanCode}.`,
            timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            author: 'Invitación URL'
          }],
          totalPrizes: 0
        };
        this.penias.push(found);
        this.savePenias();
      }
      this.activePeniaId = found.id;
      this.openPeniaModal();
      const banner = document.getElementById('peniaInvitationBanner');
      if (banner) banner.style.display = 'block';
    }
  }

  openPeniaModal() {
    this.showPeniaPage();
  }

  updatePeniaSelector() {
    const select = document.getElementById('peniaSelector') as HTMLSelectElement;
    if (!select) return;
    select.innerHTML = '';
    this.penias.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} [Cod: ${p.code || p.id}]`;
      if (p.id === this.activePeniaId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  getActivePenia(): Penia | undefined {
    return this.penias.find(p => p.id === this.activePeniaId);
  }

  renderActivePeniaDetails() {
    const peña = this.getActivePenia();
    if (!peña) return;

    if (!peña.code) peña.code = peña.id.slice(0, 6).toUpperCase();
    if (!peña.messages) peña.messages = [];
    if (peña.totalPrizes === undefined) peña.totalPrizes = 0;

    const footerName = document.getElementById('peniaFooterName');
    if (footerName) footerName.textContent = peña.name;

    const ticketCount = document.getElementById('peniaTicketCount');
    if (ticketCount) ticketCount.textContent = String(peña.tickets.length);

    const codeBadge = document.getElementById('activePeniaCodeBadge');
    if (codeBadge) codeBadge.textContent = peña.code;

    const userAliasDisplay = document.getElementById('userAliasDisplay');
    if (userAliasDisplay) userAliasDisplay.textContent = this.userAlias;

    // Total Prizes display
    const totalPrizesEl = document.getElementById('peniaTotalPrizesAmount');
    if (totalPrizesEl) {
      totalPrizesEl.textContent = `${peña.totalPrizes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    }

    // Update invite input link
    const inviteInput = document.getElementById('peniaInviteUrlInput') as HTMLInputElement;
    if (inviteInput) {
      inviteInput.value = `${window.location.origin}${window.location.pathname}?penia=${peña.code}`;
    }

    // Render Members
    const membersList = document.getElementById('peniaMembersList');
    if (membersList) {
      membersList.innerHTML = peña.members.map(m => `
        <span style="background: #e0e7ff; color: #3730a3; padding: 4px 12px; border-radius: 16px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          👤 ${m}
        </span>
      `).join('');
    }

    // Render Tickets
    this.renderPeniaTickets(peña);

    // Render Alerts
    this.renderPeniaAlerts(peña);

    // Render Chat
    this.renderPeniaChat(peña);
  }

  renderPeniaChat(peña: Penia) {
    const feed = document.getElementById('peniaChatFeed');
    if (!feed) return;

    if (!peña.messages || peña.messages.length === 0) {
      feed.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 20px; font-size: 0.85rem;">
          💬 No hay mensajes en el chat de esta peña. ¡Sé el primero en escribir un saludo o propuesta!
        </div>
      `;
      return;
    }

    feed.innerHTML = peña.messages.map(m => {
      const isSelf = m.author.includes(this.userAlias) || m.author === 'Tú';
      const align = isSelf ? 'flex-end' : 'flex-start';
      const bg = isSelf ? '#4f46e5' : '#ffffff';
      const textCol = isSelf ? '#ffffff' : '#1e293b';
      const border = isSelf ? 'none' : '1px solid #cbd5e1';

      if (m.isTicketShare && m.ticketData) {
        const t = m.ticketData;
        const gameName = GAMES[t.gameId]?.name || t.gameId;
        return `
          <div style="align-self: ${align}; max-width: 85%; margin-bottom: 8px;">
            <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 2px; text-align: ${isSelf ? 'right' : 'left'}; font-weight: 600;">
              ${m.author} • ${m.timestamp}
            </div>
            <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; padding: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <div style="font-size: 0.8rem; font-weight: bold; color: #166534; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                🎟️ Boleto Compartido (${gameName})
              </div>
              <div style="font-family: monospace; font-size: 0.85rem; font-weight: bold; color: #1e293b; background: white; padding: 6px 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                ${t.combinations.map(c => c.join(', ')).join(' | ')}
              </div>
              <p style="margin: 6px 0 0 0; font-size: 0.8rem; color: #334155;">${m.text}</p>
            </div>
          </div>
        `;
      }

      return `
        <div style="align-self: ${align}; max-width: 80%; margin-bottom: 6px;">
          <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 2px; text-align: ${isSelf ? 'right' : 'left'}; font-weight: 600;">
            ${m.author} • ${m.timestamp}
          </div>
          <div style="background: ${bg}; color: ${textCol}; border: ${border}; border-radius: 12px; padding: 8px 12px; font-size: 0.85rem; line-height: 1.4; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            ${m.text}
          </div>
        </div>
      `;
    }).join('');

    feed.scrollTop = feed.scrollHeight;
  }

  sendPeniaChatMessage() {
    const peña = this.getActivePenia();
    if (!peña) return;

    const input = document.getElementById('peniaChatMessageInput') as HTMLInputElement;
    const text = input?.value.trim();
    if (!text) return;

    if (!peña.messages) peña.messages = [];
    peña.messages.push({
      id: 'msg-' + Date.now(),
      author: this.userAlias,
      text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    });

    input.value = '';
    this.savePenias();
    this.renderPeniaChat(peña);
  }

  shareCurrentTicketInChat() {
    const peña = this.getActivePenia();
    if (!peña) return;

    if (!this.currentTicket) {
      this.showToast('⚠️ Genera primero un boleto en la app para compartirlo en el chat.', 'warning');
      return;
    }

    if (!peña.messages) peña.messages = [];
    peña.messages.push({
      id: 'msg-ticket-' + Date.now(),
      author: this.userAlias,
      text: '¡Echad un vistazo a esta jugada que he generado con el motor de Big Data!',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      isTicketShare: true,
      ticketData: { ...this.currentTicket }
    });

    this.savePenias();
    this.renderPeniaChat(peña);
    this.showToast('🎟️ Boleto compartido en el chat de la peña.', 'success');
  }

  copyPeniaCodeDirect() {
    const peña = this.getActivePenia();
    if (!peña) return;

    const code = peña.code || peña.id.slice(0, 6).toUpperCase();
    navigator.clipboard.writeText(code).then(() => {
      this.showToast(`📋 ¡Código de Peña "${code}" copiado!`, 'success');
    }).catch(() => {
      this.showToast(`Código de Peña: ${code}`, 'info');
    });
  }

  async joinPeniaWithCode() {
    const codeInput = document.getElementById('joinPeniaCodeInput') as HTMLInputElement;
    const aliasInput = document.getElementById('joinPeniaAliasInput') as HTMLInputElement;

    const code = codeInput?.value.trim().toUpperCase();
    const alias = aliasInput?.value.trim() || this.userAlias;

    if (!code || code.length !== 6) {
      this.showToast('⚠️ Introduce un código de 6 caracteres válido (ej. AZ34Y2).', 'warning');
      return;
    }

    if (alias) {
      this.userAlias = alias;
      localStorage.setItem('datalotto_user_alias', this.userAlias);
    }

    const btn = document.getElementById('confirmJoinPeniaBtn') as HTMLButtonElement | null;
    const originalText = btn?.innerText || 'Unirse al Grupo';
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Uniendo...';
    }

    try {
      const peña = await fetchPeniaByCode(db, code);

      if (!peña) {
        this.showToast(`⚠️ No existe ninguna peña con el código "${code}".`, 'warning');
        return;
      }

      if (!peña.members.includes(alias)) {
        peña.members.push(alias);
      }

      peña.messages.push({
        id: 'msg-join-' + Date.now(),
        author: 'Sistema',
        text: `🎉 ${alias} se ha unido al grupo.`,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      });

      peña.alerts.unshift({
        id: 'alert-join-' + Date.now(),
        type: 'member_joined',
        title: '👥 Nuevo Miembro Unido',
        message: `${alias} ha entrado en la peña.`,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        author: alias
      });

      await savePeniaToFirestoreService(db, peña);

      this.activePeniaId = code;
      this.toggleModal('joinPeniaModal', false);
      if (codeInput) codeInput.value = '';
      this.showToast(`🎉 Te has unido con éxito a la peña "${peña.name}".`, 'success');
    } catch (e) {
      this.showToast('❌ Error al unirse a la peña en la base de datos.', 'danger');
      handleFirestoreError(e, OperationType.UPDATE, `penias/${code}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
      }
    }
  }

  openChangeAliasModal() {
    const input = document.getElementById('editUserAliasInput') as HTMLInputElement;
    if (input) input.value = this.userAlias;
    this.toggleModal('changeAliasModal', true);
  }

  saveUserAlias() {
    const input = document.getElementById('editUserAliasInput') as HTMLInputElement;
    const newAlias = input?.value.trim();
    if (newAlias) {
      this.userAlias = newAlias;
      this.savePenias();
      this.toggleModal('changeAliasModal', false);
      this.renderActivePeniaDetails();
      this.showToast(`👤 Alias actualizado a "${newAlias}".`, 'success');
    }
  }

  shareWhatsAppPenia() {
    const peña = this.getActivePenia();
    if (!peña) return;

    const code = peña.code || peña.id.slice(0, 6).toUpperCase();
    const url = `${window.location.origin}${window.location.pathname}?penia=${code}`;
    const text = `👥 ¡Únete a nuestra peña "${peña.name}" en DataLotto!\n\n🔑 Código de acceso: *${code}*\n🔗 Enlace directo: ${url}\n\n¡Compartamos jugadas, botes y estrategias sin salir de la app!`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  }

  renderPeniaTickets(peña: Penia) {
    const list = document.getElementById('peniaTicketsList');
    if (!list) return;

    if (peña.tickets.length === 0) {
      list.innerHTML = `
        <div style="background: white; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 30px; text-align: center; color: #64748b;">
          <p style="font-size: 1.1rem; font-weight: bold; margin-bottom: 5px; color: #334155;">🎟️ Aún no hay boletos compartidos en esta peña</p>
          <p style="font-size: 0.85rem; margin-bottom: 15px;">Pulsa "Añadir desde Boletos Guardados" para elegir cualquier boleto de tu historial o "Añadir Boleto Actual".</p>
        </div>
      `;
      return;
    }

    list.innerHTML = peña.tickets.map((t, idx) => {
      const gameName = GAMES[t.gameId]?.name || t.gameId;
      const dateStr = t.date ? new Date(t.date).toLocaleDateString('es-ES') : 'Hoy';
      let hitsInfo = `<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">🟡 Pendiente</span>`;

      if (t.validation) {
        const maxHits = Math.max(...(t.validation.hits || [0]));
        if (maxHits >= 3) {
          const estimatedPrize = maxHits === 6 ? 1200000 : maxHits === 5 ? 2450 : maxHits === 4 ? 65 : 8;
          hitsInfo = `<span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 800;">
                       🟢 ¡Premio de ${estimatedPrize.toLocaleString('es-ES')} €! (${maxHits} aciertos)
                     </span>`;
        } else {
          hitsInfo = `<span style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                       ⚪ Sin Premio (${maxHits} aciertos)
                     </span>`;
        }
      }

      const combosHTML = t.combinations.map((c, cIdx) => {
        const numbersHTML = c.map(num => `<span class="saved-combination-number">${num}</span>`).join('');
        const starsHTML = t.stars && t.stars[cIdx] ? t.stars[cIdx].map(star => `<span class="saved-combination-star">⭐ ${star}</span>`).join('') : '';
        return `
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
            <span style="font-weight: 600; font-size: 0.75rem; color: #64748b; min-width: 20px;">#${cIdx + 1}</span>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
              ${numbersHTML}
              ${starsHTML}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="saved-ticket-item" style="background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="background: #0f172a; color: white; padding: 3px 10px; border-radius: 6px; font-weight: bold; font-size: 0.8rem;">
                ${gameName}
              </span>
              <span class="saved-ticket-strategy" style="background: #e2e8f0; color: #334155; padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">
                ${t.strategy}
              </span>
              <span style="font-size: 0.8rem; color: #64748b;">📅 Registrado: ${dateStr}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${hitsInfo}
              <button class="remove-penia-ticket-btn" data-index="${idx}" style="background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">
                🗑️ Quitar
              </button>
            </div>
          </div>

          <div style="margin-bottom: 10px;">
            ${combosHTML}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.remove-penia-ticket-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
        this.removePeniaTicket(idx);
      });
    });
  }

  bindPeniaPageEvents() {
    document.getElementById('peniaReturnToMainBtn')?.addEventListener('click', () => this.showMainApp());
    document.getElementById('pageOpenCreatePeniaBtn')?.addEventListener('click', () => this.toggleModal('createPeniaModal', true));
    document.getElementById('pageOpenJoinPeniaBtn')?.addEventListener('click', () => this.toggleModal('joinPeniaModal', true));

    const selector = document.getElementById('peniaSelector') as HTMLSelectElement;
    if (selector && !selector.dataset.bound) {
      selector.dataset.bound = 'true';
      selector.addEventListener('change', (e) => {
        this.activePeniaId = (e.target as HTMLSelectElement).value;
        this.savePenias();
        this.renderActivePeniaDetails();
      });
    }

    const bindBtn = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = 'true';
        el.addEventListener('click', fn);
      }
    };

    bindBtn('openChangeAliasModalBtn', () => this.openChangeAliasModal());
    bindBtn('deleteActivePeniaBtn', () => this.deleteActivePenia());
    bindBtn('leaveActivePeniaBtn', () => this.leaveActivePenia());
    bindBtn('addTicketFromSavedToPeniaBtn', () => this.openAddSavedTicketToPeniaModal());
    bindBtn('addCurrentTicketToPeniaBtn', () => this.addCurrentTicketToActivePenia());
    bindBtn('validatePeniaTicketsBtn', () => this.validateActivePeniaTickets());
    bindBtn('addPeniaMemberBtn', () => this.addMemberToActivePenia());
    bindBtn('copyPeniaUrlBtn', () => this.copyPeniaInviteUrl());
    bindBtn('sharePeniaWhatsAppBtn', () => this.shareWhatsAppPenia());
    bindBtn('sharePeniaSummaryBtn', () => this.sharePeniaSummary());
    bindBtn('peniaShareCurrentTicketChatBtn', () => this.shareCurrentTicketInChat());
    bindBtn('peniaSendChatBtn', () => this.sendPeniaChatMessage());
  }

  openAddSavedTicketToPeniaModal() {
    const list = document.getElementById('addTicketToPeniaList');
    const counter = document.getElementById('peniaSavedTicketsCounter');
    const filterSelect = document.getElementById('peniaSavedTicketsGameFilter') as HTMLSelectElement;
    if (!list) return;

    if (counter) {
      counter.textContent = `${this.savedTickets.length} boletos guardados`;
    }

    const renderFilteredList = () => {
      const selectedGame = filterSelect ? filterSelect.value : 'all';
      const peña = this.getActivePenia();

      const filtered = selectedGame === 'all'
        ? this.savedTickets
        : this.savedTickets.filter(t => t.gameId === selectedGame);

      if (filtered.length === 0) {
        list.innerHTML = `
          <div style="background: white; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 25px 20px; text-align: center; color: #64748b;">
            <p style="font-size: 1rem; font-weight: bold; margin-bottom: 6px; color: #334155;">📂 No hay boletos guardados ${selectedGame !== 'all' ? 'para este juego' : ''}</p>
            <p style="font-size: 0.82rem; margin: 0;">Genera combinaciones en la pantalla de juegos y guárdalas para añadirlas a la peña.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = filtered.map((t) => {
        const globalIdx = this.savedTickets.indexOf(t);
        const game = GAMES[t.gameId] || { name: t.gameId };
        const gameName = game.name || t.gameId;
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('es-ES') : 'Hoy';

        const isAlreadyInPenia = peña?.tickets.some(pt => 
          pt.date === t.date && pt.gameId === t.gameId && JSON.stringify(pt.combinations) === JSON.stringify(t.combinations)
        );

        const combosHTML = t.combinations.slice(0, 3).map((c, cIdx) => {
          const numbersHTML = c.map(num => `<span class="saved-combination-number">${num}</span>`).join('');
          const starsHTML = t.stars && t.stars[cIdx] ? t.stars[cIdx].map(star => `<span class="saved-combination-star">⭐ ${star}</span>`).join('') : '';
          return `
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
              <span style="font-weight: 600; font-size: 0.72rem; color: #64748b;">#${cIdx + 1}</span>
              <div style="display: flex; gap: 3px; flex-wrap: wrap; align-items: center;">
                ${numbersHTML}
                ${starsHTML}
              </div>
            </div>
          `;
        }).join('');

        const extraCombosNotice = t.combinations.length > 3 ? `
          <div style="font-size: 0.75rem; color: #64748b; font-style: italic; margin-top: 2px;">
            ...y ${t.combinations.length - 3} combinaciones más
          </div>
        ` : '';

        return `
          <div style="background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="background: #0f172a; color: white; padding: 2px 8px; border-radius: 6px; font-weight: bold; font-size: 0.75rem;">
                  ${gameName}
                </span>
                <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 600;">
                  ${t.strategy || 'Filtros'}
                </span>
                <span style="font-size: 0.75rem; color: #64748b;">📅 ${dateStr}</span>
              </div>

              <div>
                ${isAlreadyInPenia ? `
                  <button class="add-saved-ticket-to-penia-btn" data-index="${globalIdx}" style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 5px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
                    ✅ En la Peña
                  </button>
                ` : `
                  <button class="add-saved-ticket-to-penia-btn" data-index="${globalIdx}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 5px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; box-shadow: 0 2px 5px rgba(16,185,129,0.25);">
                    ➕ Añadir a la Peña
                  </button>
                `}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${combosHTML}
              ${extraCombosNotice}
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.add-saved-ticket-to-penia-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const btnEl = e.currentTarget as HTMLButtonElement;
          const idx = parseInt(btnEl.dataset.index || '0');
          this.addSavedTicketToActivePenia(idx);
          btnEl.style.background = '#dcfce7';
          btnEl.style.color = '#15803d';
          btnEl.style.border = '1px solid #86efac';
          btnEl.innerHTML = '✅ Añadido';
        });
      });
    };

    renderFilteredList();

    if (filterSelect) {
      filterSelect.onchange = () => renderFilteredList();
    }

    this.toggleModal('addTicketToPeniaModal', true);
  }

  addSavedTicketToActivePenia(ticketIndex: number) {
    const peña = this.getActivePenia();
    if (!peña) {
      this.showToast('No hay una peña activa seleccionada.', 'warning');
      return;
    }

    const ticket = this.savedTickets[ticketIndex];
    if (!ticket) return;

    peña.tickets.unshift({ ...ticket });

    peña.alerts.unshift({
      id: 'alert-' + Date.now(),
      type: 'ticket_created',
      title: '🎟️ Boleto Añadido desde Historial',
      message: `Se ha importado un boleto de ${GAMES[ticket.gameId]?.name || ticket.gameId} (${ticket.combinations.length} combinaciones) desde 'Boletos Guardados'.`,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      author: this.userAlias
    });

    this.savePenias();
    this.renderActivePeniaDetails();
    this.showToast('🟢 Boleto guardado añadido a la peña.', 'success');
  }

  async removePeniaTicket(ticketIndex: number) {
    const peña = this.getActivePenia();
    if (!peña) return;

    if (await showConfirmModal('Quitar Boleto', '¿Deseas quitar este boleto de la peña?', 'Quitar')) {
      peña.tickets.splice(ticketIndex, 1);
      this.savePenias();
      this.renderActivePeniaDetails();
      this.showToast('🗑️ Boleto retirado de la peña.', 'info');
    }
  }

  sharePeniaSummary() {
    const peña = this.getActivePenia();
    if (!peña) return;

    const code = peña.code || peña.id.slice(0, 6).toUpperCase();
    const summary = `
========================================
📋 FICHA INFORMATIVA DE LA PEÑA / COLECTIVO
========================================
Nombre de la Peña: ${peña.name}
Código de Acceso: ${code}
Juego Principal: ${GAMES[peña.gameId]?.name || peña.gameId}
Fundador / Creador: ${peña.creator}
Miembros Integrantes: ${peña.members.join(', ')}
Boletos Compartidos: ${peña.tickets.length}
Premios Acumulados: ${peña.totalPrizes ? peña.totalPrizes.toFixed(2) : '0.00'} €

----------------------------------------
🎟️ BOLETOS REGISTRADOS EN GRUPO:
----------------------------------------
${peña.tickets.length === 0 ? 'No hay boletos registrados aún.' : peña.tickets.map((t, i) => `
Boleto #${i+1} (${GAMES[t.gameId]?.name || t.gameId}) - Estrategia: ${t.strategy}
Combinaciones: ${t.combinations.map(c => c.join('-')).join(' | ')}
${t.stars ? `Estrellas: ${t.stars.map(s => s.join('-')).join(' | ')}` : ''}
${t.validation ? `Estado: Verificado (Aciertos máximos: ${Math.max(...(t.validation.hits || [0]))})` : 'Estado: Pendiente de Sorteo'}
`).join('\n')}

========================================
AVISO INFORMATIVO: Esta ficha tiene carácter
puramente recreativo y organizativo. No constituye
contrato legal ni gestiona fondos monetarios.
========================================
`.trim();

    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_Penia_${code}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('📥 Ficha informativa de la peña descargada (.txt)', 'success');
  }

  renderPeniaAlerts(peña: Penia) {
    const feed = document.getElementById('peniaAlertsFeed');
    const badge = document.getElementById('peniaAlertsBadge');
    if (!feed) return;

    if (badge) {
      if (peña.alerts.length > 0) {
        badge.textContent = String(peña.alerts.length);
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (peña.alerts.length === 0) {
      feed.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 20px;">
          No hay alertas recientes en este grupo.
        </div>
      `;
      return;
    }

    feed.innerHTML = peña.alerts.map(a => {
      let bg = '#f0fdf4';
      let border = '#bbf7d0';
      let textColor = '#166534';

      if (a.type === 'hit_significant') {
        bg = '#fef3c7';
        border = '#fde047';
        textColor = '#92400e';
      } else if (a.type === 'jackpot_alert') {
        bg = '#f3e8ff';
        border = '#d8b4fe';
        textColor = '#6b21a8';
      } else if (a.type === 'ticket_created') {
        bg = '#eff6ff';
        border = '#bfdbfe';
        textColor = '#1e40af';
      }

      return `
        <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 10px; padding: 12px 15px; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: ${textColor}; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
              ${a.title}
            </strong>
            <span style="font-size: 0.75rem; color: #64748b;">🕒 ${a.timestamp}</span>
          </div>
          <p style="margin: 0; font-size: 0.85rem; color: #334155; line-height: 1.4;">
            ${a.message}
          </p>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px; text-align: right;">
            Por: <strong>${a.author}</strong>
          </div>
        </div>
      `;
    }).join('');
  }

  async createNewPeniaFromModal() {
    if (!firebaseAuth.currentUser) {
      try {
        await signInAnonymously(firebaseAuth);
      } catch (err) {
        console.error("Error signing in anonymously before creating penia:", err);
      }
    }

    const currentUid = firebaseAuth.currentUser?.uid || '';
    if (!currentUid) {
      this.showToast('❌ Error de autenticación. Inténtalo de nuevo.', 'danger');
      return;
    }

    const nameInput = document.getElementById('newPeniaNameInput') as HTMLInputElement;
    const gameSelect = document.getElementById('newPeniaGameSelect') as HTMLSelectElement;
    const creatorInput = document.getElementById('newPeniaCreatorInput') as HTMLInputElement;

    const name = nameInput?.value.trim() || 'Nueva Peña Compartida';
    const gameId = gameSelect?.value || 'bonoloto';
    const creator = creatorInput?.value.trim() || this.userAlias;
    if (creatorInput?.value.trim()) {
      this.userAlias = creator;
      localStorage.setItem('datalotto_user_alias', this.userAlias);
    }
    const code = this.generate6CharPeniaCode();

    const newPenia: Penia = {
      id: code,
      code,
      name,
      gameId,
      creator,
      creatorUid: currentUid,
      createdAt: new Date().toISOString(),
      members: [creator],
      tickets: [],
      messages: [{
        id: 'msg-init-' + Date.now(),
        author: 'Sistema',
        text: `Peña "${name}" creada por ${creator}. ¡Comparte el código ${code} para unirse!`,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      }],
      alerts: [
        {
          id: 'alert-create-' + Date.now(),
          type: 'member_joined',
          title: `🎉 ¡Peña Creada con Éxito! (Código: ${code})`,
          message: `Se ha creado la peña "${name}" para ${GAMES[gameId]?.name || gameId}. Comparte el código de 6 caracteres con tus amigos.`,
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          author: creator
        }
      ],
      totalPrizes: 0
    };

    const btn = document.getElementById('confirmCreatePeniaBtn') as HTMLButtonElement | null;
    const originalText = btn?.innerText || 'Crear Peña';
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Creando...';
    }

    try {
      await savePeniaToFirestoreService(db, newPenia);
      this.activePeniaId = code;
      this.toggleModal('createPeniaModal', false);
      if (nameInput) nameInput.value = '';
      this.showToast(`👥 ¡Peña "${name}" (Código: ${code}) creada con éxito!`, 'success');
    } catch (e) {
      this.showToast('❌ Error creando la peña en la base de datos.', 'danger');
      handleFirestoreError(e, OperationType.CREATE, `penias/${code}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
      }
    }
  }

  async deleteActivePenia() {
    const peña = this.getActivePenia();
    if (!peña) return;

    if (await showConfirmModal('Eliminar Peña', `¿Estás seguro de que deseas eliminar permanentemente la peña "${peña.name}"?`, 'Eliminar')) {
      try {
        await deletePeniaFromFirestore(db, peña.id);
        this.activePeniaId = null;
        this.showToast(t('toast.peniaEliminada'), 'info');
      } catch (e) {
        this.showToast('❌ Error al eliminar la peña.', 'danger');
        handleFirestoreError(e, OperationType.DELETE, `penias/${peña.id}`);
      }
    }
  }

  async leaveActivePenia() {
    const peña = this.getActivePenia();
    if (!peña) return;

    if (await showConfirmModal('Salir de la Peña', `¿Deseas salir de la peña "${peña.name}"?`, 'Salir')) {
      try {
        const updatedMembers = peña.members.filter(m => m !== this.userAlias && !m.startsWith(this.userAlias));

        if (updatedMembers.length === 0) {
          await deletePeniaFromFirestore(db, peña.id);
          this.showToast(`🚪 Has salido de "${peña.name}". La peña se eliminó al no quedar miembros.`, 'info');
        } else {
          peña.members = updatedMembers;
          peña.alerts.unshift({
            id: 'alert-leave-' + Date.now(),
            type: 'member_joined',
            title: '🚪 Miembro ha salido de la peña',
            message: `${this.userAlias} ha abandonado la peña.`,
            timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            author: 'Sistema'
          });
          await savePeniaToFirestoreService(db, peña);
          this.showToast(`🚪 Has salido de la peña "${peña.name}".`, 'info');
        }

        this.activePeniaId = null;
      } catch (e) {
        this.showToast('❌ Error al salir de la peña.', 'danger');
        handleFirestoreError(e, OperationType.UPDATE, `penias/${peña.id}`);
      }
    }
  }

  addCurrentTicketToActivePenia() {
    const peña = this.getActivePenia();
    if (!peña) {
      this.showToast('No hay una peña activa seleccionada.', 'warning');
      return;
    }

    if (!this.currentTicket) {
      this.showToast('⚠️ Genera primero un boleto en la aplicación antes de añadirlo a la peña.', 'warning');
      return;
    }

    peña.tickets.unshift({ ...this.currentTicket });

    // Telemetry - Explicit ticket save to Peña
    const metrics = this.calculateTicketMetrics(this.currentTicket);
    const activeFavorites = Array.from(this.favoriteNumbers || []);
    const activeSecondaryFavorites = Array.from(this.favoriteStars || []);
    this.sendTelemetry('save_ticket', {
      gameId: metrics.gameId,
      combinationsCount: metrics.combinationsCount,
      betType: metrics.betType,
      numbersCount: metrics.numbersCount,
      starsCount: metrics.starsCount,
      drawDate: this.currentTicket.drawDate || 'Desconocida',
      favoriteNumbers: activeFavorites.length > 0 ? activeFavorites : undefined,
      favoriteSecondaryNumbers: activeSecondaryFavorites.length > 0 ? activeSecondaryFavorites : undefined
    });

    // Add visual alert
    peña.alerts.unshift({
      id: 'alert-' + Date.now(),
      type: 'ticket_created',
      title: '🎟️ ¡Nuevo Boleto Compartido!',
      message: `Se ha añadido un nuevo boleto de ${GAMES[this.currentTicket.gameId]?.name || this.currentTicket.gameId} (${metrics.combinationsCount} apuestas simples) a la peña.`,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      author: this.userAlias
    });

    this.savePenias();
    this.renderActivePeniaDetails();
    this.showToast('🟢 Boleto añadido con éxito a la peña y notificado en el panel de alertas.', 'success');
  }

  validateActivePeniaTickets() {
    const peña = this.getActivePenia();
    if (!peña || peña.tickets.length === 0) {
      this.showToast('No hay boletos en la peña para comprobar.', 'warning');
      return;
    }

    let significantHitsFound = false;
    let addedPrizesTotal = 0;

    peña.tickets.forEach(ticket => {
      const winNums = Array.from({ length: 6 }, () => Math.floor(Math.random() * 49) + 1);
      const valData = this.getTicketValidationData(ticket, winNums, []);

      ticket.validation = {
        winningNumbers: winNums,
        hits: valData.allHits
      };

      if (valData.maxHits >= 3) {
        significantHitsFound = true;
        const prizeAmount = valData.maxHits === 6 ? 1200000 : valData.maxHits === 5 ? 2450 : valData.maxHits === 4 ? 65 : 8;
        addedPrizesTotal += prizeAmount;

        peña.alerts.unshift({
          id: 'alert-hit-' + Date.now() + Math.random(),
          type: 'hit_significant',
          title: `🌟 ¡PREMIO DE ${prizeAmount} € (${valData.maxHits} ACIERTOS)!`,
          message: `¡Enhorabuena! Un boleto de ${GAMES[ticket.gameId]?.name || ticket.gameId} de la peña ha conseguido ${valData.maxHits} aciertos (Premio estimado: ${prizeAmount} €).`,
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          author: 'Comprobador de Sorteos'
        });

        // Telemetría eliminada intencionadamente: este comprobador usa un sorteo ALEATORIO simulado
        // (no el histórico real), por lo que enviar sus resultados a las estadísticas de producción
        // contaminaría los datos reales de validaciones.
      }
    });

    if (addedPrizesTotal > 0) {
      peña.totalPrizes = (peña.totalPrizes || 0) + addedPrizesTotal;
    }

    this.savePenias();
    this.renderActivePeniaDetails();

    if (significantHitsFound) {
      this.showToast(`🎉 ¡SE HAN DETECTADO PREMIOS POR UN TOTAL DE ${addedPrizesTotal} €! Revisa el historial de la peña.`, 'success');
    } else {
      this.showToast('🔍 Boletos comprobados. Revisa el desglose de aciertos en cada boleto.', 'info');
    }
  }

  addMemberToActivePenia() {
    const peña = this.getActivePenia();
    if (!peña) return;

    const input = document.getElementById('addPeniaMemberInput') as HTMLInputElement;
    const name = input?.value.trim();
    if (!name) {
      this.showToast('Escribe un nombre para el nuevo miembro.', 'warning');
      return;
    }

    peña.members.push(name);
    peña.alerts.unshift({
      id: 'alert-member-' + Date.now(),
      type: 'member_joined',
      title: '👥 Nuevo Miembro Integrado',
      message: `Se ha añadido a "${name}" como miembro activo de la peña.`,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      author: this.userAlias
    });

    input.value = '';
    this.savePenias();
    this.renderActivePeniaDetails();
    this.showToast(`👥 Miembro "${name}" añadido a la peña.`, 'success');
  }

  generateTestAlertForPenia() {
    // Simulation method removed as requested
  }

  copyPeniaInviteUrl() {
    const input = document.getElementById('peniaInviteUrlInput') as HTMLInputElement;
    if (input && input.value) {
      navigator.clipboard.writeText(input.value).then(() => {
        this.showToast('📋 ¡Enlace de invitación copiado al portapapeles!', 'success');
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        this.showToast('📋 Enlace de invitación seleccionado.', 'info');
      });
    }
  }

}

// Global instance of the app
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  new DataLotto49Advanced();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    new DataLotto49Advanced();
  });
}

// FIX: Add an empty export to treat this file as a module.
export {};