import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, orderBy, where, writeBatch, deleteField, Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/client';
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

type ClientUpdate = Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>>;

function hasOwn(data: ClientUpdate, key: keyof ClientUpdate): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

export async function updateClient(
  id: string,
  data: ClientUpdate,
): Promise<void> {
  const database = db();
  const clientRef = doc(database, 'clients', id);
  const currentSnap = await getDoc(clientRef);
  if (!currentSnap.exists()) throw new Error('Cliente no encontrado.');

  const current = currentSnap.data() as Client;
  const now = Date.now();
  const update: Record<string, unknown> = { updatedAt: now };

  if (hasOwn(data, 'nombre')) {
    const nombre = data.nombre?.trim();
    if (!nombre) throw new Error('El nombre del cliente es obligatorio.');
    update.nombre = nombre;
  }
  if (hasOwn(data, 'contacto')) update.contacto = data.contacto?.trim() ?? '';
  if (hasOwn(data, 'telefono')) update.telefono = data.telefono?.trim() ?? '';
  if (hasOwn(data, 'email')) {
    const email = data.email?.trim();
    update.email = email || deleteField();
  }
  if (hasOwn(data, 'dni_cuit')) {
    const dniCuit = data.dni_cuit?.trim();
    update.dni_cuit = dniCuit || deleteField();
  }

  const nextName = typeof update.nombre === 'string' ? update.nombre : current.nombre;
  const nameChanged = nextName !== current.nombre;
  const projectSnaps = nameChanged
    ? await getDocs(query(
        collection(database, 'projects'),
        where('clienteId', '==', id),
      ))
    : null;

  // Un batch de Firestore admite como maximo 500 escrituras. Reservamos una
  // para el cliente y fallamos antes de escribir para conservar atomicidad.
  if (projectSnaps && projectSnaps.size > 499) {
    throw new Error('El cliente tiene demasiados proyectos para actualizarlo en una sola operacion.');
  }

  const batch = writeBatch(database);
  batch.update(clientRef, update);
  if (projectSnaps) {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) throw new Error('Sesion no disponible. Volve a iniciar sesion.');
    projectSnaps.docs.forEach((projectSnap) => {
      batch.update(projectSnap.ref, {
        clienteNombre: nextName,
        updatedAt: now,
        updatedBy: uid,
      });
    });
  }
  await batch.commit();
}

export async function listClients(): Promise<Client[]> {
  const snap = await getDocs(query(collection(db(), 'clients'), orderBy('nombre')));
  return snap.docs.map((d) => d.data() as Client);
}
