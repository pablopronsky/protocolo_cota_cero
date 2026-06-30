import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, orderBy, updateDoc, Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/client';
import type { Client } from '@/schemas';

const db = () => getFirebaseDb();

export async function getClient(id: string): Promise<Client | null> {
  const snap = await getDoc(doc(db(), 'clients', id));
  return snap.exists() ? (snap.data() as Client) : null;
}

export function subscribeClient(
  id: string,
  callback: (client: Client | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db(), 'clients', id), (snap) => {
    callback(snap.exists() ? (snap.data() as Client) : null);
  });
}

export async function updateClient(
  id: string,
  data: Partial<Omit<Client, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(db(), 'clients', id), { ...data, updatedAt: Date.now() });
}

export async function listClients(): Promise<Client[]> {
  const snap = await getDocs(query(collection(db(), 'clients'), orderBy('nombre')));
  return snap.docs.map((d) => d.data() as Client);
}
