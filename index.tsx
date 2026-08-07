// ============================================
// SISTEMA DE ALMACENAMIENTO PERSISTENTE
// ============================================
import { GAMES, GameConfig, getGameConfig, getDefaultFiltersForGame, getAllGames } from "./game-configs";
import { Draw, Ticket, Penia, PeniaAlert, PeniaChatMessage } from './src/types';
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
  getNumberCoords,
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
import { isValidCombination as validateCombination } from './src/utils/combinationValidator';
import {
  findValidCombinations as runFindValidCombinations,
  findValidSuperset as runFindValidSuperset,
  findAndRankWinningCombinations as runFindAndRankWinningCombinations
} from './src/utils/combinationFinder';
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
  // Star filters
  starSum: { min: number; max: number };
  starParImpar: string[];
  starBajosAltos: string[];
  starSumaDigitos: { min: number; max: number };
  starPrimos: { min: number; max: number };
  starConsecutivos: string[];
  starDistancia: { min: number; max: number };
  useMarkov: boolean;
  useNash: boolean;
  useRegression: boolean;
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
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 2,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 7,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (38 apuestas - 19,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 38,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (5 apuestas - 2,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (9 apuestas - 4,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 9,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (18 apuestas - 9,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 18,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  primitiva: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 4,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 14,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (38 apuestas - 38,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 38,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (5 apuestas - 5,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (9 apuestas - 9,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 9,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (18 apuestas - 18,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 18,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  eurodreams: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 10,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 35,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (38 apuestas - 95,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 38,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (5 apuestas - 12,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (9 apuestas - 22,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 9,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (18 apuestas - 45,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 18,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores (1 Sueño fijo).'
    }
  ],
  gordo: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (12 apuestas - 18,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (14 apuestas - 21,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (28 apuestas - 42,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 28,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (6 apuestas - 9,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (10 apuestas - 15,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 10,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (22 apuestas - 33,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 22,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (1 Clave fija).'
    }
  ],
  euromillones: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (12 apuestas - 30,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (19 apuestas - 47,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (36 apuestas - 90,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 36,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (6 apuestas - 15,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (10 apuestas - 25,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 10,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (22 apuestas - 55,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 22,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (2 estrellas fijas).'
    }
  ],
  nacional: [],
  powerball: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (12 apuestas)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (20 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 20,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (36 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 36,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (6 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (10 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 10,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (22 apuestas)',
      baseNumbersCount: 15,
      combinationsCount: 22,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores.'
    }
  ],
  megamillions: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (12 apuestas - $24.00)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (20 apuestas - $40.00)',
      baseNumbersCount: 10,
      combinationsCount: 20,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (36 apuestas - $72.00)',
      baseNumbersCount: 12,
      combinationsCount: 36,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (6 apuestas - $12.00)',
      baseNumbersCount: 10,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (10 apuestas - $20.00)',
      baseNumbersCount: 12,
      combinationsCount: 10,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (22 apuestas - $44.00)',
      baseNumbersCount: 15,
      combinationsCount: 22,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    }
  ]
};

REDUCED_SYSTEMS.primitiva = REDUCED_SYSTEMS.bonoloto;
REDUCED_SYSTEMS.euromillones = REDUCED_SYSTEMS.gordo;
REDUCED_SYSTEMS.nacional = REDUCED_SYSTEMS.gordo;

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

// Clase principal de la aplicación
class DataLotto49Advanced {
  getNumberCoords(n: number) {
    return getNumberCoords(n, this.currentGame?.gridCols || 10);
  }
  
  static APP_STATE_KEY = APP_STATE_KEY;
  static FILTER_PRESET_KEY = FILTER_PRESET_KEY;


    // FIX: Declared all class properties with their correct types to resolve property-does-not-exist errors.
    selectedNumbers: Set<number>;
    selectedStars: Set<number>; // New for Euromillones
    suggestedNumbers: Set<number>; // New for Big Data
    suggestedStars: Set<number>; // New for Euromillones Big Data
    excludedNumbers: Set<number>;
    excludedStars: Set<number>; // New for Euromillones
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
    activeDashboardFilters: Set<string>;
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
    helpModeActive: boolean;
    anonymousUserId: string;
    googleAuthToken: string | null = null;
    googleUser: User | null = null;
    vizMode: 'heatmap' | 'ranking' = 'heatmap';
    vizTarget: 'number' | 'star' = 'number';
    officialDrawsPage: number = 1;
    officialDrawsPageSize: number = 20;
    officialDrawsSearchQuery: string = '';

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
    this.helpModeActive = false;
    // Estado del sistema
    this.selectedNumbers = new Set();
    this.selectedStars = new Set();
    this.suggestedNumbers = new Set();
    this.suggestedStars = new Set();
    this.excludedNumbers = new Set();
    this.excludedStars = new Set();
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
    this.activeDashboardFilters = new Set();
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
        anonId = 'usr_' + Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
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
      // The deployed Cloud Run backend URL. It holds the configured backend endpoints.
      const cloudRunUrl = 'https://ais-pre-4dcwjcmaizdkuof2rhey4p-7070977073.europe-west2.run.app';
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
          <path d="M 20,20 C 18,25 19,30 23,34" stroke="url(#green-gradient-header-bonoloto)" stroke-width="2.5" stroke-linecap="round" fill="none" />
          <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" />
          <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(90 20 20)" />
          <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(180 20 20)" />
          <path d="M 20,20 C 13,15 11,9 16,6 C 19,4 20,8 20,9 C 20,8 21,4 24,6 C 29,9 27,15 20,20" fill="url(#green-gradient-header-bonoloto)" transform="rotate(270 20 20)" />
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

  toggleHelpMode() {
    this.closeSidebar();
    this.helpModeActive = !this.helpModeActive;
    
    const btn = document.getElementById('helpModeBtn');
    if (btn) {
        if (this.helpModeActive) {
            btn.innerHTML = '❌ Desactivar Modo Ayuda';
            this.showToast('ℹ️ Modo Ayuda Activado. Pulsa en cualquier botón o filtro para ver qué hace.', 'info');
        } else {
            btn.innerHTML = '❓ Modo Ayuda';
            this.showToast('✅ Modo Ayuda Desactivado.', 'success');
        }
    }
  }

  showHelpForElement(target: HTMLElement) {
    let title = "Manual DataLotto";
    let body = `
        <p>Estás en el <strong>Modo Ayuda</strong> de DataLotto.</p>
        <p>Al pulsar sobre cualquier botón, pestaña, filtro o control del panel, se interceptará su acción tradicional para mostrarte en esta ventana emergente una explicación detallada de su teoría de juego y funcionalidad.</p>
        <p><strong>¿Cómo empezar?</strong></p>
        <ul>
            <li>Pulsa sobre los <strong>Modos de Selección</strong> (Calientes, Fríos, Ausentes) para entender cómo clasificar los números.</li>
            <li>Haz clic en cualquiera de los <strong>Filtros Matemáticos</strong> para aprender conceptos como Entropía, Sumas campana de Gauss, Distribución y Desviación Estándar.</li>
            <li>Pulsa sobre el botón <strong>Generar combinación</strong> para conocer la fuerza bruta inteligente operada por el sistema.</li>
        </ul>
        <p>Para volver a usar la aplicación de forma normal, accede de nuevo al menú del lateral izquierdo y pulsa en <strong>❌ Desactivar Modo Ayuda</strong>.</p>
    `;

    // 0. Si se pulsa sobre algún componente o etiqueta dentro de un filtro, priorizar su explicación científica
    const filterGroup = target.closest<HTMLElement>('.filter-group');
    if (filterGroup) {
        const titleText = filterGroup.querySelector('.filter-title')?.textContent || '';
        let matched = false;
        
        if (titleText.includes('Excluir Terminaciones') || filterGroup.querySelector('#terminacionesOptions')) {
            matched = true;
            title = "🚫 Excluir Terminaciones";
            body = `
                <p><strong>¿Qué es el filtro de Excluir Terminaciones?</strong></p>
                <p>Permite descartar de manera selectiva combinaciones de boletos basándose en la cifra terminal de los números individuales que las componen.</p>
                <p><strong>Teoría de Juego y Fundamento Matemático:</strong></p>
                <p>En la lotería, a menudo los apostadores tienen presentimientos o supersticiones negativas sobre ciertas terminaciones (por ejemplo, el número 13 termina en 3, o no desear terminaciones en 0 o 9). Más de lo analítico-probabilístico, este filtro matemáticamente reduce las combinaciones al eliminar grupos completos de números de tu jugada. Por ejemplo, al excluir la terminación <b>"7"</b>, estás eliminando del bombo el 7, 17, 27, 37 y 47.</p>
                <p><strong>Estrategia Aplicada:</strong></p>
                <p>Si los últimos sorteos históricos de la base de datos de DataLotto han mostrado una saturación anormal de salidas de una terminación concreta (por ejemplo, tres sorteos seguidos con múltiples números terminados en 2), la ley de distribución uniforme sugiere que esa terminación entrará pronto en una fase de enfriamiento. Al excluirla de tus jugadas temporales, evitas combinaciones cargadas de esa cifra.</p>
            `;
        } else if (titleText.includes('Variedad de Terminaciones') || filterGroup.querySelector('#terminacionesDistintasOptions')) {
            matched = true;
            title = "#️⃣ Variedad de Terminaciones";
            body = `
                <p><strong>¿Qué es la Variedad de Terminaciones?</strong></p>
                <p>Mide la cantidad de dígitos finales únicos o diferentes que componen tu jugada de 6 números.</p>
                <p><strong>Fundamento Matemático (Teoría del Desorden):</strong></p>
                <p>Si tuviésemos la jugada [5, 15, 25, 35, 45, 49], tenemos las terminaciones [5, 5, 5, 5, 5, 9]. Las terminaciones distintas son solo dos (el 5 y el 9), por lo que la variedad de terminaciones es 2. En cambio, si la jugada es [3, 12, 25, 34, 46, 48], las terminaciones son [3, 2, 5, 4, 6, 8], con 6 terminaciones diferentes (variedad de 6).</p>
                <p><strong>Por qué es crítico:</strong></p>
                <p>El análisis estadístico retrospectivo demuestra que el <strong>85% de las combinaciones ganadoras reales</strong> tienen una variedad de terminaciones de 4, 5 o 6 cifras distintas. Prácticamente nunca sale un premio gordo donde todos los números terminen igual (variedad de 1 o 2). El motor viene configurado para retener solo combinaciones con un mínimo de 4 terminaciones distintas por defecto.</p>
            `;
        } else if (titleText.includes('Entropía (Terminaciones)') || filterGroup.querySelector('#entropyTerminacionesMin')) {
            matched = true;
            title = "🌀 Entropía de Terminaciones";
            body = `
                <p><strong>¿Qué mide la Entropía de Terminaciones?</strong></p>
                <p>La entropía es un concepto físico y matemático inventado por Claude Shannon (Teoría de la Información) que sirve para cuantificar el nivel de caos, desorden o imprevisibilidad de un sistema.</p>
                <p><strong>Fórmula e Implicaciones:</strong></p>
                <p>Se calcula matemáticamente como H = -Σ (pi * log2(pi)), donde pi es la frecuencia proporcional de aparición de cada una de las terminaciones decimales en el boleto. El rango óptimo es de 1.900 a 2.585 (la entropía máxima para 6 números únicos es 2.585).</p>
                <p><strong>¿Por qué se usa?</strong></p>
                <p>Los sorteos de azar de la vida real tienden al desorden máximo sostenible. Las combinaciones que tienen una entropía muy baja en sus dígitos terminales (como 12, 22, 32, 42 con terminaciones idénticas) muestran un orden estructural artificial. Al delimitar el límite inferior de la entropía en tu generador de DataLotto, desterramos de forma inmediata millones de combinaciones estériles y redundantes que representan un desperdicio del presupuesto, filtrando solo aquellas que emulan el caos termodinámico de los bombos de aire flotante tradicionales o sistemas mecánicos.</p>
            `;
        } else if (titleText.includes('Suma Total') || filterGroup.querySelector('#sumMin') || filterGroup.querySelector('#sumMax')) {
            matched = true;
            title = "🎯 Suma Total (Números)";
            body = `
                <p><strong>¿Qué es el Rango de Suma Total?</strong></p>
                <p>Es el resultado de sumar directamente los 6 números que componen tu apuesta.</p>
                <p><strong>Sustento Probabilístico (La Campana de Gauss):</strong></p>
                <p>En una lotería clásica 6/49, la menor suma matemática posible es 21 (1+2+3+4+5+6), y la mayor es 279 (44+45+46+47+48+49). Entre estos dos límites hay millones de combinaciones.</p>
                <p>Si graficamos la cantidad de combinaciones para cada valor de suma, visualizaremos una perfecta <strong>Campana de Gauss</strong> (distribución normal multinomial). Las sumas extremas (como 21 o 279) solo tienen una única combinación posible, por lo que su probabilidad conjunta de ocurrir es virtualmente nula. En contraposición, más del <strong>70% de las combinaciones que salen premiadas en la historia real</strong> acumulan sumatorios centrados en la cima de la campana, entre 121 y 190. Al forzar este intervalo, tu boleto se sitúa exactamente en la zona de mayor densidad probabilística mundial.</p>
            `;
        } else if ((titleText.includes('Par/Impar') && !titleText.includes('Estrellas')) || filterGroup.querySelector('#parImparOptions')) {
            matched = true;
            title = "⚖️ Relación Par / Impar";
            body = `
                <p><strong>¿Qué es la Proporción Par/Impar?</strong></p>
                <p>Filtra la combinación en base a la cantidad de números pares frente a números impares presentes en tu boleto.</p>
                <p><strong>Estadísticas de la Lotería:</strong></p>
                <p>Cada número individual tiene un 50% de probabilidad de ser par o impar. Al extraer 6 números principales, las combinaciones extremas que constan únicamente de impares (0 pares / 6 impares) o únicamente de pares (6 pares / 0 impares) representan juntas menos del 2.5% de los sorteos históricos.</p>
                <p><strong>Diseño de la Apuesta Ganadora:</strong></p>
                <p>La máxima frecuencia de ocurrencias históricas (más del 80%) la dominan diseños equilibrados:</p>
                <ul>
                  <li><strong>3 Pares y 3 Impares (3P/3I)</strong>: La configuración más frecuente y estable en la naturaleza.</li>
                  <li><strong>4 Pares y 2 Impares (4P/2I)</strong> o <strong>2 Pares y 4 Impares (2P/4I)</strong>.</li>
                </ul>
                <p>Al restringir el generador para que descarte combinaciones planas con proporciones extravagantes, el sistema mejora la sintonía geométrica de tus boletos producidos.</p>
            `;
        } else if ((titleText.includes('Bajos/Altos') && !titleText.includes('Estrellas')) || filterGroup.querySelector('#bajosAltosOptions')) {
            matched = true;
            title = "📊 Relación Bajos / Altos";
            body = `
                <p><strong>¿Qué define el Filtro de Bajos y Altos?</strong></p>
                <p>Clasifica los números del boleto en función de su magnitud:</p>
                <ul>
                  <li><strong>Números Bajos</strong>: Números ubicados en la mitad inferior de la tabla (por ejemplo, del 1 al 24 en un juego de 49 números).</li>
                  <li><strong>Números Altos</strong>: Números ubicados en la mitad superior de la tabla (por ejemplo, del 25 al 49).</li>
                </ul>
                <p><strong>Matemática e Historial Colectivo:</strong></p>
                <p>Al igual que la relación par/impar, la distribución equitativa es dominante. Un sorteo real donde salgan de forma simultánea únicamente números pequeños (por ejemplo: 2, 4, 7, 9, 12, 18) o únicamente números gigantescos (39, 41, 44, 45, 47, 49) ocurre de forma sumamente esporádica.</p>
                <p><strong>Consejos de Configuración:</strong></p>
                <p>Actvar las opciones <strong>3B/3A</strong> (3 Bajos / 3 Altos), <strong>4B/2A</strong>, o <strong>2B/4A</strong> asegura que la jugada cubra el tablero con un balance vertical perfecto, neutralizando el riesgo de estancamiento sectorial en el boleto.</p>
            `;
        } else if ((titleText.includes('Primos') && !titleText.includes('Estrellas')) || filterGroup.querySelector('#primosMin')) {
            matched = true;
            title = "🔢 Filtro de Números Primos";
            body = `
                <p><strong>¿Qué hace el Filtro de Números Primos?</strong></p>
                <p>Restringe el número de dígitos primos que pueden formar parte de tu combinación generada.</p>
                <p><strong>¿Cuáles son los números primos?</strong></p>
                <p>Los primos son enteros positivos divisibles solo por 1 y por sí mismos. En el rango del 1 al 49, tenemos 15 primos: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47.</p>
                <p><strong>Lógica Probabilística:</strong></p>
                <p>Matemáticamente, cerca del 30% de los números en la lotería son primos. Los eventos reales de lotería muestran que la inmensa mayoría de las apuestas premiadas (alrededor del 82% de las ocasiones) contienen <strong>entre 1, 2 o 3 números primos</strong>. Raras veces verás un boleto ganador que esté compuesto enteramente por primos (ejemplo: 5, 7, 11, 17, 23, 31) o que carezca por completo de ellos. Ajustar los límites en el generador te mantendrá dentro de la tónica preferente de los sorteos reales.</p>
            `;
        } else if ((titleText.includes('Consecutivos') && !titleText.includes('Estrellas')) || filterGroup.querySelector('#consecutivosOptions')) {
            matched = true;
            title = "🔗 Filtro de Números Consecutivos";
            body = `
                <p><strong>¿Qué analiza el Filtro de Números Consecutivos?</strong></p>
                <p>Determina la estructura de agrupamientos consecutivos de cifras numéricas continuas en un mismo boleto (por ejemplo, tener el 12 y el 13 es una pareja consecutiva).</p>
                <p><strong>Nomenclatura Técnica del Tablero:</strong></p>
                <ul>
                  <li><strong>1/1/1/1/1/1</strong>: Ningún número es consecutivo (ej: 4, 12, 21, 33, 39, 45). Máxima dispersión.</li>
                  <li><strong>2/1/1/1/1</strong>: Una pareja de números seguidos (ej: 4, 12, <strong>22, 23</strong>, 35, 41).</li>
                  <li><strong>2/2/2</strong>: Tres parejas de números seguidos independientes.</li>
                  <li><strong>3/1/1/1</strong>: Un trío de números consecutivos juntos (ej: <strong>14, 15, 16</strong>, 28, 32, 45).</li>
                </ul>
                <p><strong>Secreto de los Diseños Reales:</strong></p>
                <p>La creencia popular asume que en la lotería nunca deben ir números seguidos. Sin embargo, la estadística destrona este mito: ¡más del <strong>50% de las combinaciones ganadoras históricas de Loterías contienen exactamente una pareja consecutiva (2/1/1/1/1)</strong>! El sistema de DataLotto te permite activar estos formatos probados para simular con precisión la impredecibilidad típica de las extracciones físicas.</p>
            `;
        } else if (titleText.includes('Entropía (Intervalos)') || filterGroup.querySelector('#entropyIntervalosMin')) {
            matched = true;
            title = "🌀 Entropía de Intervalos de Separación";
            body = `
                <p><strong>¿Qué es la Entropía de Intervalos de Separación?</strong></p>
                <p>Similar al filtro de terminaciones, aplica la <strong>Entropía de la Información de Shannon</strong>, pero en este caso se computa sobre las <strong>distancias matemáticas (los intervalos)</strong> existentes entre cada número del boleto alineado de menor a mayor.</p>
                <p><strong>Ejemplo Descriptivo:</strong></p>
                <p>Si introduces un boleto con distancias monótonas como [5, 10, 15, 20, 25, 30], los saltos son siempre exactamente de 5. El desorden o entropía de estos intervalos es 0 (patrón predecible y estático). En cambio, un boleto real como [2, 14, 17, 28, 30, 44] tiene saltos de [12, 3, 11, 2, 14]. El nivel de entropía de este conjunto de saltos es elevado.</p>
                <p><strong>Función de este Filtro:</strong></p>
                <p>Impide que el generador escoja secuencias hiper-estructuradas creadas artificialmente por la mente humana que el bombo aleatorio real jamás produciría. Es la barrera defensiva número uno contra jugadas lineales improductivas.</p>
            `;
        } else if (titleText.includes('Distancia entre') || filterGroup.querySelector('#distanciaMin')) {
            matched = true;
            title = "↔️ Distancia entre Números";
            body = `
                <p><strong>¿Qué es el Rango de Distancia entre Números?</strong></p>
                <p>Este filtro regula la envergadura o el tamaño de la separación permitida entre dos elementos adyacentes cualesquiera en tu boleto ordenado.</p>
                <p><strong>Aplicación y Límites:</strong></p>
                <ul>
                  <li><strong>Distancia Mínima</strong>: El salto más pequeño permitido entre números consecutivos. Si fijas un valor de 2, el generador nunca pondrá números seguidos (como 12 y 13), forzando que exista al menos una separación de dos unidades o más (como 12 y 14).</li>
                  <li><strong>Distancia Máxima</strong>: El límite superior del tamaño del salto. Si configuras una distancia máxima de 25, evitas que haya un gran agujero o abismo de separación vacío en la cuadrícula (por ejemplo, saltar directamente de la bola 3 a la 44), lo que dejaría franjas gigantes sin barajar.</li>
                </ul>
                <p><strong>Recomendación Profesional:</strong></p>
                <p>Establecer la distancia mínima en 1 (lo que permite parejas consecutivas de alta incidencia) y una distancia máxima de 25 asegura que el juego baraje óptimamente todas las áreas del boleto.</p>
            `;
        } else if (titleText.includes('Agrupación por Decenas') || filterGroup.querySelector('#agrupDecenasOptions')) {
            matched = true;
            title = "📦 Agrupación por Decenas";
            body = `
                <p><strong>¿Qué mide la Agrupación por Decenas?</strong></p>
                <p>Evalúa el patrón de distribución de los números según las filas o décadas de la cuadrícula física (ej. la decena del 1 al 9, del 10 al 19, del 20 al 29, del 30 al 39 y del 40 en adelante).</p>
                <p><strong>Matemática de Compartimentos Estancos:</strong></p>
                <p>El formato <strong>"3/2/1"</strong> significa que tu combinación tiene 3 números concentrados en una decena concreta, 2 números en otra decena, y 1 número en una decena diferente (ejemplo: [2, 5, 8, 14, 19, 21] con tres dígitos en la decena simple del 0, dos en los '10', y uno en los '20').</p>
                <p><strong>Utilidad Científica:</strong></p>
                <p>Evita aberraciones de distribución sectorial. Por ejemplo, tener los 6 números del boleto hacinados exclusivamente dentro de la década de los 30 (como 30, 31, 33, 35, 36, 39) tiene un histórico de ocurrencia inferior al 0.04% en sorteos internacionales. Activar agrupaciones versátiles y balanceadas como "2/2/1/1" o "2/1/1/1/1" distribuye la presión de probabilidad en todo el ancho físico del tablero.</p>
            `;
        } else if ((titleText.includes('Suma de Dígitos') && !titleText.includes('Estrellas')) || filterGroup.querySelector('#sumaDigitosMin')) {
            matched = true;
            title = "∑ Suma de Dígitos";
            body = `
                <p><strong>¿Qué formula la Suma de Dígitos del Boleto?</strong></p>
                <p>Desglosa cada número principal del boleto en sus cifras individuales de unidades y decenas y efectúa un sumatorio total acumulado.</p>
                <p><strong>Ejemplo Práctico e Ilustrativo:</strong></p>
                <p>Si tu boleto inteligente contiene los números [12, 23, 35, 41, 46], el filtro de dígitos sumará:</p>
                <p style="text-align: center; font-size: 1.1rem; font-weight: bold; background: #f3f4f6; padding: 6px; border-radius: 6px; display: inline-block; margin: 5px auto; width: 100%;">
                  (1 + 2) + (2 + 3) + (3 + 5) + (4 + 1) + (4 + 6) = 31
                </p>
                <p><strong>Por qué es una herramienta de precisión:</strong></p>
                <p>Tanto en programación fractal como en investigación de sutiles factores pseudoaleatorios, los dígitos individuales delatan patrones de sesgo estético o error de distribución humana. Al forzar este sumatorio de cifras elementales a un rango equilibrado central (usualmente de 28 a 45), anulas cualquier combinación que presente anomalías en el reparto del espacio métrico digital del boleto de lotería.</p>
            `;
        } else if (titleText.includes('Desviación Estándar') || filterGroup.querySelector('#desviacionMin')) {
            matched = true;
            title = "📈 Desviación Estándar";
            body = `
                <p><strong>¿Qué es la Desviación Estándar estocástica?</strong></p>
                <p>Es el rey de los indicadores de dispersión estadística. Mide cuantitativamente cuánto se alejan los números de tu boleto respecto a la media aritmética de esa misma jugada.</p>
                <p><strong>Formulación Conceptual:</strong></p>
                <p>Se calcula restando de cada número el promedio aritmético de la apuesta, elevando el valor al cuadrado, sumándolos todos, dividiendo entre N-1 y extrayendo la raíz cuadrada final.</p>
                <p><strong>¿Qué representa en tu boleto?</strong></p>
                <ul>
                  <li>Una <strong>Desviación Estándar muy baja</strong> (por ejemplo: menor a 6) significa que todos los números están apretados en una sola zona.</li>
                  <li>Una <strong>Desviación Estándar gigante</strong> (por ejemplo: mayor a 21) significa que los números están fragmentados en las esquinas más alejadas de la tabla.</li>
                </ul>
                <p><strong>Rango Óptimo Estándar:</strong></p>
                <p>La cúpula matemática de DataLotto sitúa el rango perfecto entre <strong>12.0 y 18.0</strong>. Esto induce al generador a fabricar apuestas que emulan la verdadera distancia inercial del barajado mecánico.</p>
            `;
        } else if (titleText.includes('Geométricos') || filterGroup.querySelector('#geometricOptions')) {
            matched = true;
            title = "🗺️ Filtros Geométricos y Figuras";
            body = `
                <p><strong>¿Qué analizan los Filtros Geométricos?</strong></p>
                <p>Inspeccionan si las marcas o cruces impresas sobre tu boleto físico forman patrones lineales, simetrías geométricas básicas o dibujos reconocibles en la libreta.</p>
                <p><strong>Teoría de la Elección Humana y Compartición de Botes:</strong></p>
                <p>Los humanos somos seres estructurados visualmente. Cuando rellenamos un boleto, tendemos de forma inconsciente a dibujar líneas rectas (horizontales o verticales), seguir las cuatro esquinas del papel, trazar cruces perfectas, aspas de avión o caminos diagonales.</p>
                <p><strong>El Peligro del "Premio Compartido" (Efecto Dilución):</strong></p>
                <p>Si sale ganadora una combinación que forma una hermosa y obvia figura simétrica en el boleto, no serás el único rico. Centenares de personas habrán impreso el mismo patrón geométrico, reduciendo tu premio millonario individual a unos pocos miles de euros por la división del pozo acumulado. Al activar <strong>🚫 Líneas</strong>, <strong>🚫 Diagonales o 🚫 Cruces</strong>, impides que se jueguen estas trampas estéticas, blindando el valor de tu bote.</p>
            `;
        } else if (titleText.includes('Suma Estrellas') || filterGroup.querySelector('#starSumMin')) {
            matched = true;
            title = "⭐ Suma de Estrellas";
            body = `
                <p><strong>¿Qué es la Suma de Estrellas?</strong></p>
                <p>Suma los dígitos de los dos números secundarios elegidos en las Estrellas de Euromillones.</p>
                <p><strong>Aplicación:</strong></p>
                <p>Evita que juegues sumas extremas no deseadas (por ejemplo: 1+2=3 o 11+12=23 en Euromillones son sumas insólitamente raras en las estadísticas reales). El rango inteligente recomendado optimiza el espectro de suma entre 8 y 15 para alinearse con los registros frecuentes.</p>
            `;
        } else if (titleText.includes('Par/Impar Estrellas') || filterGroup.querySelector('#starParImparOptions')) {
            matched = true;
            title = "⭐ Par/Impar Estrellas";
            body = `
                <p><strong>Filtro de Par/Impar Estrellas:</strong></p>
                <p>Regula la proporción de números pares e impares en el mini-bombo de Estrellas del sorteo.</p>
                <p><strong>Estrategia ideal:</strong></p>
                <p>Lo más común del comportamiento matemático es jugar de forma mixta: 1 estrella par y 1 estrella impar. Al activar esta restricción, evitas boletos de doble estrella impar o doble estrella par que ocurren con menor asiduidad en los sorteos europeos oficiales.</p>
            `;
        } else if (titleText.includes('Bajos/Altos Estrellas') || filterGroup.querySelector('#starBajosAltosOptions')) {
            matched = true;
            title = "⭐ Bajos/Altos Estrellas";
            body = `
                <p><strong>Filtro de Bajos/Altos Estrellas:</strong></p>
                <p>Clasifica las estrellas en bajas (del 1 al 6) y altas (del 7 al 12).</p>
                <p><strong>Estrategia ideal:</strong></p>
                <p>La combinación mixta (1 estrella baja y 1 estrella alta) es la campeona absoluta de frecuencia. Al forzar este intervalo, garantizas que tus estrellas estén bien repartidas a lo largo de toda la dimensión del tablero auxiliar.</p>
            `;
        } else if (titleText.includes('Suma Dígitos Estrellas') || filterGroup.querySelector('#starSumaDigitosMin')) {
            matched = true;
            title = "⭐ Suma de Dígitos de Estrellas";
            body = `
                <p><strong>¿Qué calcula la Suma de Dígitos de Estrellas?</strong></p>
                <p>Suma por separado el juego de cifras elementales de tus dos estrellas (por ejemplo, si tus estrellas son 5 y 12, sumaría: 5 + 1 + 2 = 8).</p>
                <p>Esta medida permite filtrar con mayor sutileza la densidad probabilística de las estrellas para asegurar que mantengan una dispersión equilibrada.</p>
            `;
        } else if (titleText.includes('Primos Estrellas') || filterGroup.querySelector('#starPrimosMin')) {
            matched = true;
            title = "⭐ Primos Estrellas";
            body = `
                <p><strong>¿Qué son los Primos Estrellas?</strong></p>
                <p>Controla cuántas de tus dos estrellas secundarias deben ser números primos (2, 3, 5, 7, 11).</p>
                <p>La distribución uniforme ideal sugiere seleccionar entre 0 y 2 estrellas de rango primo, siendo ideal mantener una estrella prima y otra compuesta para un balance riguroso.</p>
            `;
        } else if (titleText.includes('Consecutivos Estrellas') || filterGroup.querySelector('#starConsecutivosOptions')) {
            matched = true;
            title = "⭐ Consecutivos Estrellas";
            body = `
                <p><strong>Filtro de Consecutivos en Estrellas:</strong></p>
                <p>Determina si permites jugar estrellas consecutivas de forma seguidiza en el tablero secundario (ej: estrella 4 y 5).</p>
                <p>Jugar de manera no consecutiva aporta mayor variabilidad probabilística al boleto.</p>
            `;
        } else if (titleText.includes('Distancia Estrellas') || filterGroup.querySelector('#starDistanciaMin')) {
            matched = true;
            title = "⭐ Distancia de Estrellas";
            body = `
                <p><strong>¿Qué es la Distancia de Estrellas?</strong></p>
                <p>Mide la diferencia matemática absoluta entre las dos estrellas seleccionadas (ej: si juegas las estrellas 2 y 9, la distancia es 7).</p>
                <p>Regula la dispersión de las estrellas secundarias en el boleto de Euromillones, evitando agrupamientos drásticos o separaciones imposibles.</p>
            `;
        } else if (titleText.includes('Predictivos') || filterGroup.querySelector('#useMarkovSwitch') || filterGroup.querySelector('#useNashSwitch') || filterGroup.querySelector('#useRegressionSwitch')) {
            matched = true;
            title = "🤖 Modelos Estadísticos y Filtros Predictivos Avanzados";
            body = `
                <p>Este módulo representa el cerebro predictivo de alto rendimiento de DataLotto, agrupando tres de las filosofías de toma de decisiones estocásticas de mayor prestigio mundial:</p>
                
                <p><strong>1. Cadenas de Markov y Probabilidades de Transición:</strong></p>
                <p>Estudian transiciones secuenciales. El sistema analiza la base de datos completa e investiga qué número tiende a salir con mayor probabilidad como consecuencia del grupo de números extraídos en el sorteo inmediatamente anterior. Configurar "Sorteos a considerar" incrementa retrospectivamente el calado histórico evaluado.</p>
              
                <p><strong>2. Teoría de Juegos de John Nash (Equilibrio de Nash):</strong></p>
                <p>Utilizada para predecir el comportamiento del resto del público. Analiza los sesgos estéticos humanos tradicionales (jugar fechas, patrones rectos, simetrías) y aplica un algoritmo teorético que penaliza combinaciones que el público juega a gran escala. El resultado es que, si aciertas el premio gordo, no tendrás que diluirlo ni compartirlo entre cientos de personas, maximizando tu Valor Esperado de Retorno (EV).</p>
              
                <p><strong>3. Regresión Lineal de Ajuste Mínimo-Cuadrado:</strong></p>
                <p>Analiza el corrimiento y la inercia cíclica de la mediana del juego para estimar si la tendencia inmediata del sorteo en curso favorecerá números de mayor magnitud o menor magnitud. El Bono de Regresión prioriza combinaciones candidatas que naveguen a favor de esta corriente vectorial.</p>
            `;
        }

        if (matched) {
            const helpModalTitle = document.getElementById('helpModalTitle');
            const helpModalBody = document.getElementById('helpModalBody');
            if (helpModalTitle) helpModalTitle.textContent = title;
            if (helpModalBody) helpModalBody.innerHTML = body;
            this.toggleModal('helpModal', true);
            return;
        }
    }

    // 1. Selector de modo de selección
    const modeBtn = target.closest<HTMLElement>('.selection-mode-btn');
    if (modeBtn) {
        const mode = modeBtn.dataset.mode;
        const id = modeBtn.id;
        if (mode === 'cold') {
            title = "❄️ Números Fríos";
            body = `
                <p><strong>¿Qué son los Números Fríos?</strong></p>
                <p>Son los dígitos que han aparecido con menor frecuencia en la base de datos de los últimos sorteos históricos analizados.</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>Su importancia radica en la <em>Teoría de Regresión a la Media</em> del cálculo probabilístico. Esta teoría postula que en sucesos independientes a largo plazo, todos los números del bombo deben equilibrar su frecuencia de salida. De este modo, los números fríos acumulan teóricamente una mayor presión de probabilidad latente para salir en los próximos sorteos.</p>
                <p><strong>Cómo usarlos:</strong></p>
                <p>Al activar este modo, la cuadrícula física se coloreará señalando los números fríos, facilitándote hacer clic para marcarlos obligatoriamente o dejárselos al algoritmo generador para que balancee la jugada.</p>
            `;
        } else if (mode === 'hot') {
            title = "🔥 Números Calientes";
            body = `
                <p><strong>¿Qué son los Números Calientes?</strong></p>
                <p>Son los números líderes en frecuencia que más veces han sido extraídos del bombo en el período analizado.</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>Se asocian con la <em>Teoría de Tendencia Intensa (Hot Hand)</em>. En lotería, debido a sutiles micro-imperfecciones en el peso o el diámetro de las bolas físicas, o por dinámicas de rachas de caos local, ciertos números muestran una predisposición estadística a seguir repitiéndose a corto plazo. Es una racha que los matemáticos llaman desviación de autocorrelación.</p>
                <p><strong>Cómo usarlos:</strong></p>
                <p>Te permite identificar los números "en racha" en la cuadrícula para integrarlos en tu apuesta combinada antes de que finalice su ciclo activo de alta probabilidad.</p>
            `;
        } else if (mode === 'absent') {
            title = "⏱️ Números Ausentes";
            body = `
                <p><strong>¿Qué son los Números Ausentes?</strong></p>
                <p>Son los números que llevan una mayor cantidad acumulada de sorteos sin salir (el mayor índice de "delay" u holgura temporal).</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>Consiste en identificar las llamadas <em>Ciclos de Saturación de Retraso</em>. Cuando un número supera de manera extrema la cantidad estándar esperada de sorteos sin salir, se aproxima a lo que los analistas denominan "punto crítico de quiebre". Introducir números ausentes selectivamente aumenta la robustez matemática de tu combinación.</p>
                <p><strong>Cómo usarlos:</strong></p>
                <p>Activa este modo para aislar en el tablero aquellos números con retraso extremo y seleccionarlos de manera prioritaria.</p>
            `;
        } else if (mode === 'favorites') {
            title = "⭐ Modo Favoritos";
            body = `
                <p><strong>¿Qué es el Modo Favoritos?</strong></p>
                <p>Es una ranura de personalización intuitiva que te permite reservar hasta un máximo de 10 números favoritos.</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>La lotería es una mezcla de ciencia matemática y factor emocional/azar. El Modo Favoritos introduce tus combinaciones, fechas de nacimiento o números de fuerza en el motor de renderizado de boletos. El generador inteligente utilizará estos números favoritos como tu base fija de juego y completará el boleto aplicando filtros avanzados sobre el resto de números para maximizar la calidad estadística sin arruinar tu intuición.</p>
            `;
        } else if (mode === 'excluded') {
            title = "🚫 Números Excluidos";
            body = `
                <p><strong>¿Qué son los Números Excluidos?</strong></p>
                <p>Son números que decides vetar o eliminar completamente de tus jugadas matemáticas.</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>Reduce radicalmente la dimensión espacial del problema de búsqueda. En una lotería 6/49 hay casi 14 millones de combinaciones. Al excluir solo 5 números que de antemano consideras improductivos o que descartas por mala racha, reduces las combinaciones posibles en varios millones, ayudando al motor a escudriñar un universo más concentrado de apuestas con mejores distribuciones de probabilidad.</p>
            `;
        } else if (mode === 'figure') {
            title = "📐 Modo Figura Geométrica";
            body = `
                <p><strong>¿Qué es el Modo Figura Geométrica?</strong></p>
                <p>Examina la distribución visual espacial de tus números sobre el boleto impreso físico.</p>
                <p><strong>Teoría de Juego Aplicada:</strong></p>
                <p>Estudios en psicología del juego revelan que miles de personas rellenan sus boletos dibujando figuras geométricas básicas (cruces, líneas rectas paralelas, letras, esquinas, espirales). Si estas figuras visuales resultan premiadas, el pozo se comparte entre miles de ganadores reduciendo significativamente tu premio. El sistema analiza y califica la estructura visual para evitar combinaciones obvias y proteger el valor de tus posibles ganancias.</p>
            `;
        } else if (id === 'dataBtn') {
            title = "📂 Cargar Base de Datos de Sorteos";
            body = `
                <p><strong>¿Qué hace esta función?</strong></p>
                <p>Te permite cargar un archivo de datos local (.csv, .db) conteniendo el histórico de resultados anteriores del juego seleccionado.</p>
                <p><strong>Ventaja Estadística:</strong></p>
                <p>Toda la analítica teórica (desviación, entropías, frecuencias calientes/frías) se actualiza de inmediato para sincronizarse con los datos del archivo provisto en el momento. Esto garantiza un aprendizaje y filtrado siempre preciso y fiel con la realidad actual del juego.</p>
            `;
        } else if (id === 'urlBtn') {
            title = "🌐 Seleccionar URL de Base de Datos";
            body = `
                <p><strong>¿Qué hace este botón?</strong></p>
                <p>Te permite elegir la ruta web o API oficial desde donde la aplicación descarga e inicializa los últimos resultados del sorteo.</p>
                <p><strong>Ventaja Estadística:</strong></p>
                <p>Evitara tener que importar de forma manual un archivo cada semana. El sistema se conectará a internet de forma transparente para tener siempre la base de datos histórica con los últimos sorteos oficiales computados.</p>
            `;
        } else if (id === 'simulateBtn') {
            title = "🧬 Simulador por Generador Monte Carlo";
            body = `
                <p><strong>¿Qué es la Simulación de Datos?</strong></p>
                <p>Inyecta un juego masivo de resultados simulados matemáticamente (ej. 500 sorteos virtuales creados con algoritmos de distribución probabilística clásica).</p>
                <p><strong>Aplicación:</strong></p>
                <p>Sirve para probar a fondo todos los filtros avanzados del generador, ensayar estrategias, verificar el comportamiento del backtesting en escenarios diversos e interactuar con la interfaz científica sin límites de red.</p>
            `;
        } else if (id === 'randomBtn') {
            title = "🎲 Selección de Números al Azar";
            body = `
                <p><strong>¿Qué es la Selección al Azar de DataLotto?</strong></p>
                <p>Elige una serie de números aleatorios puros iniciales que respetan el diseño de la cuadrícula.</p>
                <p><strong>Aplicación:</strong></p>
                <p>Es un excelente punto inicial de juego. Al azar puro, puedes superponerle luego tus estrategias personalizadas de filtrado de campana de Gauss, Markov, Nash o descartes de números excluidos para transformar una jugada de azar simple en una apuesta técnica optimizada.</p>
            `;
        } else if (id === 'clearBtn') {
            title = "🗑️ Limpiar Todo";
            body = `
                <p><strong>¿Qué hace esta acción?</strong></p>
                <p>Vuelve a su estado neutral a la grilla y borra las selecciones actuales de números calientes, ausentes, fríos, favoritos y excluidos de un plumazo.</p>
                <p><strong>Aplicación:</strong></p>
                <p>Perfecto para empezar una estrategia de diseño nueva libre de residuos o herencias de juegos anteriores.</p>
            `;
        }
    }

    // 2. Botones de acción del boleto
    else if (target.closest('#generateBtn') || target.id === 'generateBtn') {
        title = "⚙️ Filtro Generador Inteligente";
        body = `
            <p><strong>¿Cómo funciona el Generador?</strong></p>
            <p>A diferencia de una simple máquina que te da números al azar, el motor de DataLotto evalúa miles de combinaciones posibles por segundo en tu navegador mediante fuerza bruta inteligente guiada por restricciones.</p>
            <p><strong>Criterio de Aceptación:</strong></p>
            <p>Cada combinación candidata es evaluada contra <strong>TODOS</strong> los filtros que hayas configurado en el panel. Solo si una combinación supera de manera óptima las restricciones de Entropía, Suma de números, Cantidad de primos, Cadenas de Markov y Desviación, es finalmente renderizada como boleto. Esto asegura que juegues exclusivamente boletos de máxima probabilidad matemática acumulada.</p>
        `;
    } else if (target.closest('#saveBtn') || target.id === 'saveBtn') {
        title = "💾 Guardar Boleto";
        body = `
            <p><strong>¿Qué hace este botón?</strong></p>
            <p>Almacena la combinación seleccionada o generada en la base de datos de tu navegador de forma segura (LocalStorage local).</p>
            <p><strong>Para qué utilizarlo:</strong></p>
            <p>Te permite hacer un seguimiento analítico. Tus apuestas guardadas se consolidarán en la sección de estadísticas históricas y backtesting para calcular tu porcentaje de éxito real con el paso del tiempo.</p>
        `;
    } else if (target.closest('#shareBtn') || target.id === 'shareBtn') {
        title = "📤 Compartir Combinación";
        body = `
            <p><strong>¿Qué hace este botón?</strong></p>
            <p>Genera una versión en texto estructurado de la jugada lista para copiar al portapapeles y compartirla rápido por WhatsApp o chat, facilitando el juego conjunto o peñas.</p>
        `;
    } else if (target.closest('#playOnlineBtn') || target.id === 'playOnlineBtn') {
        title = "📲 Jugar Online Registrado";
        body = `
            <p><strong>¿Qué hace esta acción?</strong></p>
            <p>Te redirige a la plataforma de apuestas en línea oficial del operador de lotería, autotransfiriendo (siempre que el juego u operador lo permita) los números de tu boleto inteligente para que los registres con un clic sin posibilidad de equivocaciones humanas de transcripción.</p>
        `;
    }

    // 3. Filtros del panel (identificados por ID/clase de inputs o cabeceras)
    else if (target.closest('#entropyTerminacionesMin') || target.closest('#entropyTerminacionesMax') || target.closest('label[for*="entropyTerminaciones"]') || (target.innerText && target.innerText.includes('Entropía de Terminaciones'))) {
        title = "📊 Entropía de Terminaciones";
        body = `
            <p><strong>¿Qué mide la Entropía de Terminaciones?</strong></p>
            <p>La entropía matemática es una medida de desorden o información. Este filtro evalúa la composición de los <strong>últimos dígitos</strong> (las terminaciones) de los números de tu boleto.</p>
            <p><strong>Teoría de Juego Aplicada:</strong></p>
            <p>Si eliges números como 2, 12, 22, 32, 42, todos terminan en '2'. La entropía de terminaciones de esta jugada es extremadamente baja (poca información, patrón plano). Los sorteos históricos de lotería demuestran que las combinaciones ganadoras contienen terminaciones muy variadas (ej. 3, 14, 21, 28, 35, 49 con terminaciones 3, 4, 1, 8, 5, 9). Al fijar el rango recomendado (ej. de 1.000 a 2.585), descartas apuestas simplistas que jamás suceden en sorteos reales.</p>
        `;
    } else if (target.closest('#sumMin') || target.closest('#sumMax') || (target.innerText && target.innerText.includes('Suma de Números'))) {
        title = "➕ Rango de Suma de Números";
        body = `
            <p><strong>¿Qué es el Rango de Suma?</strong></p>
            <p>Es la suma directa aritmética de todos los números que forman el boleto.</p>
            <p><strong>Teoría de Juego Aplicada:</strong></p>
            <p>Se asienta en el principio probabilístico de la <strong>Campana de Gauss</strong> (La Distribución Normal). Aunque cualquier combinación individual tiene exactamente la misma probabilidad teórica de salir, la sumatoria de las combinaciones agrupadas se concentra de forma abrumadora en una franja media.</p>
            <p>Por ejemplo, en una lotería 6/49 la menor suma posible es 21 (1+2+3+4+5+6) y la máxima es 279 (44+45+46+47+48+49). La inmensa mayoría de los sorteos reales registran sumas que caen de forma estricta entre 121 y 190. Configurar este rango garantiza que nunca juegues combinaciones extremas que representen un desperdicio probabilístico de tu dinero.</p>
        `;
    } else if (target.closest('#primosMin') || target.closest('#primosMax') || (target.innerText && target.innerText.includes('Cantidad de Primos'))) {
        title = "🔢 Números Primos en el Boleto";
        body = `
            <p><strong>¿Qué analiza la Cantidad de Primos?</strong></p>
            <p>Controla cuántos de los números en tu combinación deben ser primos (números que solo se pueden dividir de forma exacta por el 1 y por sí mismos, como el 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, etc.).</p>
            <p><strong>Estudio Estadístico:</strong></p>
            <p>El comportamiento histórico indica que es sumamente raro que un sorteo contenga 0 números primos, o bien que los 6 números sean primos. En más del 80% de los sorteos reales, el boleto ganador se compone de <strong>entre 1 y 3 números primos</strong>. Este filtro descarta boletos desequilibrados numéricamente para ajustarse al comportamiento predilecto de la probabilidad natural de los bombos de lotería.</p>
        `;
    } else if (target.closest('#entropyIntervalosMin') || target.closest('#entropyIntervalosMax') || (target.innerText && target.innerText.includes('Entropía de Intervalos'))) {
        title = "🌌 Entropía de Intervalos de Separación";
        body = `
            <p><strong>¿Qué es la Entropía de Intervalos?</strong></p>
            <p>Mide la regularidad o el desorden de los saltos numéricos que hay entre cada uno de los números ordenados consecutivos de la combinación.</p>
            <p><strong>Importancia:</strong></p>
            <p>Previene contra la acumulación repetitiva de ciertas diferencias geométricas o secuencias demasiado estables (ejemplo: 5, 10, 15, 20, 25, 30, donde los intervalos son todos exactamente de 5). El sistema descarta estas combinaciones estériles asegurando un desorden saludable similar a las dinámicas complejas del movimiento de las bolas en los sorteos reales.</p>
        `;
    } else if (target.closest('#distanciaMin') || target.closest('#distanciaMax') || (target.innerText && target.innerText.includes('Distancia Mínima y Máxima'))) {
        title = "📏 Distancia entre Elementos";
        body = `
            <p><strong>¿A qué se refiere este filtro?</strong></p>
            <p>A la separación (diferencia matemática) entre los números contiguos más cercanos del boleto agrupados y ordenados.</p>
            <p><strong>Aplicación:</strong></p>
            <p>Por ejemplo, si la combinación es [12, 14, 25, 27, 39, 41], la distancia mínima es de 2 (entre 12 y 14, y 25 y 27). Este filtro evita que el generador escoja secuencias absurdas donde todos los números están apretados con diferencias de 1 (ejemplo: 12, 13, 14, 15, 16, 17) o con saltos demasiado distanciados que impidan la naturalidad de dispersión.</p>
        `;
    } else if (target.closest('#sumaDigitosMin') || target.closest('#sumaDigitosMax') || (target.innerText && target.innerText.includes('Suma de Todos los Dígitos'))) {
        title = "🧮 Suma de Todos los Dígitos";
        body = `
            <p><strong>¿Qué calcula la Suma de Dígitos?</strong></p>
            <p>Suma cada una de las cifras o letras numéricas individuales que forman el boleto de manera separada.</p>
            <p><strong>Ejemplo:</strong></p>
            <p>Si los números del boleto son [10, 25, 36], el filtro desglosará la jugada entera en cifras matemáticas individuales y sumará: 1 + 0 + 2 + 5 + 3 + 6 = 17. Al igual que el rango de suma estándar del juego completo, este indicador acumulado de geometría digital se distribuye en una curva de alta probabilidad que el generador utiliza para calibrar apuestas con excelente factor de simetría espacial.</p>
        `;
    } else if (target.closest('#desviacionMin') || target.closest('#desviacionMax') || (target.innerText && target.innerText.includes('Desviación Estándar de la Combinación'))) {
        title = "📉 Desviación Estándar de la Combinación";
        body = `
            <p><strong>¿Qué es la Desviación Estándar?</strong></p>
            <p>Es una métrica clásica de la estadística analítica corporativa que define qué tan dispersos se encuentran los números de una muestra respecto de su valor medio o promedio.</p>
            <p><strong>Teoría de Juego Aplicada:</strong></p>
            <p>Una desviación estándar muy baja (ej. menor a 5.0) significa que todos tus números están densamente aglutinados en un solo sector de la cuadrícula (ejemplo: 18, 19, 21, 22, 23, 25). Una desviación estándar excesivamente alta (ej. mayor a 21.0) significa que los números están solo en las fronteras físicas más distantes (como 1, 2, 47, 48, 49). Configurar rangos equilibrados (como el por defecto, de 12.0 a 18.0) garantiza boletos homogéneos que barren eficientemente toda la cuadrícula.</p>
        `;
    }

    // 4. Estrategias avanzadas: Markov, Nash, Regresión lineal
    else if (target.closest('#useMarkovSwitch') || target.closest('#markovDepth') || (target.innerText && target.innerText.includes('Markov'))) {
        title = "⛓️ Cadena de Markov y Transiciones";
        body = `
            <p><strong>¿Qué es el Filtro de Cadenas de Markov?</strong></p>
            <p>Las cadenas de Markov son un modelo matemático que estudia la probabilidad de que ocurra un evento futuro basándose estrictamente en el estado actual de los eventos anteriores.</p>
            <p><strong>Teoría de Juego de Loterías:</strong></p>
            <p>El sistema estudia el histórico de sorteos completo. Calcula una matriz gigante de transiciones estadísticas que responde a la pregunta de: <em>Si en un sorteo dado sale el número X, ¿qué probabilidad hay en el siguiente sorteo de que salga el número Y?</em>.</p>
            <p><strong>Profundidad de Markov:</strong></p>
            <p>Fijar una mayor profundidad hace que el sistema busque patrones y secuencias cíclicas retrospectivas a lo largo de más sorteos previos encadenados en vez de limitarse al último sorteo. El generador utilizará esta información descartando combinaciones poco probables bajo la teoría de transición encadenada.</p>
        `;
    } else if (target.closest('#useNashSwitch') || target.closest('#nashWeight') || (target.innerText && target.innerText.includes('Equilibrio de Nash'))) {
        title = "⚖️ Equilibrio de Nash y Teoría de Juegos";
        body = `
            <p><strong>¿Qué es el Equilibrio de Nash en Lotería?</strong></p>
            <p>El Equilibrio de Nash es un concepto fundamental en la <em>Teoría de Juegos</em> desarrollado por el premio Nobel John Nash. Modela la interacción entre múltiples agentes racionales independientes.</p>
            <p><strong>¿Cómo se aplica a tus ganancias?</strong></p>
            <p>La lotería no es solo ganarle a la máquina; es también competir contra otros humanos. Si ganas empleando números hiper-populares como cumpleaños tradicionales (del 1 al 31) u ordenaciones redundantes, tendrás que repartir el bote de premios entre cientos de personas ganando una fracción insignificante. El Equilibrio de Nash busca una posición óptima que maximiza tu <strong>Valor Esperado de Retorno (EV)</strong> si aciertas.</p>
        `;
    } else if (target.closest('#useRegressionSwitch') || target.closest('#regressionBonus') || (target.innerText && target.innerText.includes('Regresión Lineal'))) {
        title = "📈 Regresión Lineal y Tendencia Histórica";
        body = `
            <p><strong>¿Qué hace la Regresión Lineal?</strong></p>
            <p>Es un modelo de análisis predictivo clásico en estadística e inteligencia de negocios. Traza una línea matemática recta ajustada óptimamente entre una nube de puntos retrospectivos históricos de sorteos pasados.</p>
            <p><strong>Aplicación:</strong></p>
            <p>El sistema proyecta sobre la recta de tiempo el comportamiento ondulatorio de los números, evaluando si el promedio de la combinación ganadora tiende de manera general hacia números más altos o más bajos en los sorteos vigentes. Al asignarle un peso de <strong>Bono de Regresión</strong>, se incentiva la generación de boletos que se ajusten y acompañen este vector de tendencia calculado continuamente.</p>
        `;
    }

    // 5. Filtros Predictivos / Preajustes / Backtesting / Base de datos / Dashboard
    else if (target.closest('#aiFiltersBtn') || (target.innerText && target.innerText.includes('Filtros Predictivos'))) {
        title = "🤖 Filtros Predictivos Avanzados";
        body = `
            <p><strong>¿Qué son los Filtros Predictivos?</strong></p>
            <p>Utilizan algoritmos estadísticos avanzados (percentiles, entropía de Shannon, rachas de frecuencia y análisis de ciclos) sobre el historial de sorteos.</p>
            <p><strong>¿Cómo funcionan?</strong></p>
            <p>El sistema examina la distribución histórica del juego seleccionado, identifica desviaciones y patrones estadísticos significativos, y sugiere configuraciones optimizadas para los filtros del panel de control (como rangos de entropía, sumas o distribución de terminaciones) basándose en tendencias cuantitativas reales.</p>
        `;
    } else if (target.closest('#saveFiltersBtn')) {
        title = "💾 Guardar Plantilla de Filtros";
        body = `
            <p>Permite congelar permanentemente tu combinación actual de sliders y límites estadísticos asignándoles un nombre identificativo para volver a usarlos cómodamente en cualquier instante.</p>
        `;
    } else if (target.closest('#loadFiltersBtn')) {
        title = "📂 Cargar Plantillas de Filtros";
        body = `
            <p>Accede directamente a tu colección exclusiva de estrategias y configuraciones previas guardadas.</p>
        `;
    } else if (target.closest('#filtersDashboardBtn')) {
        title = "📊 Filtros de Juego";
        body = `
            <p>Abre el completo centro de operaciones donde se encuentran los controles avanzados matemáticos. Aquí es donde ajustas cada una de las restricciones que debe satisfacer el generador de boletos.</p>
        `;
    } else if (target.closest('#disclaimerBtn')) {
        title = "⚠️ Descargo de Responsabilidad Ético";
        body = `
            <p>Recuerda siempre jugar con responsabilidad. Las loterías son juegos basados fundamentalmente en el azar y la aleatoriedad matemática. Ningún software en el mundo, por avanzado que sea, puede garantizar un premio seguro del 100% en sorteos ideales.</p>
            <p>DataLotto es una herramienta de asistencia científica que maximiza tus probabilidades reduciendo desperdicios matemáticos, pero recuerda definir siempre límites moderados y divertirte jugando.</p>
        `;
    } else if (target.closest('#runBacktestBtn') || target.closest('.collapsible-header[data-target="backtesting"]')) {
        title = "🧪 Módulo de Backtesting Retrospectivo";
        body = `
            <p><strong>¿Qué es el Backtesting?</strong></p>
            <p>Es el estándar de oro utilizado por físicos y analistas de apuestas deportivas de alto nivel para ratificar teorías cuantitativas.</p>
            <p><strong>¿Cómo valida tu estrategia?</strong></p>
            <p>Ejecuta una simulación retrospectiva histórica en base a sorteos de la vida real. Es decir, el simulador retrocederá de forma virtual 50, 100 o 500 sorteos reales pasados, aplicará fielmente tu actual configuración de filtros matemáticos para "generar" las apuestas sugeridas que habrías realizado en su momento, y luego las cruzará contra las bolas de la loto ganadoras reales que cayeron en ese momento.</p>
            <p>El reporte te mostrará de forma pormenorizada cuántos premios de 3, 4, 5 o 6 aciertos habrías obtenido, dándote la confirmación definitiva de la eficacia de tu estrategia de filtrado antes de poner en juego dinero de verdad.</p>
        `;
    } else if (target.closest('.db-tab')) {
        title = "🗄️ Pestañas de Análisis de Datos Integrados";
        body = `
            <p><strong>¿Qué muestran estos paneles?</strong></p>
            <p>Permite navegar entre diferentes módulos y vistas estadísticas del juego cargado:</p>
            <ul>
                <li><strong>Análisis Básico</strong>: Gráficos simples de frecuencia (números más repetidos), porcentajes de salida y ranking de apariciones simples directos.</li>
                <li><strong>Análisis Avanzado</strong>: Desglose de retrasos actuales de números, matriz de correlaciones de salida múltiple, comportamiento por décadas estadístico e intervalos de holgura.</li>
                <li><strong>Patrones Especiales</strong>: Histórico de apariciones de números pares vs impares, dispersión de sumas y simetrías espaciales complejas.</li>
                <li><strong>Estrategias</strong>: Recomendaciones científicas preestablecidas ajustadas individualmente para el tipo de sorteo seleccionado vigentes en el momento.</li>
            </ul>
        `;
    } else if (target.closest('.number-ball')) {
        const num = target.innerText.trim();
        title = `🎯 Bola de Número ${num}`;
        body = `
            <p><strong>¿Qué pasa al hacer clic en este número?</strong></p>
            <p>Has pulsado sobre el número <strong>${num}</strong> en la parrilla física táctil.</p>
            <p><strong>Acción directa:</strong></p>
            <p>Dependiendo del Modo de Selección en el que te encuentres, al pulsar esta bola podrás:</p>
            <ul>
                <li>Añadirla a tus <strong>Favoritos</strong> (para que salga obligatoriamente en tu jugada).</li>
                <li>Añadirla a tus <strong>Excluidos</strong> (para vetarla y que el algoritmo nunca la genere).</li>
                <li>Apreciar su coloración fría (azul), caliente (rojo) o ausente (gris/amarillo) para tomar decisiones informadas antes de fabricar tu boleto estadístico óptimo.</li>
            </ul>
        `;
    }

    // Actualizar título y contenido del helpModal
    const helpModalTitle = document.getElementById('helpModalTitle');
    const helpModalBody = document.getElementById('helpModalBody');
    if (helpModalTitle) helpModalTitle.textContent = title;
    if (helpModalBody) helpModalBody.innerHTML = body;

    // Mostrar modal
    this.toggleModal('helpModal', true);
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
            this.showToast(`Estado de la app: ${hasFailures ? 'Requiere atención' : 'Perfecto y listo para lanzar!'}. Revisa la consola de depuración.`, hasFailures ? 'error' : 'success');
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

  displayFilterFailureDiagnostics() {
    const ticketDiv = document.getElementById('ticket');
    if (!ticketDiv) return;

    this.updateFilterStateFromUI();
    const { results, actualSampleSize } = this.runFilterAudit(1000);

    // Filter results so we only show active filters that actually restrict combinations (percent < 100)
    const activeFilters = Object.keys(results)
      .map(key => ({ key, ...results[key] }))
      .filter(item => item.count > 0 && item.percent < 100);

    ticketDiv.classList.add('show', 'conflict');
    
    if (activeFilters.length === 0) {
      ticketDiv.innerHTML = `
        <div class="ticket-header" style="border-bottom: 2px solid #fee2e2; margin-bottom: 12px; padding-bottom: 10px;">
          <h4 style="color: #dc2626; display: flex; align-items: center; gap: 8px; margin: 0; font-weight: bold;">⚠️ Generación Incompleta</h4>
          <span style="font-size: 0.8rem; color: #7f1d1d; font-weight: bold;">Filtros Extremos</span>
        </div>
        <div style="padding: 10px 5px; color: #7f1d1d; font-size: 0.9rem; line-height: 1.5;">
          <p style="margin: 0 0 10px 0; font-weight: bold;">No se han podido encontrar combinaciones válidas en 50,000 intentos.</p>
          <p style="margin: 0 0 15px 0; color: #991b1b; font-size: 0.85rem;">El universo seleccionado en el volante interactivo es demasiado bajo o hay un conflicto estricto en los filtros avanzados configurados.</p>
          <button id="resetDiagFiltersBtn" style="width: 100%; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; font-size: 0.9rem;">
            🔄 Restablecer Filtros de ${this.currentGame.name}
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
        const labelText = isCritical ? 'Bloqueo Crítico 🚨' : isBottleneck ? 'Filtro Restrictivo ⚠️' : 'Filtro Activo';
        
        let recommendation = '';
        if (item.key === 'sum') {
          recommendation = '💡 Amplía el Rango de Suma en el panel de control avanzado.';
        } else if (item.key === 'terminacionesDistintas') {
          recommendation = '💡 Permite mayor variedad de terminaciones distintas.';
        } else if (item.key === 'parImpar') {
          recommendation = '💡 Activa más combinaciones de proporción Par/Impar.';
        } else if (item.key === 'bajosAltos') {
          recommendation = '💡 Activa más alternativas para proporción Bajos/Altos.';
        } else if (item.key === 'primos') {
          recommendation = '💡 Amplía los límites mínimo o máximo de cantidad de primos.';
        } else if (item.key === 'distancia') {
          recommendation = '💡 Relaja la distancia mínima de espaciado o aumenta la máxima.';
        } else if (item.key === 'sumaDigitos') {
          recommendation = '💡 Amplía los márgenes de suma de dígitos individuales.';
        } else if (item.key === 'consecutivos') {
          recommendation = '💡 Selecciona más patrones de bloques consecutivos permitidos.';
        } else if (item.key === 'agrupDecenas') {
          recommendation = '💡 Permite más patrones de agrupación por decenas.';
        } else if (item.key === 'desviacion') {
          recommendation = '💡 Amplía el rango de desviación estándar permitida.';
        } else if (item.key === 'entropyTerminaciones') {
          recommendation = '💡 Amplía los límites de Entropía de Terminaciones para mayor variedad de finales.';
        } else if (item.key === 'entropyIntervalos') {
          recommendation = '💡 Ajusta la Entropía de Intervalos para permitir un espaciado de números más flexible.';
        } else if (item.key === 'geometric') {
          recommendation = '💡 Desmarca patrones visuales excluidos en el panel geométrico.';
        } else if (item.key?.startsWith('star')) {
          recommendation = '💡 Flexibiliza filtros específicos aplicados para las estrellas.';
        }

        filtersHtml += `
          <div style="background: ${isCritical ? '#fff5f5' : '#fffaf5'}; border: 1px solid ${isCritical ? '#fecaca' : '#fed7aa'}; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
              <span style="font-weight: bold; color: #1e293b;">${item.name}</span>
              <span style="font-weight: 900; color: ${barColor}">${item.percent}% aprueban</span>
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
              <div style="width: ${item.percent}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b;">
              <span>${item.passed} de ${item.count} apuestas de prueba pasaron</span>
              <span style="font-weight: bold; color: ${barColor}">${labelText}</span>
            </div>
            ${recommendation ? `<div style="font-size: 0.75rem; color: #991b1b; margin-top: 4px; padding: 5px 8px; background: #fee2e2; border-radius: 4px; border-left: 2px solid ${barColor}; font-weight: 500;">${recommendation}</div>` : ''}
          </div>
        `;
      });

      ticketDiv.innerHTML = `
        <div class="ticket-header" style="border-bottom: 2px solid #fee2e2; margin-bottom: 12px; padding-bottom: 10px;">
          <h4 style="color: #dc2626; display: flex; align-items: center; gap: 8px; margin: 0; font-weight: bold;">⚠️ Conflicto de Filtros Detectado</h4>
          <span style="font-size: 0.8rem; color: #7f1d1d; font-weight: bold;">Auditoría de Embudo</span>
        </div>
        <div style="padding: 0 5px; display: flex; flex-direction: column; gap: 15px;">
          <div style="color: #7f1d1d; font-size: 0.85rem; line-height: 1.5; background: #fee2e2; padding: 10px; border-radius: 6px; border-left: 4px solid #ef4444;">
            <strong>⚠️ Bloqueo matemático detectado:</strong> No se han podido encontrar apuestas viables en 50,000 intentos.
            Nuestro auditor ha analizado tus filtros mediante simulaciones de prueba en tiempo real para encontrar el embudo:
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${filtersHtml}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;">
            <button id="resetDiagFiltersBtn" style="width: 100%; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: transform 0.1s, background 0.2s; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.23);">
              🔄 Restablecer Filtros de ${this.currentGame.name}
            </button>
            <p style="font-size: 0.75rem; color: #64748b; text-align: center; margin: 0;">
              Esto cargará los rangos recomendados diseñados por el motor de probabilidades para que la generación funcione de inmediato.
            </p>
          </div>
        </div>
      `;
    }

    const resetBtn = document.getElementById('resetDiagFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try {
          this.resetFiltersToDefault();
          this.showToast(`✅ Filtros de ${this.currentGame.name} restablecidos a valores recomendados.`, 'success');
          ticketDiv.classList.remove('show', 'conflict');
        } catch (err: any) {
          console.error("Fallo al resetear filtros:", err);
        }
      });
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

  updateFilterBadgesFromAudit() {
    this.updateFilterStateFromUI();
    const { results } = this.runFilterAudit(500);

    const filterSelectors: { [key: string]: string } = {
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
      entropyTerminaciones: '#entropyTerminacionesMin',
      entropyIntervalos: '#entropyIntervalosMin',
      geometric: '#geometricOptions',
      starSum: '#starSumMin',
      starParImpar: '#starParImparOptions',
      starBajosAltos: '#starBajosAltosOptions',
      starSumaDigitos: '#starSumaDigitosMin',
      starPrimos: '#starPrimosMin',
      starConsecutivos: '#starConsecutivosOptions',
      starDistancia: '#starDistanciaMin'
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
          badge.innerHTML = `🚨 Filtra ${Math.round(100 - item.percent)}%`;
        } else if (isWarning) {
          badge.style.color = '#d97706';
          badge.style.background = '#fef3c7';
          badge.style.borderColor = '#fcd34d';
          badge.innerHTML = `⚠️ Filtra ${Math.round(100 - item.percent)}%`;
        } else {
          badge.style.color = '#3b82f6';
          badge.style.background = '#eff6ff';
          badge.style.borderColor = '#93c5fd';
          badge.innerHTML = `📉 Filtra ${Math.round(100 - item.percent)}%`;
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
              customGameUrls: this.customGameUrls, // Persist custom URLs
              filterPresets: this.filterPresets, // Persist filter presets
          };
          saveAppStateToStorage(state);
      } catch (error) {
          console.error("Error guardando el estado:", error);
          this.showToast('Error al guardar el estado de la app', 'error');
      }
  }

  openSaveFilterModal() {
      const input = document.getElementById('filterPresetName') as HTMLInputElement;
      if (input) input.value = '';
      this.toggleModal('saveFilterModal', true);
  }

  confirmSaveFilter() {
      const input = document.getElementById('filterPresetName') as HTMLInputElement;
      const name = input?.value.trim() || `Filtro ${new Date().toLocaleDateString()}`;
      
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
      this.showToast(`✅ Filtro "${name}" guardado correctamente.`, 'success');
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
          container.innerHTML = '<div style="color:#666; text-align: center; padding: 10px;">No tienes filtros guardados.</div>';
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
      this.showToast(`📂 Filtro "${preset.name}" cargado.`, 'success');
  }

  deleteFilterPreset(id: string) {
      this.filterPresets = this.filterPresets.filter(p => p.id !== id);
      this.saveState();
      this.renderFilterPresetsList();
      this.showToast('Filtro eliminado.', 'info');
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
          this.showToast('No se pudo cargar el estado anterior', 'warning');
      }
  }

  updateUIFromFilterState() {
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

    // Switches
    const setChecked = (id: string, isChecked: boolean) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.checked = isChecked;
    };
    
    setChecked('useMarkovSwitch', this.filters.useMarkov);
    setChecked('useNashSwitch', this.filters.useNash);
    setChecked('useRegressionSwitch', this.filters.useRegression);

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

    // Update AI reasoning block based on current filter state
    const block = document.getElementById('aiReasoningBlock');
    const text = document.getElementById('aiReasoningText');
    if (block && text) {
      if (this.filters.aiReasoning) {
        text.textContent = this.filters.aiReasoning;
        block.style.display = 'block';
      } else {
        text.textContent = '';
        block.style.display = 'none';
      }
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
      this.showToast('⚠️ Límite de 10.000 sorteos alcanzado para mantener un alto rendimiento.', 'warning');
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
      this.showToast(`✅ Se han sumado ${actualDrawsToSimulate} sorteos más. Total: ${this.historicalData.length} sorteos.`, 'success');
    } else {
      this.showToast(`✅ Datos simulados generados correctamente: ${actualDrawsToSimulate} sorteos`, 'success');
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
      
      this.showToast(`✅ Datos reales cargados: ${totalDraws} sorteos`, 'success');
      this.autoValidateSavedTickets();
      
    } catch (error: any) {
      this.showToast(`Error cargando datos: ${error.message}`, 'error');
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
    if (modalHeaderTitle) modalHeaderTitle.textContent = `Base de Datos Real`;
    if (modalHeaderDesc) modalHeaderDesc.textContent = `Cargar resultados oficiales para ${currentGame.fullName}:`;

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
          bgBadge.innerHTML = `✅ ${freshData.length} sorteos`;
          setTimeout(() => {
            if (bgBadge) bgBadge.style.display = 'none';
          }, 2500);
        }

        if (!isAutoLoad) {
          this.showToast(`✅ Base de datos de ${gameName.toUpperCase()} actualizada (${freshData.length} sorteos)`, 'success');
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
        const dateKeywords = ['fecha', 'date'];
        dateIndex = header.findIndex(h => dateKeywords.some(k => h.includes(k)));

        const numberHeaderCandidates: {index: number, name: string}[] = [];
        const starHeaderCandidates: {index: number, name: string}[] = [];
        
        header.forEach((h, i) => {
            if (/^(n|bola|num|number|c)[\s_-]*\d+$/i.test(h)) {
                numberHeaderCandidates.push({index: i, name: h});
            } else if (/^(s|estrella|star|e|clave|powerbal|powerball|pb)[\s_-]*\d*$/i.test(h) || h.includes('clave') || h.includes('estrella') || h.includes('star') || h.includes('sueño') || h.includes('suno') || h.includes('powerbal') || h.includes('powerball') || h.includes('pb')) {
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
  updateDataAnalysis() {
    const dataInfo = document.getElementById('dataInfo');
    const dataStatsGrid = document.getElementById('dataStatsGrid');
    if (!dataInfo || !dataStatsGrid) return;
    
    if (!this.dataLoaded || this.historicalData.length === 0) {
      dataInfo.textContent = 'No hay datos cargados. Carga una base de datos CSV/DB o simula datos históricos.';
      dataInfo.className = 'data-info';
      dataStatsGrid.style.display = 'none';
      this.renderFrequencyChart(); // Clear chart
      return;
    }

    // Frequencies for Numbers
    const frequencies: { [key: number]: number } = {};
    for (let i = 1; i <= this.currentGame.numberRange; i++) frequencies[i] = 0;
    this.historicalData.forEach(draw => draw.numbers.forEach(num => {
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
        const starLabelName = this.currentGame.id === 'powerball' ? '🔴 Bolas Especiales' : (this.currentGame.id === 'megamillions' ? '🟡 Mega Ball' : (isGordo ? '🔑 Claves' : (this.currentGame.id === 'eurodreams' ? '🌙 Sueños' : '⭐ Estrellas')));
        starStatsText = `<br><span style="color: #d97706; font-size: 0.8rem;">${starLabelName} top: ${sortedStarFreq.slice(0, 2).map(([num]) => num).join(', ')}</span>`;
    }

    dataInfo.innerHTML = `📊 ${this.historicalData.length} sorteos cargados (${this.dataType.toUpperCase()})${starStatsText}`;
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
        const formattedDate = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        safeSetText('lastUpdateDate', formattedDate);
      } else {
        safeSetText('lastUpdateDate', '-');
      }
    } else {
      safeSetText('lastUpdateDate', '-');
    }
    
    const chiSquareEl = document.getElementById('chiSquare');
    const biasEl = document.getElementById('biasDetected');

    if (this.historicalData.length >= 50 && chiSquareEl && biasEl) {
        // Chi-Square for Numbers
        const expectedFrequency = (this.historicalData.length * this.currentGame.maxNumbers) / this.currentGame.numberRange;
        let chiSquareStat = 0;
        for (let i = 1; i <= this.currentGame.numberRange; i++) {
            chiSquareStat += Math.pow((frequencies[i] || 0) - expectedFrequency, 2) / expectedFrequency;
        }

        // Chi-Square for Stars (if applicable)
        if (this.currentGame.maxStars > 0) {
            const isGordo = this.currentGame.id === 'gordo';
            const minStar = isGordo ? 0 : 1;
            const maxStar = isGordo ? 9 : this.currentGame.starRange;
            const starCount = isGordo ? 10 : this.currentGame.starRange;
            const expectedStarFreq = (this.historicalData.length * this.currentGame.maxStars) / starCount;
            for (let i = minStar; i <= maxStar; i++) {
                chiSquareStat += Math.pow((starFrequencies[i] || 0) - expectedStarFreq, 2) / expectedStarFreq;
            }
        }

        // Adjust critical value based on degrees of freedom (approximate)
        // df = (numberRange - 1) + (starRange - 1 if applicable)
        const df = (this.currentGame.numberRange - 1) + (this.currentGame.maxStars > 0 ? (this.currentGame.starRange - 1) : 0);
        // Critical value for p=0.05, df=48 is 65.17. For df=48+11=59 is ~77.93
        const criticalValue = df > 50 ? 79.08 : 65.17; 
        
        const biasDetected = chiSquareStat > criticalValue;
        
        chiSquareEl.textContent = chiSquareStat.toFixed(2);
        biasEl.textContent = biasDetected ? 'Sí (Significativo al 95%)' : 'No (Distribución Normal)';
        biasEl.classList.toggle('invalid', biasDetected);
        biasEl.classList.toggle('valid', !biasDetected);
    } else if(chiSquareEl && biasEl) {
        chiSquareEl.textContent = 'N/A';
        biasEl.textContent = 'Datos insuficientes';
        biasEl.classList.remove('valid', 'invalid');
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
      trend = "🔥 Muy Caliente";
      recommendation = "❄️ Toca Enfriar";
      suggestedHot = Math.floor(maxNumbers * 0.2);
      suggestedCold = Math.floor(maxNumbers * 0.4);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else if (coldCount >= coldThreshold) {
      trend = "❄️ Muy Frío";
      recommendation = "🔥 Toca Calentar";
      suggestedHot = Math.floor(maxNumbers * 0.5);
      suggestedCold = Math.floor(maxNumbers * 0.1);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else if (neutralCount >= neutralThreshold) {
      trend = "⚖️ Muy Neutro";
      recommendation = "🌡️ Activar Extremos";
      suggestedHot = Math.floor(maxNumbers * 0.4);
      suggestedCold = Math.floor(maxNumbers * 0.4);
      suggestedNeutral = maxNumbers - suggestedHot - suggestedCold;
    } else {
      trend = "⚖️ Balanceado";
      recommendation = "🔄 Mantener Ciclo";
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
            <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px; font-weight: bold;">NÚMEROS:</div>
            <span class="profile-tag" style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedHot} Calientes</span>
            <span class="profile-tag" style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedNeutral} Neutros</span>
            <span class="profile-tag" style="background: #e0f2fe; color: #075985; padding: 2px 6px; border-radius: 4px;">${suggestedCold} Fríos</span>
        </div>
      `;

      if (maxStars > 0) {
          html += `
            <div>
                <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px; font-weight: bold;">ESTRELLAS:</div>
                <span class="profile-tag" style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedStarHot} Calientes</span>
                <span class="profile-tag" style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${suggestedStarNeutral} Neutros</span>
                <span class="profile-tag" style="background: #e0f2fe; color: #075985; padding: 2px 6px; border-radius: 4px;">${suggestedStarCold} Fríos</span>
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
        ball.classList.remove('hot', 'cold', 'absent', 'suggested', 'favorite', 'excluded');
        
        if (this.selectedNumbers.has(i)) {
          ball.classList.add('selected');
        } else {
          ball.classList.remove('selected');
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
      selectionTitle.textContent = `Selección de números (${this.currentGame.name})`;
    }

    grid.style.gridTemplateColumns = `repeat(${this.currentGame.gridCols}, 1fr)`;

    const isNacional = this.currentGame.id === 'nacional';
    if (isNacional) {
      grid.classList.add('game-nacional');
    } else {
      grid.classList.remove('game-nacional');
    }

    const startNum = isNacional ? 10 : 1;

    // Main Numbers Grid
    for (let i = startNum; i <= this.currentGame.numberRange; i++) {
      if (isNacional && i % 10 === 0) {
        const rowLabels = [
          "1ª Cifra (Decena de millar)",
          "2ª Cifra (Unidad de millar)",
          "3ª Cifra (Centena)",
          "4ª Cifra (Decena)",
          "5ª Cifra (Unidad - Reintegro)"
        ];
        const labelIdx = Math.floor(i / 10) - 1;
        if (labelIdx >= 0 && labelIdx < 5) {
          const label = document.createElement('div');
          label.style.cssText = 'grid-column: span 10; margin-top: 12px; margin-bottom: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; text-align: left; padding-left: 2px;';
          label.textContent = rowLabels[labelIdx];
          grid.appendChild(label);
        }
      }

      const ball = document.createElement('div');
      ball.classList.add('number-ball');
      ball.dataset.number = String(i);
      ball.dataset.type = 'number';
      ball.innerHTML = `${isNacional ? i % 10 : i}<span class="number-icon"></span>`;
      grid.appendChild(ball);
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
              starsGridText.textContent = 'Selección de Clave (Llave)';
          } else if (this.currentGame.id === 'eurodreams') {
              starsGridIcon.textContent = '🌙';
              starsGridText.textContent = 'Selección de Sueños';
          } else if (this.currentGame.id === 'powerball') {
              starsGridIcon.textContent = '🔴';
              starsGridText.textContent = 'Selección de Bolas Especiales';
          } else {
              starsGridIcon.textContent = '⭐';
              starsGridText.textContent = 'Selección de Estrellas';
          }
      }

      const isGordo = this.currentGame.id === 'gordo';
      const startIdx = isGordo ? 0 : 1;
      const endIdx = isGordo ? this.currentGame.starRange - 1 : this.currentGame.starRange;
      for (let i = startIdx; i <= endIdx; i++) {
        const ball = document.createElement('div');
        ball.classList.add('number-ball', 'star-ball');
        ball.dataset.number = String(i);
        ball.dataset.type = 'star';
        ball.innerHTML = `${i}<span class="number-icon"></span>`;
        starsGrid.appendChild(ball);
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
        selectionTitle.textContent = `Marca exactamente ${system.baseNumbersCount} números base (Sistema Reducido)`;
        return;
      }
    }
    
    selectionTitle.textContent = `Selección de números (${this.currentGame.name})`;
  }

  selectAiBase() {
    const select = document.getElementById('reducedSystemSelect') as HTMLSelectElement;
    const gameId = this.currentGame.id;
    const systems = REDUCED_SYSTEMS[gameId] || [];
    const selectedId = select?.value;
    const system = systems.find(s => s.id === selectedId);
    
    if (!system) {
      this.showToast('Selecciona un sistema reducido válido primero.', 'warning');
      return;
    }
    
    const countNeeded = system.baseNumbersCount;
    this.clearSelections(false);
    
    const hasData = this.numberStats && Object.values(this.numberStats).some(stat => stat.frequency > 0);
    
    let selectedList: number[] = [];
    if (hasData) {
      const sortedNumbers = Object.keys(this.numberStats)
        .map(num => parseInt(num))
        .sort((a, b) => {
          const scoreA = this.numberStats[a]?.score || 0;
          const scoreB = this.numberStats[b]?.score || 0;
          const freqA = this.numberStats[a]?.frequency || 0;
          const freqB = this.numberStats[b]?.frequency || 0;
          return (scoreB + freqB) - (scoreA + freqA);
        });
      selectedList = sortedNumbers.slice(0, countNeeded);
      this.showToast(`✨ Seleccionados los ${countNeeded} mejores números base según estadísticas históricas.`, 'success');
    } else {
      const range = this.currentGame.numberRange;
      const isNacional = this.currentGame.id === 'nacional';
      const startNum = isNacional ? 10 : 1;
      
      const pool: number[] = [];
      for (let i = startNum; i <= range; i++) pool.push(i);
      
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      
      selectedList = pool.slice(0, countNeeded);
      this.showToast(`✨ Generados ${countNeeded} números base equilibrados (Carga datos para un análisis estadístico real).`, 'info');
    }
    
    selectedList.forEach(num => {
      this.selectedNumbers.add(num);
    });
    
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
    
    this.showToast(`Cambiado a ${this.currentGame.name}`, 'success');
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

    this.updateNextDrawDayOptions();
    this.updateTicketDrawDateBadge();
    this.initFilterInfoButtons();
  }

  getGameAllowedDaysText(): string {
    const allowedDays = this.currentGame.allowedDays || [0, 1, 2, 3, 4, 5, 6];
    const dayNames: { [key: number]: string } = {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      0: 'Domingo'
    };

    if (allowedDays.length === 7) {
      return 'todos los días de la semana';
    }

    const names = allowedDays.map(d => dayNames[d]);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
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
      const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const dayName = DAY_NAMES[dayOfWeek];
      const nextValidStr = this.getNextValidDrawDateStr(selectedDate);
      const nextValidObj = new Date(nextValidStr + 'T00:00:00');
      const nextValidFormatted = nextValidObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      if (warningText) {
        warningText.innerHTML = `⚠️ <strong>${this.currentGame.name}</strong> no se celebra los <strong>${dayName}s</strong>.<br>Días oficiales de sorteo: <strong>${this.getGameAllowedDaysText()}</strong>.<br>Próximo sorteo más cercano: <strong>${nextValidFormatted}</strong>.`;
      }
      if (warningDiv) warningDiv.style.display = 'flex';
    } else {
      if (warningDiv) warningDiv.style.display = 'none';
    }
  }

  updateTicketDrawDateBadge() {
    const badge = document.getElementById('ticketDrawDaysBadge');
    if (badge) {
      badge.textContent = `📅 Sorteos: ${this.getGameAllowedDaysText()}`;
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
      title.innerHTML = `🗓️ Calendario de Sorteos (${this.currentGame.name})`;
    }

    const monthLabel = document.getElementById('drawCalMonthLabel');
    const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
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
          <span style="font-size: 0.65rem; margin-top: 2px; ${isSelected ? 'color: #fef08a;' : 'color: #047857;'} font-weight: 700;">${starIcon} SORTEO</span>
        `;

        dayCell.addEventListener('click', () => {
          if (input) {
            input.value = dateStr;
            this.validateAndWarnTicketDate(dateStr);
          }
          this.toggleModal('drawDateCalendarModal', false);
          const dateFormatted = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          this.showToast(`📅 Sorteo oficial fijado para: ${dateFormatted}`, 'success');
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
          <span style="font-size: 0.6rem; color: #94a3b8; margin-top: 2px;">Sin sorteo</span>
        `;

        dayCell.addEventListener('click', () => {
          const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
          this.showToast(`🚫 No hay sorteo de ${this.currentGame.name} los ${DAY_NAMES[dayOfWeek]}s. Elige un día marked en verde.`, 'warning');
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
        selectedInfo.textContent = `Fecha seleccionada: ${selObj.toLocaleDateString('es-ES')}`;
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
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      0: 'Domingo'
    };

    const daysOrder = [1, 2, 3, 4, 5, 6, 0];
    const currentValue = parseInt(daySelector.value);

    daySelector.innerHTML = '';
    let validSelected = false;

    daysOrder.forEach(dayNum => {
      if (allowedDays.includes(dayNum)) {
        const option = document.createElement('option');
        option.value = String(dayNum);
        option.textContent = `Próximo sorteo: ${dayNames[dayNum]}`;
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
        chip.textContent = `${p}P/${i}I`;
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
        chip.textContent = `${b}B/${a}A`;
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

    // 14. Multiple Strategy Options
    this.renderMultipleStrategyOptions();
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
            chip.textContent = `${p}P/${i}I`;
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
            chip.textContent = `${b}B/${a}A`;
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
          this.showToast('🛡️ Condiciones de uso aceptadas correctamente. ¡Bienvenido a DataLotto!', 'success');
          
          this.sendTelemetry('CONTRACT_SIGNED', { signer: "Usuario Aceptante", sigId: sigId });
        }
      });
    }
  }

  initFilterInfoButtons() {
    const filterGroups = document.querySelectorAll('.filter-group, .dashboard-filter-group');
    filterGroups.forEach((group) => {
      const titleEl = group.querySelector('.filter-title, .dashboard-filter-header');
      if (!titleEl) return;

      if (titleEl.querySelector('.filter-info-btn')) return;

      let infoText = group.getAttribute('data-info') || group.getAttribute('title') || '';
      const headerText = titleEl.textContent || '';

      if (headerText.includes('Predictivos') || group.querySelector('#useMarkovSwitch')) {
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

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-info-btn';
      btn.setAttribute('aria-label', `Información sobre ${headerText.trim()}`);
      btn.title = "Toca para ver explicación del filtro";
      btn.setAttribute('data-info', infoText);
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

        let popover = filterGroup.querySelector<HTMLElement>('.filter-info-popover');
        const wasActive = popover?.classList.contains('active');

        document.querySelectorAll('.filter-info-popover.active').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.filter-info-btn.active').forEach(b => b.classList.remove('active'));

        if (!wasActive) {
          infoBtn.classList.add('active');
          if (!popover) {
            popover = document.createElement('div');
            popover.className = 'filter-info-popover';

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

            const titleEl = filterGroup.querySelector('.filter-title, .dashboard-filter-header');
            if (titleEl) {
              titleEl.insertAdjacentElement('afterend', popover);
            } else {
              filterGroup.appendChild(popover);
            }
          }
          popover.classList.add('active');
        }
        return;
      }

      if (!target.closest('.filter-info-popover')) {
        document.querySelectorAll('.filter-info-popover.active').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.filter-info-btn.active').forEach(b => b.classList.remove('active'));
      }
    });

    // Interceptor in capture phase for Help Mode
    document.addEventListener('click', (e) => {
        if (!this.helpModeActive) return;

        const target = e.target as HTMLElement;
        // Ignore interactions on the sidebar, toggle buttons, reset/close buttons, help modals, filter info buttons, and collapsible elements
        if (
            target.closest('#sidebar') || 
            target.closest('#helpModeBtn') || 
            target.closest('#menuBtn') || 
            target.closest('#helpModal') || 
            target.closest('#overlay') ||
            target.id === 'closeHelpModalBtn' ||
            target.closest('.collapsible-header') ||
            target.closest('.collapse-btn') ||
            target.closest('.filter-info-btn') ||
            target.closest('.filter-info-popover')
        ) {
            return;
        }

        // Intercept action
        e.preventDefault();
        e.stopPropagation();

        this.showHelpForElement(target);
    }, true);

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
            
            this.showToast(`📊 Estudiando ahora: ${filterSelect.options[filterSelect.selectedIndex].text}`, 'info');
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
            this.showToast('🗑️ Se han borrado todos los datos históricos y las selecciones.', 'info');
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
        const formatted = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        this.showToast(`⚡ Próximo sorteo fijado: ${formatted}`, 'info');
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
        const formatted = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        this.showToast(`✅ Fecha corregida al próximo sorteo: ${formatted}`, 'success');
      }
    });
    document.getElementById('shareBtn')?.addEventListener('click', () => this.shareTicket());
    document.getElementById('playOnlineBtn')?.addEventListener('click', () => this.playTicketOnline(this.currentTicket!));
    document.getElementById('reducedSystemSelect')?.addEventListener('change', () => {
        this.updateReducedSystemInfo();
    });
    document.getElementById('reducedAiBaseBtn')?.addEventListener('click', () => {
        this.selectAiBase();
    });
    document.getElementById('reducedClearBaseBtn')?.addEventListener('click', () => {
        this.clearSelections(false);
        this.showToast('🗑️ Se han borrado las selecciones de base del sistema reducido.', 'info');
    });
    document.querySelector('.filters-panel')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'range') {
            const display = document.getElementById(`${target.id}Value`);
            if (display) display.textContent = target.value;
        }
        this.updateFilterBadgesFromAudit();
    });
    document.querySelector('.filters-panel')?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'range') return; // already handled by input event
        this.updateFilterBadgesFromAudit();
    });
    document.querySelector('.filters-panel')?.addEventListener('click', e => {
        // FIX: Cast to HTMLElement to access classList
       const target = e.target as HTMLElement;
       if(target.classList.contains('filter-chip')) {
           target.classList.toggle('active');
           this.updateFilterBadgesFromAudit();
       }
    });
    document.getElementById('filterModeSimpleBtn')?.addEventListener('click', () => {
        this.setFilterPanelMode('simple');
        this.showToast('🎯 Modo de Filtros Simple activado (filtros intuitivos visibles).', 'info');
    });
    document.getElementById('filterModeExpertBtn')?.addEventListener('click', () => {
        this.setFilterPanelMode('expert');
        this.showToast('🔬 Modo de Filtros Experto activado (todos los filtros visibles).', 'info');
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
    
    document.getElementById('helpModeBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleHelpMode();
    });
    document.getElementById('closeHelpModalBtn')?.addEventListener('click', () => this.toggleModal('helpModal', false));

    // Eventos de Registro de Aceptación y Condiciones de Uso
    document.getElementById('viewSignedContractBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeSidebar();
        
        const sigDate = localStorage.getItem('datalotto_contract_signature_date') || new Date().toLocaleString('es-ES');
        const sigId = localStorage.getItem('datalotto_contract_signature_id') || 'REG-PRE-ACCEPT';
        const anonId = this.anonymousUserId;
        
        const logContainer = document.getElementById('signedContractLogContent');
        if (logContainer) {
            logContainer.textContent = `========================================================================
             REGISTRO DE CONFORMIDAD - DATALOTTO           
========================================================================

ID DE REGISTRO:      ${sigId}
FECHA Y HORA:        ${sigDate}
ESTADO DE REGISTRO:  ACEPTADO Y VERIFICADO DIGITALMENTE
ID DE DISPOSITIVO:   ${anonId}

------------------------------------------------------------------------
CONDICIONES DE USO ACEPTADAS:
------------------------------------------------------------------------
1. El usuario acepta y declara comprender que DataLotto es 
   una aplicación exclusivamente de entretenimiento y análisis estadístico.
2. NINGUNA ESTRATEGIA A LARGO PLAZO VENCE AL AZAR. Cada sorteo es un 
   evento de probabilidad pura, independiente de los anteriores.
3. Esta aplicación NO fomenta las apuestas ni el juego compulsivo.
4. El usuario declara ser mayor de edad y asume el 100% de la 
   responsabilidad por cualquier uso que haga de esta herramienta.
5. El desarrollador queda totalmente exonerado de cualquier pérdida 
   económica o reclamación de daños directos o indirectos.

------------------------------------------------------------------------
            ESTE LOG CONSTITUYE PRUEBA DE CONFORMIDAD DIGITAL           
========================================================================`;
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
            this.showToast('Por favor, escribe un enlace válido.', 'warning');
            return;
        }
        
        if (!/^https?:\/\//i.test(val)) {
            val = 'https://' + val;
        }
        
        this.customGameUrls[gameKey] = val;
        this.saveState();
        this.toggleModal('setUrlPromptModal', false);
        this.showToast('✅ Enlace configurado correctamente.', 'success');
        
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
    document.getElementById('aiFiltersBtn')?.addEventListener('click', () => this.applyAiFilters());
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



    document.getElementById('vizModeHeatmapBtn')?.addEventListener('click', () => {
        this.vizMode = 'heatmap';
        document.getElementById('vizModeHeatmapBtn')?.classList.add('active');
        document.getElementById('vizModeHeatmapBtn')?.setAttribute('style', 'border: none; padding: 6px 12px; font-size: 0.85rem; font-weight: bold; border-radius: 6px; cursor: pointer; background: var(--primary); color: white;');
        document.getElementById('vizModeRankingBtn')?.classList.remove('active');
        document.getElementById('vizModeRankingBtn')?.setAttribute('style', 'border: none; padding: 6px 12px; font-size: 0.85rem; font-weight: bold; border-radius: 6px; cursor: pointer; background: transparent; color: #475569;');
        this.renderFrequencyChart();
    });

    document.getElementById('vizModeRankingBtn')?.addEventListener('click', () => {
        this.vizMode = 'ranking';
        document.getElementById('vizModeRankingBtn')?.classList.add('active');
        document.getElementById('vizModeRankingBtn')?.setAttribute('style', 'border: none; padding: 6px 12px; font-size: 0.85rem; font-weight: bold; border-radius: 6px; cursor: pointer; background: var(--primary); color: white;');
        document.getElementById('vizModeHeatmapBtn')?.classList.remove('active');
        document.getElementById('vizModeHeatmapBtn')?.setAttribute('style', 'border: none; padding: 6px 12px; font-size: 0.85rem; font-weight: bold; border-radius: 6px; cursor: pointer; background: transparent; color: #475569;');
        this.renderFrequencyChart();
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

    // Dashboard Filters Events
    document.querySelectorAll('.db-filter-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            this.handleDashboardFilterClick(target);
        });
    });

    document.getElementById('dbClearFiltersBtn')?.addEventListener('click', () => {
        this.clearDashboardFilters();
    });

    // Dashboard Tabs Events
    document.querySelectorAll('.db-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const tabId = target.dataset.tab!;
            this.switchDashboardTab(tabId);
        });
    });

    document.getElementById('dbBackToMainBtn')?.addEventListener('click', () => {
        this.showMainApp();
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

  // ===== FILTROS (Reactivados y completos) =====
  updateFilterStateFromUI() {
      // FIX: Added type safety for DOM element access.
      const getVal = (id: string, isFloat = false): number => {
          const el = document.getElementById(id) as HTMLInputElement;
          if (!el) return isFloat ? 0.0 : 0;
          return isFloat ? parseFloat(el.value) : parseInt(el.value);
      };
      const getChecked = (id: string): boolean => (document.getElementById(id) as HTMLInputElement)?.checked || false;
      const getActiveChips = (selector: string): string[] => Array.from(document.querySelectorAll(selector)).map(el => (el as HTMLElement).dataset.value!);

      this.filters.terminaciones = getActiveChips('#terminacionesOptions .filter-chip.active').map(Number);
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
      
      this.filters.ai.markovDepth = getVal('markovDepth');
      this.filters.ai.nashWeight = getVal('nashWeight');
      this.filters.ai.regressionBonus = getVal('regressionBonus');

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
    
    const excludedSet = type === 'number' ? this.excludedNumbers : this.excludedStars;
    const selectedSet = type === 'number' ? this.selectedNumbers : this.selectedStars;
    const favoriteSet = type === 'number' ? this.favoriteNumbers : this.favoriteStars;
    const hotSet = type === 'number' ? this.hotNumbers : this.hotStars;
    const coldSet = type === 'number' ? this.coldNumbers : this.coldStars;
    const absentSet = type === 'number' ? this.absentNumbers : this.absentStars;
    const suggestedSet = type === 'number' ? this.suggestedNumbers : this.suggestedStars;

    if (excludedSet.has(number) && this.currentSelectionMode !== 'excluded') {
        this.showToast('Este número está excluido.', 'warning');
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
                    this.showToast('Máximo 10 favoritos permitidos.', 'warning');
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
                this.showToast('No puedes excluir un número ya seleccionado.', 'warning');
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
        this.showToast(`Límite de ${limit} números alcanzado.`, 'warning');
      }
    } else {
      const limit = isMultiple ? 5 : this.currentGame.maxStars;
      if (this.selectedStars.size < limit) {
        this.selectedStars.add(number);
        document.querySelector(`.number-ball[data-number="${number}"][data-type="star"]`)?.classList.add('selected');
      } else {
        this.showToast(`Límite de ${limit} estrellas alcanzado.`, 'warning');
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
    this.suggestedNumbers.clear();
    this.suggestedStars.clear();
    document.querySelectorAll('.number-ball.figure-selection').forEach(b => b.classList.remove('figure-selection'));
    
    if (fullClear) {
      this.excludedNumbers.clear();
      this.excludedStars.clear();
      this.hotNumbers.clear();
      this.hotStars.clear();
      this.coldNumbers.clear();
      this.coldStars.clear();
      this.absentNumbers.clear();
      this.absentStars.clear();
      this.favoriteNumbers.clear();
      this.favoriteStars.clear();
      
      document.querySelectorAll('.number-ball').forEach(b => {
          b.classList.remove('excluded', 'hot', 'cold', 'absent', 'suggested', 'favorite');
          const icon = b.querySelector('.number-icon');
          if (icon) icon.textContent = '';
      });
      this.saveState();
    }
    document.querySelectorAll('.number-ball.selected').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.number-ball.suggested').forEach(b => b.classList.remove('suggested'));
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
      this.showToast(`No hay suficientes números para seleccionar ${this.currentGame.maxNumbers} al azar.`, 'warning');
      return;
    }
    if (this.currentGame.maxStars > 0 && availableStars.length < this.currentGame.maxStars) {
        this.showToast(`No hay suficientes estrellas para seleccionar ${this.currentGame.maxStars} al azar.`, 'warning');
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
        this.showToast('Modo de selección normal activado', 'info');
    } else {
        this.currentSelectionMode = mode;
        document.querySelector(`.selection-mode-btn[data-mode="${mode}"]`)?.classList.add('active');
        const modeText = {
            excluded: 'marcar números excluidos',
            hot: 'marcar números Calientes',
            cold: 'marcar números Fríos',
            figure: 'dibujar una Figura',
            absent: 'marcar números Ausentes',
            favorites: 'marcar números Favoritos'
        };
        this.showToast(`Modo para ${modeText[mode]} activado`, 'info');
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
    const generateBtn = document.getElementById('generateBtn');

    if(winningOptions) winningOptions.style.display = strategy === 'winning' ? 'block' : 'none';
    if(multipleOptions) multipleOptions.style.display = strategy === 'multiple' ? 'block' : 'none';
    if(reducedOptions) reducedOptions.style.display = strategy === 'reducida' ? 'block' : 'none';
    if(realTimeStatsSection) realTimeStatsSection.style.display = strategy === 'simple' ? 'block' : 'none';
    
    if (generateBtn) {
        generateBtn.innerHTML = `<span>🤞 Generar Combinación</span>`;
    }
    
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
    this.showLoading('Iniciando...');
    
    this.updateFilterStateFromUI();
    const availableUniverse = this.getAvailableUniverse('number');
    const availableStars = this.getAvailableUniverse('star');
    const maxNumbers = this.currentGame.maxNumbers;
    const maxStars = this.currentGame.maxStars;

    if (availableUniverse.length < maxNumbers) {
      this.showToast(`Imposible generar. Menos de ${maxNumbers} números disponibles con los filtros actuales.`, 'error');
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
              throw new Error('No se encontró ninguna combinación que cumpla todos los filtros.');
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
                  throw new Error(`❌ Límite oficial excedido: Euromillones no permite más de 756 apuestas por boleto en el canal oficial (tu selección de ${numCount} números y ${starCount} estrellas genera ${totalBets} apuestas).`);
              }
          }

          if (this.currentGame.id === 'eurodreams') {
              if (numCount > 6 && starCount > 1) {
                  throw new Error(`❌ Apuesta Múltiple Cruzada no autorizada en EuroDreams. La normativa oficial SELAE permite seleccionar entre 7 y 10 números principales con 1 Sueño, O BIEN 6 números principales con 2 a 5 Sueños.`);
              }
          }

          if (availableUniverse.length < numCount) {
              throw new Error(`No hay suficientes números (${availableUniverse.length}) para una múltiple de ${numCount}.`);
          }
          if (maxStars > 0 && availableStars.length < starCount) {
              throw new Error(`No hay suficientes estrellas (${availableStars.length}) para una múltiple de ${starCount}.`);
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
              throw new Error('No se ha seleccionado ningún sistema de reducción válido o no es compatible con el juego activo.');
          }
          if (this.selectedNumbers.size !== system.baseNumbersCount) {
              throw new Error(`Debes seleccionar exactamente ${system.baseNumbersCount} números base en la cuadrícula. Actualmente tienes ${this.selectedNumbers.size}.`);
          }
          
          this.showLoading('Generando combinación reducida...');
          
          const baseNumbersSorted = Array.from(this.selectedNumbers).sort((a, b) => a - b);
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
            triggerMsg = 'Combinación inteligente encontrada!';
            toastMsg = '✅ Combinación inteligente encontrada!';
        } else if (strategy === 'winning') {
            const generateCount = (document.getElementById('generateCount') as HTMLInputElement)?.value || '100';
            const playCount = combinations.length;
            triggerMsg = `Generadas ${generateCount} combinaciones. Mostrando las ${playCount} mejores`;
            toastMsg = `✅ Generadas ${generateCount} combinaciones. Mostrando las ${playCount} mejores`;
        } else if (strategy === 'multiple' && this.lastMultipleStats) {
            const { validCount, totalCount } = this.lastMultipleStats;
            const percentage = ((validCount / totalCount) * 100).toFixed(1);
            triggerMsg = `Múltiple encontrada! ${validCount}/${totalCount} combinaciones internas cumplen los filtros (${percentage}%)`;
            toastMsg = `✅ Múltiple encontrada! ${validCount}/${totalCount} combinaciones internas cumplen los filtros (${percentage}%)`;
        } else if (strategy === 'reducida') {
            triggerMsg = `Boleto Reducido de ${combinations.length} apuestas generado con el sistema: ${selectedSystemName}`;
            toastMsg = `✅ Boleto Reducido generado con éxito!`;
        }

        if (triggerMsg) {
            this.showToast(toastMsg, 'success');
            this.showUITrigger(triggerMsg);
        }
      } else {
         this.showToast('No se encontró ninguna combinación que cumpla todos los filtros. Prueba a flexibilizarlos.', 'warning');
         this.displayFilterFailureDiagnostics();
      }

    } catch (error: any) {
        this.showToast(`Error: ${error.message}`, 'error');
        if (error.message && error.message.includes('No se encontró ninguna combinación')) {
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
  
  isValidCombination(combination: number[], stars: number[] = []): boolean {
    return validateCombination(combination, stars, this.currentGame, this.filters, this.primes);
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

    if (ticketDiv.classList.contains('conflict')) {
        ticketDiv.classList.remove('conflict');
        ticketDiv.innerHTML = `
          <div class="ticket-header">
            <h4>🎫 Tu Boleto Ganador</h4>
            <p id="ticketDate"></p>
          </div>
          <div class="ticket-draw-date-selector">
              <label for="ticketDrawDate" style="display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 0.9rem; color: var(--dark); margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                <span>📅 Fecha del Sorteo (Opcional):</span>
                <span id="ticketDrawDaysBadge" class="ticket-draw-days-badge" style="background: #e0e7ff; color: #3730a3; font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border-radius: 12px; border: 1px solid #c7d2fe;">📅 Días de Sorteo</span>
              </label>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input type="date" id="ticketDrawDate" style="flex: 1; min-width: 150px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; outline: none;">
                <button type="button" id="nextValidDrawDateBtn" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="Establecer automáticamente la fecha del próximo sorteo oficial">
                  ⚡ Próximo Sorteo
                </button>
                <button type="button" id="openDrawCalendarBtn" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="Ver calendario visual interactivo con días no válidos tachados">
                  🗓️ Ver Calendario
                </button>
              </div>
              <div id="ticketDateWarning" style="display: none; margin-top: 8px; padding: 8px 12px; background: #fffbe3; border: 1px solid #fef08a; border-radius: 6px; font-size: 0.82rem; color: #713f12; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                <span id="ticketDateWarningText"></span>
                <button type="button" id="fixTicketDateBtn" style="background: #d97706; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: bold; cursor: pointer;">👉 Corregir a próximo sorteo</button>
              </div>
          </div>
          <div id="ticketCombinations"></div>
          <div class="ticket-actions">
            <button class="ticket-btn save-btn" id="saveBtn">
              💾 Guardar Boleto
            </button>
            <button class="ticket-btn share-btn" id="shareBtn">
              📤 Compartir
            </button>
          </div>
        `;
        
        // Re-attach listeners to the reconstructed buttons
        document.getElementById('saveBtn')?.addEventListener('click', () => this.saveTicket());
        document.getElementById('shareBtn')?.addEventListener('click', () => this.shareTicket());
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
        this.selectedNumbers = new Set(finalCombinations[0]);
        this.selectedStars = new Set(starsCombinations[0] || []);

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
        const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        this.showToast(`⚠️ ${this.currentGame.name} no se juega los ${DAY_NAMES[dayOfWeek]}s. Días de sorteo: ${this.getGameAllowedDaysText()}.`, 'warning');
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
    this.sendTelemetry('save_ticket', {
        gameId: metrics.gameId,
        combinationsCount: metrics.combinationsCount,
        betType: metrics.betType,
        numbersCount: metrics.numbersCount,
        starsCount: metrics.starsCount,
        drawDate: savedTicketCopy.drawDate || 'Desconocida'
    });

    this.currentTicket = null;
    const ticketDiv = document.getElementById('ticket');
    if(ticketDiv) ticketDiv.classList.remove('show');
    this.showToast('✅ Boleto guardado', 'success');
  }

  deleteTicket(date: string) {
    this.savedTickets = this.savedTickets.filter(t => t.date !== date);
    this.saveState();
    this.updateSavedTickets();
    this.showToast('Boleto eliminado', 'info');
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
      container.innerHTML = '<div style="color:#666; text-align: center; padding: 20px;">No tienes boletos guardados</div>';
      this.updateSavedTicketsBadge();
      return;
    }

    const filterSelect = document.getElementById('savedTicketsGameFilter') as HTMLSelectElement;
    const filterVal = filterSelect ? filterSelect.value : 'all';

    const filteredTickets = filterVal === 'all'
      ? this.savedTickets
      : this.savedTickets.filter(t => t.gameId === filterVal);

    if (filteredTickets.length === 0) {
      container.innerHTML = '<div style="color:#666; text-align: center; padding: 20px;">No tienes boletos guardados para este juego</div>';
      this.updateSavedTicketsBadge();
      return;
    }

    const strategyMap: { [key: string]: string } = {
        simple: 'Simple',
        winning: 'E. Ganadora',
        multiple: 'Múltiple'
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
              <span><strong>¡BOLETO VALIDADO CON ACIERTOS PREMIADOS!</strong></span>
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
            <span style="display: flex; align-items: center; gap: 6px;">ℹ️ <strong>Boleto Validado</strong> — Sin aciertos en categorías premiadas</span>
            <span style="color: #475569; font-size: 0.75rem;">✓ Verificado</span>
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
      const drawDateHTML = ticket.drawDate ? `<span class="saved-ticket-draw-date">Sorteo: ${new Date(ticket.drawDate + 'T00:00:00').toLocaleDateString()}</span>` : '';

      let combosHTML = '';
      let actionsHTML = '';
      const playOnlineHTML = `<button class="play-online-btn-saved">🔗 Jugar Online</button>`;

      // Check if it's a system ticket (Multiple with > 6 numbers)
      const isSystemTicket = ticket.combinations.length > 0 && (
        ticket.combinations[0].length > (GAMES[ticket.gameId || 'bonoloto']?.maxNumbers || 6) ||
        (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > (GAMES[ticket.gameId || 'bonoloto']?.maxStars || 1))
      );

      if (ticket.gameId === 'powerball') {
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

          combosHTML = `
            <div style="background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #9f1239; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇺🇸 Powerball EE. UU. (${costData.totalBets} apuestas)</span>
                <span style="background: #be123c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Desglose por Categorías</span>
              </div>

              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#e11d48' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">+ PB:</span>
                  ${redSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningRedSet.has(r) ? '#9f1239' : '#fda4af'}; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #ffe4e6; color: #881337; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: left;">Categoría</th>
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center;">Aciertos Requeridos</th>
                    <th style="padding: 6px 10px; border: 1px solid #fecdd3; text-align: center;">Apuestas Ganadoras</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #9f1239; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>🎯 TOTAL APUESTAS PREMIADAS EN ESTE BOLETO:</span>
                <span style="font-size: 1.1rem; color: #fef08a;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} apuesta(s)</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
        } else {
          combosHTML = `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #9f1239; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇺🇸 Powerball EE. UU. (${costData.totalBets} apuestas)</span>
              </div>
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #be123c; font-weight: bold; align-self: center;">+ PB:</span>
                  ${redSuperset.map(r => `<div class="saved-combination-number" style="background: #e11d48; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
        }
      } else if (ticket.gameId === 'megamillions') {
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

          combosHTML = `
            <div style="background: #fefce8; border: 1.5px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇺🇸 Mega Millions EE. UU. (${costData.totalBets} apuestas)</span>
                <span style="background: #ca8a04; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Desglose por Categorías</span>
              </div>

              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#eab308' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">+ MB:</span>
                  ${goldSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningGoldSet.has(r) ? '#854d0e' : '#fde047'}; color: ${winningGoldSet.has(r) ? '#fff' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #fef08a; color: #854d0e; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: left;">Categoría</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">Aciertos Requeridos</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">Apuestas Ganadoras</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #a16207; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>🎯 TOTAL APUESTAS PREMIADAS EN ESTE BOLETO:</span>
                <span style="font-size: 1.1rem; color: #fef08a;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} apuesta(s)</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
        } else {
          combosHTML = `
            <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇺🇸 Mega Millions EE. UU. (${costData.totalBets} apuestas)</span>
              </div>
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #a16207; font-weight: bold; align-self: center;">+ MB:</span>
                  ${goldSuperset.map(r => `<div class="saved-combination-number" style="background: #eab308; color: white; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
        }
      } else if (ticket.gameId === 'euromillones') {
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

          combosHTML = `
            <div style="background: #fefce8; border: 1.5px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇪🇺 Euromillones (${costData.totalBets} apuestas)</span>
                <span style="background: #eab308; color: #000; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Desglose por Categorías</span>
              </div>

              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#2563eb' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">+ ⭐:</span>
                  ${starSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningStarSet.has(r) ? '#eab308' : '#fef08a'}; color: ${winningStarSet.has(r) ? '#000' : '#854d0e'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #fef08a; color: #713f12; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: left;">Categoría</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">Aciertos Requeridos</th>
                    <th style="padding: 6px 10px; border: 1px solid #fde047; text-align: center;">Apuestas Ganadoras</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #ca8a04; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>🎯 TOTAL APUESTAS PREMIADAS EN ESTE BOLETO:</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} apuesta(s)</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
        } else {
          combosHTML = `
            <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #854d0e; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🇪🇺 Euromillones (${costData.totalBets} apuestas)</span>
              </div>
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #d97706; font-weight: bold; align-self: center;">+ ⭐:</span>
                  ${starSuperset.map(r => `<div class="saved-combination-number" style="background: #eab308; color: #000; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
        }
      } else if (ticket.gameId === 'eurodreams') {
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

          combosHTML = `
            <div style="background: #f0f9ff; border: 1.5px solid #38bdf8; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #0369a1; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🌙 EuroDreams (${costData.totalBets} apuestas)</span>
                <span style="background: #38bdf8; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Desglose por Categorías</span>
              </div>

              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#0284c7' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                  ${dreamSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningDreamSet.has(r) ? '#38bdf8' : '#e0f2fe'}; color: ${winningDreamSet.has(r) ? '#fff' : '#0369a1'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #bae6fd; color: #0369a1; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: left;">Categoría</th>
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: center;">Aciertos Requeridos</th>
                    <th style="padding: 6px 10px; border: 1px solid #7dd3fc; text-align: center;">Apuestas Ganadoras</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #0284c7; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>🎯 TOTAL APUESTAS PREMIADAS EN ESTE BOLETO:</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} apuesta(s)</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
        } else {
          combosHTML = `
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #0369a1; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🌙 EuroDreams (${costData.totalBets} apuestas)</span>
              </div>
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #0284c7; font-weight: bold; align-self: center;">+ 🌙:</span>
                  ${dreamSuperset.map(r => `<div class="saved-combination-number" style="background: #38bdf8; color: #fff; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
        }
      } else if (ticket.gameId === 'gordo') {
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

          combosHTML = `
            <div style="background: #faf5ff; border: 1.5px solid #c084fc; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #6b21a8; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🔑 El Gordo de la Primitiva (${costData.totalBets} apuestas)</span>
                <span style="background: #a855f7; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Desglose por Categorías</span>
              </div>

              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? '#7e22ce' : '#f1f5f9'}; color: ${winningWhiteSet.has(n) ? '#fff' : '#1e293b'};">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">+ 🔑:</span>
                  ${claveSuperset.map(r => `<div class="saved-combination-number" style="background: ${winningClaveSet.has(r) ? '#a855f7' : '#f3e8ff'}; color: ${winningClaveSet.has(r) ? '#fff' : '#6b21a8'}; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>

              <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #e9d5ff; color: #6b21a8; font-size: 0.8rem;">
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: left;">Categoría</th>
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: center;">Aciertos Requeridos</th>
                    <th style="padding: 6px 10px; border: 1px solid #d8b4fe; text-align: center;">Apuestas Ganadoras</th>
                  </tr>
                </thead>
                <tbody>
                  ${tierRows}
                </tbody>
              </table>

              <div style="padding: 10px 12px; background: #7e22ce; color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
                <span>🎯 TOTAL APUESTAS PREMIADAS EN ESTE BOLETO:</span>
                <span style="font-size: 1.1rem; color: #fff;">${cascade.tiers.reduce((acc, t) => acc + t.count, 0)} apuesta(s)</span>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
        } else {
          combosHTML = `
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #6b21a8; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span>🔑 El Gordo de la Primitiva (${costData.totalBets} apuestas)</span>
              </div>
              <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
                  ${superset.map(n => `<div class="saved-combination-number" style="background: #f1f5f9; color: #1e293b;">${n}</div>`).join('')}
                  <span style="margin: 0 4px; color: #7e22ce; font-weight: bold; align-self: center;">+ 🔑:</span>
                  ${claveSuperset.map(r => `<div class="saved-combination-number" style="background: #a855f7; color: #fff; font-weight: bold;">${r}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
          actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
        }
      } else if (isSystemTicket) {
          // === VISUALIZACIÓN MÚLTIPLE ===
          const superset = ticket.combinations[0];
          let summaryTableHTML = '';
          let validationClass = '';
          let validationStatusBtn = `<button class="validate">Validar</button>`;
          let supersetDisplayClass = '';

          if (ticket.validation) {
             const winningNumbersSet = new Set(ticket.validation.winningNumbers);
             validationClass = 'verified';
             validationStatusBtn = `<button class="validate verified" disabled>Verificado</button>`;

             // Generate breakdown summary
             const explodedCombos = this.getCombinations(superset, 6);
             const breakdown = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
             explodedCombos.forEach(c => {
                 const hits = c.filter(n => winningNumbersSet.has(n)).length;
                 (breakdown as any)[hits]++;
             });
             
             const totalMatchesInSuperset = superset.filter(n => winningNumbersSet.has(n)).length;
             
             summaryTableHTML = `
                <div style="margin-top: 10px; font-weight: bold; color: var(--primary);">
                    🎯 ${totalMatchesInSuperset} aciertos sobre los ${superset.length} números seleccionados.
                </div>
                <table class="validation-summary-table">
                    <tr>
                        <th>Aciertos</th>
                        <th>Cantidad</th>
                    </tr>
                    <tr class="${breakdown[6] > 0 ? 'row-highlight' : ''}"><td>6 Aciertos</td><td>${breakdown[6]}</td></tr>
                    <tr class="${breakdown[5] > 0 ? 'row-highlight' : ''}"><td>5 Aciertos</td><td>${breakdown[5]}</td></tr>
                    <tr class="${breakdown[4] > 0 ? 'row-highlight' : ''}"><td>4 Aciertos</td><td>${breakdown[4]}</td></tr>
                    <tr class="${breakdown[3] > 0 ? 'row-highlight' : ''}"><td>3 Aciertos</td><td>${breakdown[3]}</td></tr>
                     <tr><td>0-2 Aciertos</td><td>${breakdown[0]+breakdown[1]+breakdown[2]}</td></tr>
                </table>
             `;
             
             // Highlight matching balls in the main display
             combosHTML = `
                <div class="system-badge">Múltiple de ${superset.length} - ${explodedCombos.length} apuestas</div>
                <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                    <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center;">
                        ${superset.map(n => `<div class="saved-combination-number ${winningNumbersSet.has(n) ? 'selected' : ''}">${n}</div>`).join('')}
                    </div>
                </div>
                ${summaryTableHTML}
             `;

          } else {
             // Not validated yet
              combosHTML = `
                <div class="system-badge">Múltiple de ${superset.length}</div>
                <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
                    <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center;">
                        ${superset.map(n => `<div class="saved-combination-number">${n}</div>`).join('')}
                    </div>
                </div>
             `;
          }
          
          actionsHTML = `${playOnlineHTML}${validationStatusBtn}`;

      } else {
          // === VISUALIZACIÓN ESTÁNDAR (SIMPLE / GANADORA) ===
          if (ticket.validation) {
            const winningNumbersSet = new Set(ticket.validation.winningNumbers);
            const winningStarsSet = new Set(ticket.validation.stars || []);
            
            combosHTML = ticket.combinations.map((combo, index) => {
                const hits = ticket.validation!.hits[index];
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
                return `<div class="saved-combination">
                            <div class="saved-combination-content">${comboHTML}</div>
                            <div class="hit-count ${hitClass}">${hits}${starHitsText} aciertos</div>
                        </div>`;
            }).join('');
            actionsHTML = `${playOnlineHTML}<button class="validate verified" disabled>Verificado</button>`;
          } else {
            combosHTML = ticket.combinations.map((combo, index) => {
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
                return `<div class="saved-combination"><div class="saved-combination-content">${comboHTML}</div></div>`;
            }).join('');
            actionsHTML = `${playOnlineHTML}<button class="validate">Validar</button>`;
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
        this.showToast(`✅ ${validatedCount} boleto(s) han sido validados automáticamente.`, 'success');
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
                    winningStarsLabel.innerHTML = '🔑 Introduce el Número Clave ganador (0-9):';
                    winningStarsInput.placeholder = 'Por ejemplo: 5';
                } else if (gameId === 'eurodreams') {
                    winningStarsLabel.innerHTML = '🌙 Introduce el Sueño ganador (1-5):';
                    winningStarsInput.placeholder = 'Por ejemplo: 3';
                } else {
                    winningStarsLabel.innerHTML = '⭐ Introduce las estrellas ganadoras (1-12):';
                    winningStarsInput.placeholder = 'Por ejemplo: 2 11';
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
        'Introduce un décimo de 5 cifras válido (ej: 35072 o 3 5 0 7 2).' : 
        `Introduce ${maxNumbers} números ganadores válidos.`;
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
            const starLabelName = gameId === 'gordo' ? 'clave válida (0-9)' : (gameId === 'eurodreams' ? 'sueño válido (1-5)' : `${maxStars} estrellas ganadoras válidas`);
            this.showToast(`Introduce una ${starLabelName}.`, 'error');
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
        this.showToast('Boleto validado manualmente.', 'success');
    } else {
        this.showToast('Error al encontrar el boleto para validar.', 'error');
    }
  }
  shareTicket() {
      if (!this.currentTicket) return;
      const text = `Mi boleto DataLotto:\n${this.currentTicket.combinations.map(c => c.join(' - ')).join('\n')}`;
      if (navigator.share) {
          navigator.share({ title: 'Mi Boleto DataLotto', text }).catch(console.error);
      } else {
          navigator.clipboard.writeText(text).then(() => this.showToast('Boleto copiado al portapapeles', 'success'));
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
        fecha: jackpotsMap[id]?.fecha || "Próximo sorteo"
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
          Conectando con Google Sheets y calculando esperanza matemática...
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
          isFallback = result.isFallback || false;
        } else {
          throw new Error('API return structure invalid');
        }
      } catch (apiErr) {
        console.warn('API jackpots endpoint unreachable, attempting direct Google Sheets fetch:', apiErr);
        jackpots = await this.parseJackpotsCsvDirectly();
      }
      
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
        
        let rating = '⚠️ Estándar';
        let badgeClass = 'background-color: #f1f5f9; color: #475569;';
        
        if (gameId === 'powerball' || gameId === 'megamillions') {
          if (jk.bote >= 200000000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 100000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'bonoloto') {
          if (jk.bote >= 2000000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 1000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'primitiva') {
          if (jk.bote >= 25000000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 10000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'gordo') {
          if (jk.bote >= 12000000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 7000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'euromillones') {
          if (jk.bote >= 100000000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 50000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else if (gameId === 'eurodreams') {
          if (jk.bote >= 7200000) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (jk.bote >= 4000000) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
        } else {
          if (scoreFriendly >= 0.5) { rating = '🌟 Excelente'; badgeClass = 'background-color: #fef3c7; color: #d97706; font-weight: bold;'; }
          else if (scoreFriendly >= 0.2) { rating = '✅ Buena'; badgeClass = 'background-color: #dcfce7; color: #15803d;'; }
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
        const currentTag = isCurrentGame ? ' <span style="font-size: 0.7rem; background: #0284c7; color: white; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">Activo</span>' : '';
        
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
        
        if (bestNameEl) bestNameEl.innerHTML = `${this.getGameFlag(best.id)} ¡Jugar a ${best.juego}!`;
        if (bestReasonEl) {
          const bestBoteFormatted = best.id === 'powerball'
            ? '$' + best.bote.toLocaleString('en-US')
            : best.bote.toLocaleString('es-ES') + ' €';
          bestReasonEl.innerHTML = `Con un bote de <strong>${bestBoteFormatted}</strong>, es el sorteo con mayor esperanza matemática de retorno actual (Índice de Retorno de <strong>${best.score}</strong>). ¡Prepara tus combinaciones optimizadas para el <strong>${best.fecha}</strong>!`;
        }
      }

      // Check for high jackpot alert banner
      this.checkHighJackpotAlert(ratedJackpots);
      
      if (isFallback) {
        this.showToast('ℹ️ Mostrando botes estimados por defecto.', 'info');
      } else {
        this.showToast('📈 Botes actualizados de los juegos de Lotería.', 'success');
      }
      
    } catch (err: any) {
      console.error('Error fetching jackpots:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 30px; text-align: center; color: #ef4444;">
            ❌ Error de conexión al leer los botes: ${err.message || err}<br>
            <button class="modal-btn" id="jackpotsRetryBtn" style="margin-top:10px; background: #ef4444; color:white; border:none; padding: 4px 10px; border-radius:4px; cursor:pointer;">Reintentar</button>
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
    this.showToast('✅ Preferencias de Recordatorios guardadas correctamente', 'success');

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
      const dayNamesInSpanish = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const currentDayName = dayNamesInSpanish[currentDay];

      const drawLines = activeGamesToday.map(g => `• ${g.flag} ${g.fullName}`).join('\n');

      const notifTitle = `🗓️ ¡Sorteos que se celebran hoy (${currentDayName} ${day}/${month})!`;
      const notifBody = `${drawLines}\n\nPrepara y valida tus combinaciones en DataLotto.`;

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

    const highJk = jackpots.find((j: any) => j.bote >= 100000000 || j.rating === '🌟 Excelente') || jackpots[0];

    if (highJk && (highJk.bote >= 50000000 || highJk.rating === '🌟 Excelente')) {
      const banner = document.getElementById('highJackpotBannerContainer');
      const titleEl = document.getElementById('highJackpotTitle');
      const descEl = document.getElementById('highJackpotDesc');
      const playBtn = document.getElementById('highJackpotPlayBtn');
      const closeBtn = document.getElementById('highJackpotCloseBtn');

      if (banner && titleEl && descEl && playBtn) {
        const formattedBote = (highJk.bote / 1000000).toFixed(0) + 'M€';
        titleEl.textContent = `🔥 ¡BOTE DESTACADO EN ${highJk.juego.toUpperCase()}! (${formattedBote})`;
        descEl.textContent = `Bote acumulado de ${highJk.bote.toLocaleString('es-ES')} €. Indicador de Esperanza Matemática: ${highJk.rating} (${highJk.score}).`;
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

        // Auto-close notification banner after 2 minutes (120,000 ms)
        (this as any).highJackpotTimer = setTimeout(() => {
          closeBanner();
        }, 120000);

        playBtn.onclick = () => {
          this.switchGame(highJk.id);
          closeBanner();
        };

        if (closeBtn) {
          closeBtn.onclick = () => {
            closeBanner();
          };
        }
      }

      const config = this.getNotificationSettings();
      const todayStr = new Date().toISOString().split('T')[0];
      if (config.enabled && config.lastJackpotAlertDate !== todayStr && highJk.bote >= 100000000) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🔥 ¡Bote Alto en ${highJk.juego}: ${(highJk.bote/1e6).toFixed(0)}M€!`, {
            body: 'DataLotto ha detectado una alta esperanza matemática. ¡Genera tu combinación inteligente!',
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
        this.showToast('No hay combinaciones para jugar.', 'warning');
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
            this.showToast('🌐 Web abierta. ¡Combinaciones copiadas!', 'success');
        })
        .catch(err => {
            console.error('Error al copiar al portapapeles:', err);
            this.showToast('Error al copiar las combinaciones.', 'error');
        });
  }

  exportTickets() {
    if (this.savedTickets.length === 0) {
        this.showToast('No hay boletos para exportar.', 'warning');
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
        this.showToast('✅ Boletos exportados correctamente.', 'success');
    } catch (error) {
        this.showToast('Error al exportar los boletos.', 'error');
        console.error('Export error:', error);
    }
  }


  // ===== HELPERS UI & GEOMETRIC/AI =====
  hasGeometricPattern(combination: number[], patternsToExclude: string[]): boolean {
      return hasGeometricPattern(combination, patternsToExclude, this.currentGame?.gridCols || 10);
  }
  isSpaced(combination: number[]): boolean {
      return isSpaced(combination, this.currentGame?.gridCols || 10);
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
            ${isError ? `<button id="copyToastBtn" style="background: rgba(255,255,255,0.2); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem;">Copiar</button>` : ''}
            <button id="closeToastBtn" style="background: rgba(255,255,255,0.25); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem;">Cerrar</button>
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
            label.textContent = `URL ${gameName}:`;
            
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
    
    this.saveState();
    this.toggleModal('configUrlsModal', false);
    this.showToast('✅ Enlaces guardados correctamente.', 'success');
  }

  openContactModal() {
    this.closeSidebar();
    const messageInput = document.getElementById('contactMessage') as HTMLTextAreaElement;
    const emailInput = document.getElementById('contactEmail') as HTMLInputElement;
    if (messageInput) messageInput.value = '';
    if (emailInput) emailInput.value = '';
    this.toggleModal('contactModal', true);
  }

  async sendContactForm() {
    const messageInput = document.getElementById('contactMessage') as HTMLTextAreaElement;
    const emailInput = document.getElementById('contactEmail') as HTMLInputElement;
    const message = messageInput?.value.trim();
    const email = emailInput?.value.trim();

    if (!message) {
      this.showToast('Por favor, escribe un mensaje.', 'warning');
      return;
    }

    const sendBtn = document.getElementById('sendContactBtn') as HTMLButtonElement;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Enviando...';
    }

    try {
      const response = await fetch(this.getApiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email })
      });

      const data = await response.json();

      if (response.ok) {
        this.showToast('✅ Mensaje enviado correctamente.', 'success');
        this.toggleModal('contactModal', false);
      } else {
        throw new Error(data.error || 'Error al enviar');
      }
    } catch (error: any) {
      console.error('Error enviando contacto:', error);
      const errMsg = error?.message || 'Error al enviar el mensaje. Inténtalo de nuevo.';
      this.showToast(`❌ ${errMsg}`, 'error');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
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

  // ===== NEW FEATURES =====

  renderFrequencyChart() {
    const container = document.getElementById('frequencyChartContainer');
    const summary = document.getElementById('dataVizSummary');
    const targetSelectorContainer = document.getElementById('vizTargetSelectorContainer');

    if (!container) return;
    container.innerHTML = '';

    if (!this.dataLoaded || this.historicalData.length === 0) {
        container.innerHTML = '<div style="color:#666; text-align: center; width: 100%; padding-top: 50px;">Carga datos para ver el gráfico.</div>';
        if (summary) {
            summary.innerHTML = '<div style="color:#666; text-align: center; width: 100%;">Carga datos para ver el resumen estadístico.</div>';
        }
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
                    starOption.textContent = '🔑 Clave (0-9)';
                } else if (this.currentGame.id === 'eurodreams') {
                    starOption.textContent = '🌙 Sueños';
                } else if (this.currentGame.id === 'powerball') {
                    starOption.textContent = '🔴 Bolas Especiales';
                } else if (this.currentGame.id === 'megamillions') {
                    starOption.textContent = '🟡 Mega Ball';
                } else {
                    starOption.textContent = '⭐ Estrellas';
                }
            }
        }
    } else {
        if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
        this.vizTarget = 'number';
        const select = document.getElementById('vizTargetSelect') as HTMLSelectElement;
        if (select) select.value = 'number';
    }

    const isNacional = this.currentGame.id === 'nacional';
    const isGordo = this.currentGame.id === 'gordo';

    const N = this.vizTarget === 'star'
        ? this.historicalData.filter(d => d.stars && d.stars.length > 0).length
        : this.historicalData.filter(d => d.numbers && d.numbers.length > 0).length;
    
    // Calculate frequencies for numbers
    const frequencies: { [key: number]: number } = {};
    const startNum = isNacional ? 10 : 1;
    for (let i = startNum; i <= this.currentGame.numberRange; i++) frequencies[i] = 0;
    
    this.historicalData.forEach(draw => {
        draw.numbers.forEach(num => {
            if (frequencies[num] !== undefined) frequencies[num]++;
        });
    });

    // Calculate frequencies for stars
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

    // Determine current active metrics
    let activeFreqs: { [key: number]: number } = {};
    let minKey = 1;
    let maxKey = 1;
    let prob = 0;

    if (isNacional) {
        activeFreqs = frequencies;
        minKey = 10;
        maxKey = 59;
        prob = 0.1; // 1/10
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
                "1ª Cifra",
                "2ª Cifra",
                "3ª Cifra",
                "4ª Cifra",
                "5ª Cifra"
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
                    🔥 <strong>Más frecuente:</strong> <span style="color: #ef4444; font-weight: bold;">${maxFreqStr}</span> (${maxActualFreq} veces)
                </div>
                <div style="flex: 1; min-width: 220px;">
                    ❄️ <strong>Menos frecuente:</strong> <span style="color: #3b82f6; font-weight: bold;">${minFreqStr}</span> (${minActualFreq} veces)
                </div>
                <div style="flex: 1; min-width: 250px; text-align: right;" class="mean-indicator">
                    📈 <strong>Media esperada:</strong> <span style="color: #10b981; font-weight: bold;">${mean.toFixed(2)}</span>
                    <span style="color: #64748b; font-size: 0.85rem; margin-left: 5px;">(±${sd.toFixed(2)} desv. est.)</span>
                </div>
            </div>
        `;
    }

    if (this.vizMode === 'heatmap') {
        if (isNacional) {
            const columnsLabels = [
                "1ª Cifra (Decena de millar)",
                "2ª Cifra (Unidad de millar)",
                "3ª Cifra (Centena)",
                "4ª Cifra (Decena)",
                "5ª Cifra (Unidad)"
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
                        <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="Cifra ${digit}: ${freq} veces (z-score: ${z.toFixed(2)})">
                            <span style="font-size: 1.1rem; font-weight: bold;">${digit}</span>
                            <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${freq}v</span>
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
                const titleTypeName = this.vizTarget === 'star' ? (isGordo ? 'Clave' : 'Estrella') : 'Número';
                
                html += `
                    <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="${titleTypeName} ${i}: ${freq} veces (z-score: ${z.toFixed(2)})">
                        <span style="font-size: 1.1rem; font-weight: bold;">${labelStr}</span>
                        <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${freq}v</span>
                    </div>
                `;
            }
            
            html += `</div>`;
            
            html += `
                <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #f1f5f9; font-size: 0.8rem; color: #64748b; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(59, 130, 246, 0.4); border: 1px solid rgba(37, 99, 235, 0.4); border-radius: 3px;"></div>
                        <span>Frío (Por debajo de la media)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(226, 232, 240, 0.4); border: 1px solid #cbd5e1; border-radius: 3px;"></div>
                        <span>Neutro / En la media</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 14px; height: 14px; background: rgba(239, 68, 68, 0.4); border: 1px solid rgba(220, 38, 38, 0.4); border-radius: 3px;"></div>
                        <span>Caliente (Por encima de la media)</span>
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
                        <span style="position: absolute; top: -20px; transform: translateX(-50%); font-size: 0.7rem; font-weight: bold; color: #10b981; background: #ffffff; padding: 0 4px; border-radius: 4px; border: 1px solid #10b981; white-space: nowrap;">Media: ${mean.toFixed(1)}</span>
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
                        <span style="position: absolute; left: 8px; font-size: 0.8rem; font-weight: 700; color: ${barWidth > 12 ? '#ffffff' : 'var(--dark)'}; text-shadow: ${barWidth > 12 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'};">${item.freq} veces</span>
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
          lastDrawsContainer.innerHTML = '<div style="color: #999; font-style: italic;">Datos insuficientes (mínimo 2 sorteos)</div>';
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
                  extraHtml += `<div class="mini-ball complementario-ball" title="Complementario">C${draw.complementario}</div>`;
              }
              if (draw.reintegro !== undefined) {
                  extraHtml += `<div class="mini-ball reintegro-ball" title="Reintegro">R${draw.reintegro}</div>`;
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
          renderMiniDraw(drawN, 'Último') + 
          renderMiniDraw(drawNminus1, 'Anterior');

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
              const positionalName = this.currentGame.id === 'nacional' ? ` (Cifra ${Math.floor(n / 10)}ª)` : '';
              return `<div class="${className}" title="Frecuencia: ${dayFrequencies[n]}${positionalName}">${displayVal}</div>`;
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
          dayTopContainer.innerHTML = '<span style="font-size: 0.8rem; color: #999;">Sin datos para este día.</span>';
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
                    🎯 <strong>Tu Selección vs Último:</strong> ${hits} nº + ${starHits} ⭐
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
                    🎟️ <strong>Tus Boletos vs Último:</strong> ${totalHits} aciertos + ${totalStarHits} ⭐
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
              ? intersection.map(n => `${n % 10} (Cifra ${Math.floor(n / 10)}ª)`)
              : intersection;
          alertsContainer.innerHTML += `
            <div class="bd-alert warning">
                ⚠️ Doble repetición detectada (${displayIntersection.join(', ')}). Probabilidad rebote muy baja (0.8%).
            </div>
          `;
      }
      
      // Check absence warning (if hot number is absent for long)
      const superHot = Array.from(this.hotNumbers).find(n => (this.numberStats[n].lastSeen < this.historicalData.length - 10));
      if (superHot) {
           alertsContainer.innerHTML += `
            <div class="bd-alert info">
                💡 El "Caliente" ${superHot} lleva tiempo sin salir. ¿Oportunidad?
            </div>
          `;
      }
      
      // General advice based on N
      const repeatedInLast = drawN.numbers.filter(n => this.hotNumbers.has(n)).length;
      if (repeatedInLast > 3) {
           alertsContainer.innerHTML += `
            <div class="bd-alert success">
                🔥 El último sorteo fue muy "caliente". El próximo tiende a enfriar.
            </div>
          `;
      }
  }

  applyBigDataStrategy(type: string) {
      if (this.historicalData.length < 2) {
          this.showToast('Datos insuficientes para análisis Big Data.', 'warning');
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
          this.showToast('Sugerencia Conservadora: 0 repeticiones.', 'info');

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
           this.showToast('Sugerencia Balanceada: 1 repetición óptima.', 'info');

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
           this.showToast('Sugerencia Riesgo: 2 repeticiones.', 'warning');
      }

      this.suggestedNumbers = new Set(suggestions);
      this.updateGridNumberStates();
      
      // Scroll to grid
      document.getElementById('numbersGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showFiltersDashboard() {
    this.closeSidebar();
    const mainApp = document.getElementById('mainAppContainer');
    const filtersDashboard = document.getElementById('filtersDashboardContainer');
    const peniaPage = document.getElementById('peniaPageContainer');
    if (mainApp && filtersDashboard) {
        mainApp.style.display = 'none';
        filtersDashboard.style.display = 'block';
        if (peniaPage) peniaPage.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Update sidebar active state
        document.querySelectorAll('.sidebar-links li').forEach(li => li.classList.remove('active'));
        document.getElementById('filtersDashboardBtn')?.parentElement?.classList.add('active');
    }
  }

  showMainApp() {
    const mainApp = document.getElementById('mainAppContainer');
    const filtersDashboard = document.getElementById('filtersDashboardContainer');
    const peniaPage = document.getElementById('peniaPageContainer');
    if (mainApp) {
        mainApp.style.display = 'block';
        if (filtersDashboard) filtersDashboard.style.display = 'none';
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
    const filtersDashboard = document.getElementById('filtersDashboardContainer');
    const peniaPage = document.getElementById('peniaPageContainer');
    if (mainApp && peniaPage) {
        mainApp.style.display = 'none';
        if (filtersDashboard) filtersDashboard.style.display = 'none';
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
            extraHeader.textContent = 'Estrellas ⭐';
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'eurodreams') {
            extraHeader.textContent = 'Sueño 🌙';
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'gordo') {
            extraHeader.textContent = 'Clave 🔑';
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'powerball') {
            extraHeader.textContent = 'Bola Especial 🔴';
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'megamillions') {
            extraHeader.textContent = 'Mega Ball 🟡';
            extraHeader.style.display = '';
        } else if (this.currentGame.id === 'bonoloto' || this.currentGame.id === 'primitiva') {
            extraHeader.textContent = 'Comp. / Reint.';
            extraHeader.style.display = '';
        } else {
            extraHeader.textContent = 'Reintegro R';
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
                    const dateStr = draw.date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase();
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
        if (infoEl) infoEl.textContent = 'Mostrando 0 sorteos';
        const pageEl = document.getElementById('officialDrawsCurrentPage');
        if (pageEl) pageEl.textContent = 'Pág. 1 de 1';
        
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
        infoEl.textContent = `Mostrando sorteos ${startIndex + 1} a ${endIndex} de ${totalItems}`;
    }
    const pageEl = document.getElementById('officialDrawsCurrentPage');
    if (pageEl) {
        pageEl.textContent = `Pág. ${this.officialDrawsPage} de ${totalPages}`;
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
        const rawDateStr = draw.date.toLocaleDateString('es-ES', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
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
                compDiv.title = 'Complementario';
                compDiv.textContent = `C${draw.complementario}`;
                extraContainer.appendChild(compDiv);
            }
            if (draw.reintegro !== undefined) {
                const reDiv = document.createElement('div');
                reDiv.className = 'mini-ball reintegro-ball';
                reDiv.title = 'Reintegro';
                reDiv.textContent = `R${draw.reintegro}`;
                extraContainer.appendChild(reDiv);
            }
        } else if (this.currentGame.id === 'nacional') {
            if (draw.reintegro !== undefined) {
                const reDiv = document.createElement('div');
                reDiv.className = 'mini-ball reintegro-ball';
                reDiv.title = 'Reintegro';
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
            let bestText = `${maxHit} aciertos`;
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
                '6': '🏆 6 Aciertos',
                '5': '⭐ 5 Aciertos',
                '4': '✨ 4 Aciertos',
                '3': '🧩 3 Aciertos',
                '<=2': '🎯 2 o menos Aciertos'
            };

            activeTiers.forEach(tier => {
                const count = actualHitCounts[tier] || 0;
                const actualFrequency = (count / validatedCombinations) * 100;
                const theoreticalFrequency = getTheoreticalProb(tier);

                let perfBadge = '';
                if (count === 0 && theoreticalFrequency === 0) {
                    perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">Sin datos</span>`;
                } else if (actualFrequency > theoreticalFrequency) {
                    const timesBetter = theoreticalFrequency > 0 ? (actualFrequency / theoreticalFrequency).toFixed(1) : 'N/A';
                    const percentBetter = theoreticalFrequency > 0 ? (((actualFrequency - theoreticalFrequency) / theoreticalFrequency) * 100).toFixed(0) : '0';
                    perfBadge = `<span style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">🚀 ${timesBetter}x superior (+${percentBetter}%)</span>`;
                } else if (actualFrequency === theoreticalFrequency) {
                    perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">Esperado</span>`;
                } else {
                    const timesWorse = actualFrequency > 0 && theoreticalFrequency > 0 ? (theoreticalFrequency / actualFrequency).toFixed(1) : '∞';
                    perfBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">📉 ${actualFrequency > 0 ? timesWorse + 'x inferior' : '0 aciertos'}</span>`;
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
    const strategyMap: { [key: string]: string } = { simple: 'Simple', winning: 'Estrategia Ganadora', multiple: 'Múltiple' };

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
                        <div style="font-size: 0.8rem; color: #6b7280;">Apuestas generadas: ${data.total} | Validadas: ${data.validated}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.8rem; color: #4b5563; font-weight: 500;">Mejor resultado:</div>
                        <span style="background: #eff6ff; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">${data.validated > 0 ? data.maxHits + ' aciertos' : 'Sin datos'}</span>
                    </div>
                </div>
            `;
        });
        if (!stratHtml) {
            stratHtml = '<div style="color: #6b7280; font-style: italic; text-align: center; padding: 10px;">No hay combinaciones registradas para este juego</div>';
        }
        elStrategyDist.innerHTML = stratHtml;
    }
  }

  handleDashboardFilterClick(element: HTMLElement) {
    const filterGroup = element.dataset.filter!;
    const filterValue = element.dataset.value!;
    const filterKey = `${filterGroup}:${filterValue}`;
    
    if (this.activeDashboardFilters.has(filterKey)) {
        this.activeDashboardFilters.delete(filterKey);
        element.classList.remove('selected');
    } else {
        this.activeDashboardFilters.add(filterKey);
        element.classList.add('selected');
    }

    this.updateDashboardResults();
  }

  clearDashboardFilters() {
    this.activeDashboardFilters.clear();
    document.querySelectorAll('.db-filter-option').forEach(opt => opt.classList.remove('selected'));
    this.updateDashboardResults();
  }

  updateDashboardResults() {
    const activeFiltersContainer = document.getElementById('dbActiveFiltersContainer');
    if (activeFiltersContainer) {
        activeFiltersContainer.innerHTML = '';
        if (this.activeDashboardFilters.size === 0) {
            activeFiltersContainer.innerHTML = '<span style="color: #666; font-style: italic;">Ningún filtro seleccionado</span>';
        } else {
            this.activeDashboardFilters.forEach(filterKey => {
                const [group, value] = filterKey.split(':');
                const tag = document.createElement('span');
                tag.className = 'db-active-filter-tag';
                tag.textContent = `${group.toUpperCase()}: ${value}`;
                activeFiltersContainer.appendChild(tag);
            });
        }
    }

    // Calculate impact (simplified statistical model for the dashboard)
    let totalCombinations = 13983816;
    let successRate = 100;

    // Filter probabilities (approximate for 6/49)
    const filterProbabilities: Record<string, number> = {
        'suma:21-80': 0.006, 'suma:81-120': 0.13, 'suma:121-140': 0.20, 'suma:141-169': 0.32, 'suma:170-190': 0.20, 'suma:191-230': 0.13, 'suma:231-279': 0.014,
        'parImpar:6/0': 0.0096, 'parImpar:5/1': 0.2407, 'parImpar:4/2': 0.4349, 'parImpar:3/3': 0.2898, 'parImpar:2/4': 0.0217, 'parImpar:1/5': 0.0035, 'parImpar:0/6': 0.0127,
        'bajosAltos:6/0': 0.0127, 'bajosAltos:5/1': 0.0760, 'bajosAltos:4/2': 0.2304, 'bajosAltos:3/3': 0.3302, 'bajosAltos:2/4': 0.2304, 'bajosAltos:1/5': 0.0760, 'bajosAltos:0/6': 0.0096,
        'primos:0': 0.1975, 'primos:1': 0.3950, 'primos:2': 0.2963, 'primos:3': 0.0987, 'primos:4': 0.0118, 'primos:5': 0.0006, 'primos:6': 0.0004,
        'consecutivos:sin-consecutivos': 0.4362, 'consecutivos:1-par': 0.4110, 'consecutivos:2-pares': 0.1313, 'consecutivos:3-seguidos': 0.0185, 'consecutivos:4-seguidos': 0.0030,
        'decenas:2/2/1/1': 0.3866, 'decenas:2/1/1/1/1': 0.3093, 'decenas:3/2/1': 0.1547, 'decenas:2/2/2': 0.0773, 'decenas:otros': 0.0721
    };

    // Group active filters by category
    const groupedFilters: Record<string, string[]> = {};
    this.activeDashboardFilters.forEach(filterKey => {
        const [group, value] = filterKey.split(':');
        if (!groupedFilters[group]) groupedFilters[group] = [];
        groupedFilters[group].push(value);
    });

    // Apply probabilities group by group
    // If multiple options in a group are selected, sum their probabilities
    Object.keys(groupedFilters).forEach(group => {
        const selectedValues = groupedFilters[group];
        let groupProb = 0;
        selectedValues.forEach(val => {
            groupProb += filterProbabilities[`${group}:${val}`] || 0;
        });
        
        // If no options were selected in this group (shouldn't happen due to logic above), prob is 1
        // If some were selected, multiply the overall success rate
        if (groupProb > 0) {
            successRate = successRate * groupProb;
        }
    });

    const currentCombinations = Math.floor(totalCombinations * (successRate / 100));

    // Update UI
    const successRateEl = document.getElementById('dbSuccessRate');
    const combinationsCountEl = document.getElementById('dbCombinationsCount');
    const progressBarEl = document.getElementById('dbProgressBar');
    const probValueEl = document.getElementById('dbProbValue');
    const filterCountEl = document.getElementById('dbFilterCount');
    const reductionValueEl = document.getElementById('dbReductionValue');

    if (successRateEl) successRateEl.textContent = `${successRate.toFixed(2)}%`;
    if (combinationsCountEl) combinationsCountEl.textContent = `${currentCombinations.toLocaleString()} combinaciones`;
    if (progressBarEl) {
        progressBarEl.style.width = `${successRate}%`;
        progressBarEl.textContent = `${successRate.toFixed(1)}%`;
    }
    if (probValueEl) {
        if (successRate > 0) {
            probValueEl.textContent = `1 entre ${Math.floor(100 / successRate)}`;
        } else {
            probValueEl.textContent = "Casi imposible";
        }
    }
    if (filterCountEl) filterCountEl.textContent = String(this.activeDashboardFilters.size);
    
    const reduction = ((totalCombinations - currentCombinations) / totalCombinations * 100).toFixed(2);
    if (reductionValueEl) reductionValueEl.textContent = `${reduction}%`;

    // Strategy Advice
    const strategyAdviceEl = document.getElementById('dbStrategyAdvice');
    if (strategyAdviceEl) {
        if (successRate > 40) {
            strategyAdviceEl.textContent = "Estrategia de alta cobertura. Ideal para apuestas múltiples con alta probabilidad de premios menores.";
        } else if (successRate > 15) {
            strategyAdviceEl.textContent = "Estrategia equilibrada. Filtros optimizados para capturar el núcleo estadístico del sorteo.";
        } else {
            strategyAdviceEl.textContent = "Estrategia de alta precisión. Gran reducción de combinaciones, enfocada en patrones de alta rentabilidad.";
        }
    }
  }

  switchDashboardTab(tabId: string) {
    document.querySelectorAll('.db-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.db-tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`.db-tab[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
  }

  // ============================================
  // MATHEMATICAL FILTERS & OPTIMIZATION
  // ============================================

  // ===== OPTIMIZACIÓN MATEMÁTICA DE FILTROS =====
  applyAiFilters() {
    if (!this.dataLoaded || this.historicalData.length === 0) {
      this.showToast('Carga primero datos históricos para optimizar los filtros matemáticamente.', 'warning');
      return;
    }

    const sampleSize = Math.min(100, this.historicalData.length);
    const sampleDraws = this.historicalData.slice(-sampleSize);
    const recentDraws3 = sampleDraws.slice(-3);
    const recentDraws5 = sampleDraws.slice(-5);
    const game = this.currentGame;
    const maxNumbers = game.maxNumbers;

    // 1. Exclusión de números individuales por sobre-frecuencia/saturación en últimos sorteos
    this.excludedNumbers.clear();
    this.excludedStars.clear();

    const recentNumCounts: { [n: number]: number } = {};
    recentDraws5.forEach(d => {
      d.numbers.forEach(n => {
        recentNumCounts[n] = (recentNumCounts[n] || 0) + 1;
      });
    });

    const excludedRecentNums: number[] = [];
    const startNum = game.id === 'nacional' ? 10 : 1;
    for (let num = startNum; num <= game.numberRange; num++) {
      const count5 = recentNumCounts[num] || 0;
      const count3 = recentDraws3.filter(d => d.numbers.includes(num)).length;
      // Excluir si ha salido 2+ veces en los últimos 3 sorteos, o 3+ veces en los últimos 5
      if (count3 >= 2 || count5 >= 3) {
        this.excludedNumbers.add(num);
        excludedRecentNums.push(num);
      }
    }

    // Para estrellas si aplica
    const excludedRecentStars: number[] = [];
    if (game.maxStars > 0) {
      const recentStarCounts: { [s: number]: number } = {};
      recentDraws5.forEach(d => {
        if (d.stars) {
          d.stars.forEach(s => {
            recentStarCounts[s] = (recentStarCounts[s] || 0) + 1;
          });
        }
      });
      for (let star = 1; star <= game.starRange; star++) {
        const count5 = recentStarCounts[star] || 0;
        const count3 = recentDraws3.filter(d => d.stars && d.stars.includes(star)).length;
        if (count3 >= 2 || count5 >= 3) {
          this.excludedStars.add(star);
          excludedRecentStars.push(star);
        }
      }
    }

    // Actualizar la cuadrícula del tablero con las exclusiones (ícono 🚫)
    this.updateGridNumberStates();

    // 2. Análisis de Suma Total (Media y Desviación Estándar)
    const sums = sampleDraws.map(d => d.numbers.reduce((a, b) => a + b, 0));
    const meanSum = sums.reduce((a, b) => a + b, 0) / sampleSize;
    const stdSum = Math.sqrt(sums.reduce((sq, n) => sq + Math.pow(n - meanSum, 2), 0) / sampleSize);
    
    // Intervalo de confianza ~90% (1.645 desviaciones estándar)
    let calcSumMin = Math.max(1, Math.floor(meanSum - 1.645 * stdSum));
    let calcSumMax = Math.ceil(meanSum + 1.645 * stdSum);

    const sumMinEl = document.getElementById('sumMin') as HTMLInputElement;
    const sumMaxEl = document.getElementById('sumMax') as HTMLInputElement;
    if (sumMinEl) sumMinEl.value = String(calcSumMin);
    if (sumMaxEl) sumMaxEl.value = String(calcSumMax);

    // 3. Análisis de Terminaciones (Dígitos 0-9) y Saturación en Últimos Sorteos
    const termCounts: { [d: number]: number } = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0};
    const recentTermCounts3: { [d: number]: number } = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0};
    let totalNumbersDrawn = 0;

    sampleDraws.forEach(d => {
      d.numbers.forEach(n => {
        const lastDigit = n % 10;
        termCounts[lastDigit] = (termCounts[lastDigit] || 0) + 1;
        totalNumbersDrawn++;
      });
    });

    recentDraws3.forEach(d => {
      d.numbers.forEach(n => {
        const lastDigit = n % 10;
        recentTermCounts3[lastDigit] = (recentTermCounts3[lastDigit] || 0) + 1;
      });
    });

    const expectedPerTerm = totalNumbersDrawn / 10;
    const excludedTerminaciones: number[] = [];
    const excludedTermReasons: { [digit: number]: string } = {};

    const termChips = document.querySelectorAll('#terminacionesOptions .filter-chip');
    termChips.forEach(chip => {
      const val = parseInt((chip as HTMLElement).dataset.value || '-1');
      if (val >= 0 && val <= 9) {
        const countSample = termCounts[val] || 0;
        const countRecent3 = recentTermCounts3[val] || 0;
        
        const isLowFreq = countSample < expectedPerTerm * 0.55;
        const isSaturated = countRecent3 >= 4;

        if (isLowFreq || isSaturated) {
          chip.classList.add('active'); // Chip activo en Excluir Terminaciones indica que está excluida
          excludedTerminaciones.push(val);
          if (isSaturated) excludedTermReasons[val] = `Saturación en últimos 3 sorteos (${countRecent3}x)`;
          else excludedTermReasons[val] = 'Baja frecuencia histórica';
        } else {
          chip.classList.remove('active');
        }
      }
    });

    // 4. Variedad de Terminaciones (Cantidad de dígitos finales distintos)
    const distinctTermCounts: { [val: number]: number } = {};
    sampleDraws.forEach(d => {
      const distinctSize = new Set(d.numbers.map(n => n % 10)).size;
      distinctTermCounts[distinctSize] = (distinctTermCounts[distinctSize] || 0) + 1;
    });

    const recentDistinct3 = recentDraws3.map(d => new Set(d.numbers.map(n => n % 10)).size);

    const activeDistinctTerms: number[] = [];
    document.querySelectorAll('#terminacionesDistintasOptions .filter-chip').forEach(chip => {
      const val = parseInt((chip as HTMLElement).dataset.value || '0', 10);
      const count = distinctTermCounts[val] || 0;
      const countInRecent = recentDistinct3.filter(v => v === val).length;
      const isSaturatedRecent = countInRecent === 3;

      if (count / sampleSize >= 0.04 && !isSaturatedRecent) {
        chip.classList.add('active');
        activeDistinctTerms.push(val);
      } else {
        chip.classList.remove('active');
      }
    });

    if (activeDistinctTerms.length === 0) {
      const bestDistinct = Object.entries(distinctTermCounts).sort((a, b) => b[1] - a[1])[0];
      if (bestDistinct) {
        const chip = document.querySelector(`#terminacionesDistintasOptions .filter-chip[data-value="${bestDistinct[0]}"]`);
        if (chip) {
          chip.classList.add('active');
          activeDistinctTerms.push(Number(bestDistinct[0]));
        }
      }
    }

    // 5. Par / Impar y Bajos / Altos (Análisis de Rachas y Selección Óptima de Chips)
    const parImparCounts: { [key: string]: number } = {};
    const bajosAltosCounts: { [key: string]: number } = {};
    const midPoint = Math.floor(game.numberRange / 2);

    sampleDraws.forEach(d => {
      const evens = d.numbers.filter(n => n % 2 === 0).length;
      const odds = d.numbers.length - evens;
      const keyPI = `${evens}/${odds}`;
      parImparCounts[keyPI] = (parImparCounts[keyPI] || 0) + 1;

      const lows = d.numbers.filter(n => n <= midPoint).length;
      const highs = d.numbers.length - lows;
      const keyBA = `${lows}/${highs}`;
      bajosAltosCounts[keyBA] = (bajosAltosCounts[keyBA] || 0) + 1;
    });

    const recentParImpar3 = recentDraws3.map(d => {
      const evens = d.numbers.filter(n => n % 2 === 0).length;
      return `${evens}/${d.numbers.length - evens}`;
    });

    const recentBajosAltos3 = recentDraws3.map(d => {
      const lows = d.numbers.filter(n => n <= midPoint).length;
      return `${lows}/${d.numbers.length - lows}`;
    });

    const selectedParImpar: string[] = [];
    const disabledParImparSaturated: string[] = [];
    document.querySelectorAll('#parImparOptions .filter-chip').forEach(chip => {
      const val = (chip as HTMLElement).dataset.value || '';
      const count = parImparCounts[val] || 0;
      const freq = count / sampleSize;

      const recentRepeat = recentParImpar3.filter(k => k === val).length;
      const isSaturatedRacha = recentRepeat >= 2 && freq < 0.65;

      if (freq >= 0.05 && !isSaturatedRacha) {
        chip.classList.add('active');
        selectedParImpar.push(val);
      } else {
        chip.classList.remove('active');
        if (isSaturatedRacha) disabledParImparSaturated.push(val);
      }
    });

    if (selectedParImpar.length === 0) {
      const topPI = Object.entries(parImparCounts).sort((a, b) => b[1] - a[1])[0];
      if (topPI) {
        const chip = document.querySelector(`#parImparOptions .filter-chip[data-value="${topPI[0]}"]`);
        if (chip) {
          chip.classList.add('active');
          selectedParImpar.push(topPI[0]);
        }
      }
    }

    const selectedBajosAltos: string[] = [];
    const disabledBajosAltosSaturated: string[] = [];
    document.querySelectorAll('#bajosAltosOptions .filter-chip').forEach(chip => {
      const val = (chip as HTMLElement).dataset.value || '';
      const count = bajosAltosCounts[val] || 0;
      const freq = count / sampleSize;

      const recentRepeat = recentBajosAltos3.filter(k => k === val).length;
      const isSaturatedRacha = recentRepeat >= 2 && freq < 0.65;

      if (freq >= 0.05 && !isSaturatedRacha) {
        chip.classList.add('active');
        selectedBajosAltos.push(val);
      } else {
        chip.classList.remove('active');
        if (isSaturatedRacha) disabledBajosAltosSaturated.push(val);
      }
    });

    if (selectedBajosAltos.length === 0) {
      const topBA = Object.entries(bajosAltosCounts).sort((a, b) => b[1] - a[1])[0];
      if (topBA) {
        const chip = document.querySelector(`#bajosAltosOptions .filter-chip[data-value="${topBA[0]}"]`);
        if (chip) {
          chip.classList.add('active');
          selectedBajosAltos.push(topBA[0]);
        }
      }
    }

    // 6. Agrupación por Decenas (e.g. 2/2/1/1, 2/1/1/1/1, 3/2/1...)
    const agrupDecenasCounts: { [key: string]: number } = {};
    sampleDraws.forEach(d => {
      const tens: { [k: number]: number } = {};
      d.numbers.forEach(n => {
        const ten = Math.floor((n - 1) / 10);
        tens[ten] = (tens[ten] || 0) + 1;
      });
      const pattern = Object.values(tens).sort((a, b) => b - a).join('/');
      agrupDecenasCounts[pattern] = (agrupDecenasCounts[pattern] || 0) + 1;
    });

    const activeDecenasPatterns: string[] = [];
    document.querySelectorAll('#agrupDecenasOptions .filter-chip').forEach(chip => {
      const val = (chip as HTMLElement).dataset.value || '';
      const count = agrupDecenasCounts[val] || 0;
      if (count / sampleSize >= 0.04) {
        chip.classList.add('active');
        activeDecenasPatterns.push(val);
      } else {
        chip.classList.remove('active');
      }
    });

    // 7. Números Consecutivos (e.g. 1/1/1/1/1/1, 2/1/1/1/1, 2/2/1/1...)
    const consecutivosCounts: { [key: string]: number } = {};
    sampleDraws.forEach(d => {
      const sorted = [...d.numbers].sort((a, b) => a - b);
      let consecStr = '';
      let cCount = 1;
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] === sorted[j - 1] + 1) {
          cCount++;
        } else {
          consecStr += cCount;
          cCount = 1;
        }
      }
      consecStr += cCount;
      const pattern = consecStr.split('').sort((a, b) => Number(b) - Number(a)).join('/');
      consecutivosCounts[pattern] = (consecutivosCounts[pattern] || 0) + 1;
    });

    document.querySelectorAll('#consecutivosOptions .filter-chip').forEach(chip => {
      const val = (chip as HTMLElement).dataset.value || '';
      const count = consecutivosCounts[val] || 0;
      if (count / sampleSize >= 0.04) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // 8. Entropía de Terminaciones
    const termEntropies = sampleDraws.map(d => {
      const endingCounts: { [k: number]: number } = {};
      d.numbers.forEach(n => {
        const ending = n % 10;
        endingCounts[ending] = (endingCounts[ending] || 0) + 1;
      });
      return -Object.values(endingCounts).reduce((s, countVal) => {
        const p = countVal / maxNumbers;
        return s + (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
    });
    termEntropies.sort((a, b) => a - b);
    const minEntropyTerm = termEntropies[Math.floor(sampleSize * 0.05)] ?? termEntropies[0];
    const maxEntropyTerm = termEntropies[Math.floor(sampleSize * 0.95)] ?? termEntropies[termEntropies.length - 1];

    const entTermMinEl = document.getElementById('entropyTerminacionesMin') as HTMLInputElement;
    const entTermMaxEl = document.getElementById('entropyTerminacionesMax') as HTMLInputElement;
    if (entTermMinEl) entTermMinEl.value = minEntropyTerm.toFixed(3);
    if (entTermMaxEl) entTermMaxEl.value = maxEntropyTerm.toFixed(3);

    // 9. Entropía de Intervalos
    const intervalEntropies = sampleDraws.map(d => {
      const sortedCombo = [...d.numbers].sort((a, b) => a - b);
      const intervalCounts: { [k: number]: number } = {};
      for (let idx = 0; idx < sortedCombo.length - 1; idx++) {
        const diff = sortedCombo[idx + 1] - sortedCombo[idx];
        intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
      }
      const numIntervals = maxNumbers - 1;
      if (numIntervals <= 0) return 0;
      return -Object.values(intervalCounts).reduce((s, countVal) => {
        const p = countVal / numIntervals;
        return s + (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
    });
    intervalEntropies.sort((a, b) => a - b);
    const minEntropyInt = intervalEntropies[Math.floor(sampleSize * 0.05)] ?? intervalEntropies[0];
    const maxEntropyInt = intervalEntropies[Math.floor(sampleSize * 0.95)] ?? intervalEntropies[intervalEntropies.length - 1];

    const entIntMinEl = document.getElementById('entropyIntervalosMin') as HTMLInputElement;
    const entIntMaxEl = document.getElementById('entropyIntervalosMax') as HTMLInputElement;
    if (entIntMinEl) entIntMinEl.value = minEntropyInt.toFixed(3);
    if (entIntMaxEl) entIntMaxEl.value = maxEntropyInt.toFixed(3);

    // 10. Desviación Estándar de la Combinación
    const stdDevs = sampleDraws.map(d => {
      const sumVal = d.numbers.reduce((a, b) => a + b, 0);
      const meanVal = sumVal / maxNumbers;
      return Math.sqrt(d.numbers.reduce((sq, n) => sq + Math.pow(n - meanVal, 2), 0) / maxNumbers);
    });
    stdDevs.sort((a, b) => a - b);
    const minStdDev = stdDevs[Math.floor(sampleSize * 0.05)] ?? stdDevs[0];
    const maxStdDev = stdDevs[Math.floor(sampleSize * 0.95)] ?? stdDevs[stdDevs.length - 1];

    const desMinEl = document.getElementById('desviacionMin') as HTMLInputElement;
    const desMaxEl = document.getElementById('desviacionMax') as HTMLInputElement;
    if (desMinEl) desMinEl.value = minStdDev.toFixed(1);
    if (desMaxEl) desMaxEl.value = maxStdDev.toFixed(1);

    // 11. Distancia Mínima y Máxima entre números ordenados
    const minDistances: number[] = [];
    const maxDistances: number[] = [];
    sampleDraws.forEach(d => {
      const sorted = [...d.numbers].sort((a, b) => a - b);
      let localMin = 999;
      let localMax = 0;
      for (let j = 0; j < sorted.length - 1; j++) {
        const diff = sorted[j + 1] - sorted[j];
        if (diff < localMin) localMin = diff;
        if (diff > localMax) localMax = diff;
      }
      minDistances.push(localMin);
      maxDistances.push(localMax);
    });
    minDistances.sort((a, b) => a - b);
    maxDistances.sort((a, b) => a - b);
    const calcDistMin = minDistances[Math.floor(sampleSize * 0.05)] ?? 1;
    const calcDistMax = maxDistances[Math.floor(sampleSize * 0.95)] ?? Math.floor(game.numberRange / 2);

    const distMinEl = document.getElementById('distanciaMin') as HTMLInputElement;
    const distMaxEl = document.getElementById('distanciaMax') as HTMLInputElement;
    if (distMinEl) distMinEl.value = String(calcDistMin);
    if (distMaxEl) distMaxEl.value = String(calcDistMax);

    // 12. Suma de Dígitos
    const digitSums = sampleDraws.map(d => {
      return d.numbers.reduce((acc, num) => {
        const str = String(num);
        return acc + str.split('').reduce((s, ch) => s + parseInt(ch, 10), 0);
      }, 0);
    });
    digitSums.sort((a, b) => a - b);
    const minDigitSum = digitSums[Math.floor(sampleSize * 0.05)] || digitSums[0];
    const maxDigitSum = digitSums[Math.floor(sampleSize * 0.95)] || digitSums[digitSums.length - 1];

    const digSumMinEl = document.getElementById('sumaDigitosMin') as HTMLInputElement;
    const digSumMaxEl = document.getElementById('sumaDigitosMax') as HTMLInputElement;
    if (digSumMinEl) digSumMinEl.value = String(minDigitSum);
    if (digSumMaxEl) digSumMaxEl.value = String(maxDigitSum);

    // 13. Números Primos y Racha Reciente
    const isPrime = (n: number) => {
      if (n < 2) return false;
      for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) return false;
      }
      return true;
    };
    const primeCounts = sampleDraws.map(d => d.numbers.filter(isPrime).length);
    const recentPrimes3 = recentDraws3.map(d => d.numbers.filter(isPrime).length);
    primeCounts.sort((a, b) => a - b);

    let minPrimos = primeCounts[Math.floor(sampleSize * 0.05)] ?? 0;
    let maxPrimos = primeCounts[Math.floor(sampleSize * 0.95)] ?? game.maxNumbers;

    const allRecentSamePrimes = recentPrimes3.length === 3 && recentPrimes3.every(p => p === recentPrimes3[0]);
    let primeStreakNote = '';
    if (allRecentSamePrimes) {
      const repeatedCount = recentPrimes3[0];
      primeStreakNote = ` (Racha de ${repeatedCount} primos en 3 sorteos seguidos; rango ajustado para alternancia probabilística)`;
      if (repeatedCount === maxPrimos) {
        minPrimos = Math.max(0, repeatedCount - 2);
        maxPrimos = Math.max(minPrimos + 1, repeatedCount - 1);
      }
    }

    const primosMinEl = document.getElementById('primosMin') as HTMLInputElement;
    const primosMaxEl = document.getElementById('primosMax') as HTMLInputElement;
    if (primosMinEl) primosMinEl.value = String(minPrimos);
    if (primosMaxEl) primosMaxEl.value = String(maxPrimos);

    // 14. Filtros de Estrellas (si aplica)
    if (game.maxStars > 0) {
      const validStarDraws = sampleDraws.filter(d => d.stars && d.stars.length > 0);
      if (validStarDraws.length > 0) {
        const starSums = validStarDraws.map(d => d.stars!.reduce((a, b) => a + b, 0));
        starSums.sort((a, b) => a - b);
        const minStarSum = starSums[Math.floor(starSums.length * 0.05)] || starSums[0];
        const maxStarSum = starSums[Math.floor(starSums.length * 0.95)] || starSums[starSums.length - 1];

        const starSumMinEl = document.getElementById('starSumMin') as HTMLInputElement;
        const starSumMaxEl = document.getElementById('starSumMax') as HTMLInputElement;
        if (starSumMinEl) starSumMinEl.value = String(minStarSum);
        if (starSumMaxEl) starSumMaxEl.value = String(maxStarSum);

        const starParImparCounts: { [k: string]: number } = {};
        const starMid = Math.floor(game.starRange / 2);
        const starBajosAltosCounts: { [k: string]: number } = {};
        validStarDraws.forEach(d => {
          const sEvens = d.stars!.filter(s => s % 2 === 0).length;
          const sOdds = d.stars!.length - sEvens;
          starParImparCounts[`${sEvens}/${sOdds}`] = (starParImparCounts[`${sEvens}/${sOdds}`] || 0) + 1;

          const sLows = d.stars!.filter(s => s <= starMid).length;
          const sHighs = d.stars!.length - sLows;
          starBajosAltosCounts[`${sLows}/${sHighs}`] = (starBajosAltosCounts[`${sLows}/${sHighs}`] || 0) + 1;
        });

        document.querySelectorAll('#starParImparOptions .filter-chip').forEach(chip => {
          const val = (chip as HTMLElement).dataset.value || '';
          const count = starParImparCounts[val] || 0;
          if (count / validStarDraws.length >= 0.08) chip.classList.add('active');
          else chip.classList.remove('active');
        });

        document.querySelectorAll('#starBajosAltosOptions .filter-chip').forEach(chip => {
          const val = (chip as HTMLElement).dataset.value || '';
          const count = starBajosAltosCounts[val] || 0;
          if (count / validStarDraws.length >= 0.08) chip.classList.add('active');
          else chip.classList.remove('active');
        });

        const starPrimeCounts = validStarDraws.map(d => d.stars!.filter(isPrime).length);
        starPrimeCounts.sort((a, b) => a - b);
        const minStarPrimos = starPrimeCounts[Math.floor(validStarDraws.length * 0.05)] ?? 0;
        const maxStarPrimos = starPrimeCounts[Math.floor(validStarDraws.length * 0.95)] ?? game.maxStars;

        const starPrimosMinEl = document.getElementById('starPrimosMin') as HTMLInputElement;
        const starPrimosMaxEl = document.getElementById('starPrimosMax') as HTMLInputElement;
        if (starPrimosMinEl) starPrimosMinEl.value = String(minStarPrimos);
        if (starPrimosMaxEl) starPrimosMaxEl.value = String(maxStarPrimos);
      }
    }

    // 15. Sincronizar estado interno de filtros
    this.updateFilterStateFromUI();

    // 16. Mostrar bloque informativo completo de decisiones de optimización
    const reasoningBlock = document.getElementById('aiReasoningBlock');
    const reasoningText = document.getElementById('aiReasoningText');

    if (reasoningBlock && reasoningText) {
      reasoningBlock.style.display = 'block';
      const termStr = excludedTerminaciones.length > 0 
        ? excludedTerminaciones.sort((a, b) => a - b).map(t => `${t}${excludedTermReasons[t] ? ` (${excludedTermReasons[t]})` : ''}`).join(', ') 
        : 'Ninguna (distribución uniforme)';

      const exNumStr = excludedRecentNums.length > 0
        ? excludedRecentNums.sort((a, b) => a - b).join(', ')
        : 'Ninguno (sin repeticiones críticas en últimos sorteos)';

      const exStarStr = excludedRecentStars.length > 0
        ? ` | Estrellas excluidas: ${excludedRecentStars.sort((a, b) => a - b).join(', ')}`
        : '';

      const piSaturatedNote = disabledParImparSaturated.length > 0
        ? ` (Desactivados por racha repetida reciente: <code>${disabledParImparSaturated.join(', ')}</code>)`
        : '';

      const baSaturatedNote = disabledBajosAltosSaturated.length > 0
        ? ` (Desactivados por racha repetida reciente: <code>${disabledBajosAltosSaturated.join(', ')}</code>)`
        : '';

      reasoningText.innerHTML = `
        <div style="font-size: 0.88rem; line-height: 1.5;">
          <p style="margin: 0 0 8px 0; font-weight: 600;">Ajuste probabilístico óptimo (Últimos <strong>${sampleSize} sorteos</strong>):</p>
          <ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;">
            <li><strong>🚫 Números Excluidos por Repetición Reciente:</strong> <code>${exNumStr}</code>${exStarStr}. Marcados con 🚫 en el tablero.</li>
            <li><strong>Terminaciones Excluidas:</strong> <code>${termStr}</code>.</li>
            <li><strong>Par/Impar:</strong> Chips seleccionados <code>${selectedParImpar.join(', ')}</code>${piSaturatedNote}.</li>
            <li><strong>Bajos/Altos:</strong> Chips seleccionados <code>${selectedBajosAltos.join(', ')}</code>${baSaturatedNote}.</li>
            <li><strong>Variedad de Terminaciones:</strong> <code>${activeDistinctTerms.sort((a,b)=>a-b).join(', ')}</code> terminaciones distintas activas.</li>
            <li><strong>Números Primos:</strong> Rango fijado en <strong>${minPrimos} a ${maxPrimos} primos</strong>${primeStreakNote}.</li>
            <li><strong>Suma Total:</strong> Rango <strong>${calcSumMin} a ${calcSumMax}</strong> (Intervalo ~90% confianza, media: ${meanSum.toFixed(1)}).</li>
            <li><strong>Agrupación por Decenas:</strong> Patrones activados <code>${activeDecenasPatterns.slice(0, 4).join(', ')}</code>.</li>
            <li><strong>Entropías e Intervalos:</strong> Term <strong>${minEntropyTerm.toFixed(3)} - ${maxEntropyTerm.toFixed(3)}</strong> | Int <strong>${minEntropyInt.toFixed(3)} - ${maxEntropyInt.toFixed(3)}</strong>.</li>
            <li><strong>Desviación & Distancias:</strong> Desviación <strong>${minStdDev.toFixed(1)} - ${maxStdDev.toFixed(1)}</strong> | Dist. <strong>${calcDistMin} - ${calcDistMax}</strong>.</li>
          </ul>
        </div>
      `;
    }

    this.saveState();
    this.showToast(`✅ Filtros y chips optimizados según masa de probabilidad y repeticiones recientes.`, 'success');
  }

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
          this.showToast('No hay datos históricos cargados para realizar el backtesting.', 'error');
          return;
      }

      this.updateFilterStateFromUI();

      const periodVal = (document.getElementById('backtestPeriod') as HTMLSelectElement).value;
      const modeVal = (document.getElementById('backtestMode') as HTMLSelectElement).value;

      let drawsToTest = [...this.historicalData];
      if (periodVal !== 'all') {
          const limit = parseInt(periodVal);
          drawsToTest = drawsToTest.slice(-limit);
      }

      const totalDraws = drawsToTest.length;
      if (totalDraws === 0) {
          this.showToast('No hay sorteos seleccionados para evaluar.', 'error');
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
          if (lblTotalDraws) lblTotalDraws.textContent = "Sorteos Históricos";
          if (lblTicketPrice) lblTicketPrice.textContent = "Ganadores Admitidos";
          if (lblTotalSpent) lblTotalSpent.textContent = "Ganadores Excluidos";
          if (lblTotalWon) lblTotalWon.textContent = "Tasa de Aceptación Histórica";
          if (lblBalance) lblBalance.textContent = "Reducción de Universo";
          if (lblROI) lblROI.textContent = "Eficiencia de Filtros (Factor)";
          if (btBreakdownTitle) btBreakdownTitle.textContent = "📋 Registro Histórico de Validez de los Filtros";
      } else {
          if (lblTotalDraws) lblTotalDraws.textContent = "Sorteos Simulados";
          if (lblTicketPrice) lblTicketPrice.textContent = "Precio por Apuesta";
          if (lblTotalSpent) lblTotalSpent.textContent = "Presupuesto Invertido";
          if (lblTotalWon) lblTotalWon.textContent = "Premios Recuperados";
          if (lblBalance) lblBalance.textContent = "Balance Neto";
          if (lblROI) lblROI.textContent = "Retorno de Inversión (ROI)";
          if (btBreakdownTitle) btBreakdownTitle.textContent = "🏆 Desglose Detallado de Aciertos";
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

              // Validar el sorteo ganador real frente a los filtros activos en la UI
              const isPassed = this.isValidCombination(draw.numbers, draw.stars || []);
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

          // Renderizar métricas en la interfaz
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
          if (elTicketPrice) elTicketPrice.textContent = `${passedDrawsCount} sorteos`;
          if (elSpent) elSpent.textContent = `${totalDraws - passedDrawsCount} sorteos`;
          
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
              elExpVal.textContent = `Poder del Filtro: ${efficiency >= 1.4 ? 'Excelente' : efficiency >= 1.1 ? 'Bueno' : efficiency >= 0.8 ? 'Neutro' : 'Bajo / Poco representativo'}`;
              elExpVal.style.color = efficiency >= 1.1 ? 'var(--success)' : efficiency >= 0.8 ? '#d97706' : 'var(--danger)';
          }

          if (elExpValAdvice) {
              let adviceText = '';
              if (efficiency > 1.25) {
                  adviceText = `📊 ¡Filtros de Alto Rendimiento! Tu factor de eficiencia (${efficiency.toFixed(2)}x) demuestra matemáticamente que la configuración reduce eficazmente el ruido aleatorio (${reductionRate.toFixed(1)}% descartado) sin perjudicar la tasa de aciertos (${passRateWinning.toFixed(1)}% capturados). ¡Excelente diseño!`;
              } else if (efficiency >= 0.8) {
                  adviceText = `⚖️ Nivel de Equilibrio Estándar (${efficiency.toFixed(2)}x). Los filtros descartan el ${reductionRate.toFixed(1)}% del universo de combinaciones posibles reteniendo el ${passRateWinning.toFixed(1)}% de sorteos históricos correctos. Puedes afinar mejor los rangos para aumentar la eficiencia sobre 1.20x.`;
              } else {
                  adviceText = `⚠️ Ajusta tu configuración. Tus filtros descartan demasiados ganadores reales en relación a la reducción que ofrecen (Eficiencia de apenas ${efficiency.toFixed(2)}x). Modula los rangos límites para evitar sesgar el resultado.`;
              }
              elExpValAdvice.textContent = adviceText;
          }

          if (elHitsBreakdown) {
              elHitsBreakdown.innerHTML = '';
              let breakdownHTML = `<table class="validation-summary-table">
                  <tr>
                      <th>Fecha del Sorteo</th>
                      <th>Combinación Ganadora Histórica</th>
                      <th>Estado del Filtro</th>
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
                      ? `<span style="background: rgba(16,185,129,0.15); color: var(--success); padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.82rem; display: inline-block;">✅ EN FILTRO (Admitido)</span>`
                      : `<span style="background: rgba(239,68,68,0.1); color: var(--danger); padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.82rem; display: inline-block;">❌ EXCLUIDO</span>`;

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
                      * Mostrando últimos 50 sorteos históricos para un renderizado ágil de tablas.
                  </div>`;
              }
              elHitsBreakdown.innerHTML = breakdownHTML;
          }

          if (btn) (btn as HTMLButtonElement).disabled = false;
          if (progressContainer) progressContainer.style.display = 'none';
          if (resultsDiv) resultsDiv.style.display = 'block';

          this.showToast('✅ ¡Eficacia de filtros evaluada con éxito!', 'success');
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
              this.showToast(`Por favor, selecciona exactamente ${maxNumbers} números y ${maxStars} estrellas, o genera un boleto inteligente antes de testear.`, 'warning');
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

              let catLabel = `${hits} aciertos`;
              if (maxStars > 0) {
                  const starName = this.currentGame.id === 'powerball' ? 'bola especial' : (this.currentGame.id === 'megamillions' ? 'mega ball' : (this.currentGame.id === 'eurodreams' ? 'sueño' : (this.currentGame.id === 'gordo' ? 'clave' : 'estrella')));
                  catLabel = `${hits} nº + ${starHits} ${starName}${starHits !== 1 ? 's' : ''}`;
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
      if (elTicketPrice) elTicketPrice.textContent = `${ticketPrice.toFixed(2)} €`;
      if (elSpent) elSpent.textContent = `${totalSpent.toFixed(2)} €`;
      if (elWon) elWon.textContent = `${totalWon.toFixed(2)} €`;

      const balance = totalWon - totalSpent;
      if (elBalance) {
          elBalance.textContent = `${balance >= 0 ? '+' : ''}${balance.toFixed(2)} €`;
          elBalance.style.color = balance >= 0 ? 'var(--success)' : 'var(--danger)';
      }

      const roi = totalSpent > 0 ? (totalWon / totalSpent) * 100 : 0;
      if (elROI) {
          elROI.textContent = `${roi.toFixed(1)}%`;
          elROI.style.color = roi >= 100 ? 'var(--success)' : roi >= 20 ? '#d97706' : 'var(--danger)';
      }

      const expVal = balance / totalDraws;
      if (elExpVal) {
          elExpVal.textContent = `${expVal >= 0 ? '+' : ''}${expVal.toFixed(2)} € / sorteo`;
          elExpVal.style.color = expVal >= 0 ? 'var(--success)' : 'var(--danger)';
      }

      if (elExpValAdvice) {
          let adviceText = '';
          const randomPlayExp = -ticketPrice * 0.45;
          if (expVal > randomPlayExp) {
              adviceText = `✅ ¡Filtro Ganador! Tu esperanza matemática empírica (${expVal.toFixed(2)} €) es superior al promedio teórico de una jugada aleatoria (${randomPlayExp.toFixed(2)} €). Los filtros han recortado la ventaja de la casa.`;
          } else {
              adviceText = `⚠️ Tu nivel de retorno está por debajo de lo esperado. Intenta ajustar los filtros (como Markov, Sumas o Desviación) para optimizar la esperanza matemática empirica.`;
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
              elHitsBreakdown.innerHTML = `<div style="color: var(--gray); font-style: italic; text-align: center; padding: 10px;">No se obtuvieron aciertos computables en este test con premio.</div>`;
          } else {
              let breakdownHTML = `<table class="validation-summary-table">
                  <tr>
                      <th>Categoría de Aciertos</th>
                      <th>Sorteos de Coincidencia</th>
                      <th>Probabilidad Empírica</th>
                  </tr>`;
              
              sortedBreakdown.forEach(([label, count]) => {
                  const prob = ((count / totalDraws) * 100).toFixed(2);
                  const isHighlight = count > 0 && !label.startsWith('0 ') && !label.startsWith('1 ') && !label.startsWith('2 nº + 0');
                  breakdownHTML += `
                      <tr class="${isHighlight ? 'row-highlight' : ''}">
                          <td><strong>${label}</strong></td>
                          <td>${count} veces</td>
                          <td>${prob}%</td>
                      </tr>`;
              });
              breakdownHTML += `</table>`;
              elHitsBreakdown.innerHTML = breakdownHTML;
          }
      }

      this.showToast('✅ ¡Backtesting completado con éxito!', 'success');
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
    this.sendTelemetry('save_ticket', {
      gameId: metrics.gameId,
      combinationsCount: metrics.combinationsCount,
      betType: metrics.betType,
      numbersCount: metrics.numbersCount,
      starsCount: metrics.starsCount,
      drawDate: this.currentTicket.drawDate || 'Desconocida'
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

        this.sendTelemetry('validate_ticket', {
          gameId: valData.gameId,
          allHits: valData.allHits,
          maxHits: valData.maxHits,
          maxStars: 0,
          prizeNotice: `Peña "${peña.name}": ${valData.maxHits} aciertos (Premio de ${prizeAmount} €)`,
          drawDate: ticket.drawDate || 'Comprobador Peña',
          combinationsCount: valData.allHits.length
        });
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