import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/client';
import type { ProtocolTemplate } from '@/schemas';

const db = () => getFirebaseDb();
const ref = () => doc(db(), 'config', 'protocolTemplate');

export async function getProtocolTemplate(): Promise<ProtocolTemplate | null> {
  const snap = await getDoc(ref());
  return snap.exists() ? (snap.data() as ProtocolTemplate) : null;
}

export function subscribeProtocolTemplate(
  cb: (t: ProtocolTemplate | null) => void,
): Unsubscribe {
  return onSnapshot(ref(), (snap) => cb(snap.exists() ? (snap.data() as ProtocolTemplate) : null));
}

export async function saveProtocolTemplate(
  data: Omit<ProtocolTemplate, 'updatedAt' | 'updatedBy'>,
  uid: string,
): Promise<void> {
  await setDoc(ref(), { ...data, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
}
