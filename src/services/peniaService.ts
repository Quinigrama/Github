import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { Penia, PeniaAlert, PeniaChatMessage, Ticket } from '../types';

export function generate6CharPeniaCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function serializePeniaForFirestore(peña: Penia): Record<string, any> {
  return {
    id: peña.id,
    code: peña.code || peña.id,
    name: peña.name,
    gameId: peña.gameId,
    creator: peña.creator,
    createdAt: peña.createdAt,
    members: peña.members || [],
    totalPrizes: peña.totalPrizes || 0,
    ticketsJson: JSON.stringify(peña.tickets || []),
    messagesJson: JSON.stringify(peña.messages || []),
    alertsJson: JSON.stringify(peña.alerts || [])
  };
}

export function deserializePeniaFromFirestore(data: any, docId: string): Penia {
  let tickets: Ticket[] = [];
  if (data.ticketsJson) {
    try {
      tickets = JSON.parse(data.ticketsJson);
    } catch {
      tickets = [];
    }
  } else if (Array.isArray(data.tickets)) {
    tickets = data.tickets;
  }

  let messages: PeniaChatMessage[] = [];
  if (data.messagesJson) {
    try {
      messages = JSON.parse(data.messagesJson);
    } catch {
      messages = [];
    }
  } else if (Array.isArray(data.messages)) {
    messages = data.messages;
  }

  let alerts: PeniaAlert[] = [];
  if (data.alertsJson) {
    try {
      alerts = JSON.parse(data.alertsJson);
    } catch {
      alerts = [];
    }
  } else if (Array.isArray(data.alerts)) {
    alerts = data.alerts;
  }

  return {
    id: docId || data.id || data.code,
    code: data.code || docId || data.id,
    name: data.name || 'Peña',
    gameId: data.gameId || 'bonoloto',
    creator: data.creator || 'Usuario',
    createdAt: data.createdAt || new Date().toISOString(),
    members: Array.isArray(data.members) ? data.members : [],
    tickets,
    messages,
    alerts,
    totalPrizes: typeof data.totalPrizes === 'number' ? data.totalPrizes : 0
  };
}

export async function savePeniaToFirestore(db: Firestore, peña: Penia): Promise<void> {
  const docRef = doc(db, 'penias', peña.id);
  await setDoc(docRef, serializePeniaForFirestore(peña), { merge: true });
}

export async function fetchPeniaByCode(db: Firestore, code: string): Promise<Penia | null> {
  const docRef = doc(db, 'penias', code);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  return deserializePeniaFromFirestore(docSnap.data(), docSnap.id);
}

export async function deletePeniaFromFirestore(db: Firestore, peñaId: string): Promise<void> {
  const docRef = doc(db, 'penias', peñaId);
  await deleteDoc(docRef);
}

export function subscribeToPenias(
  db: Firestore,
  onUpdate: (penias: Penia[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const peniasRef = collection(db, 'penias');
  return onSnapshot(
    peniasRef,
    (snapshot) => {
      const fetched: Penia[] = [];
      snapshot.forEach((docSnap) => {
        fetched.push(deserializePeniaFromFirestore(docSnap.data(), docSnap.id));
      });
      onUpdate(fetched);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('Error listening to penias:', error);
    }
  );
}
