import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseStorage, getFirebaseDb } from './firebase/client';
import type { PhotoRef, ProjectCode, DocType } from '@/schemas';

// #23 — La cola offline vive en IndexedDB (no localStorage): guarda los Blobs
// comprimidos directamente, sin inflar a base64 ni chocar contra el tope de 5MB.
// Las fotos se reducen antes de encolar y todas las escrituras van envueltas en
// try/catch para que un fallo de cuota/IO se propague en vez de perderse en
// silencio.

const DB_NAME = 'cotacero';
const DB_VERSION = 1;
const STORE = 'photoQueue';
const LEGACY_QUEUE_KEY = 'cotacero_photo_queue';

interface QueueEntry {
  entryId: string; // clave única de la entrada (no la del PhotoRef)
  projectCode: ProjectCode;
  docType: DocType;
  photoRef: PhotoRef; // cleanRef — sin localBlob
  blob: Blob; // imagen comprimida lista para subir
  signatureField?: string; // si está: actualizar este campo en lugar de registroFotografico
}

// ── Compresión ───────────────────────────────────────────
const MAX_DIM = 1600;       // lado máximo en px
const JPEG_QUALITY = 0.7;

// Redimensiona y recodifica a JPEG. Si algo falla (formato raro, sin canvas),
// cae al archivo original para no bloquear la captura.
async function compressImage(file: File): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

// ── IndexedDB ────────────────────────────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'entryId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await reqToPromise(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

const idbPut = (entry: QueueEntry) => withStore('readwrite', (s) => s.put(entry));
const idbGetAll = () => withStore<QueueEntry[]>('readonly', (s) => s.getAll());
const idbDelete = (entryId: string) => withStore('readwrite', (s) => s.delete(entryId));

// ── Encolado ─────────────────────────────────────────────
// Encola una foto en registroFotografico. Escribe el ref en Firestore como
// pending (sin localBlob). El caller guarda el localBlob en estado local del
// componente para preview; nunca llega a Firestore.
export async function enqueuePhoto(
  projectCode: ProjectCode,
  docType: DocType,
  file: File,
  uploadedBy: string,
): Promise<{ id: string; localBlob: string }> {
  const id = crypto.randomUUID();
  const storagePath = `projects/${projectCode}/${docType}/${id}.jpg`;
  const blob = await compressImage(file);
  const localBlob = URL.createObjectURL(blob);

  const cleanRef: PhotoRef = {
    id,
    storagePath,
    takenAt: Date.now(),
    uploadedBy,
    pending: true,
  };

  try {
    await idbPut({ entryId: crypto.randomUUID(), projectCode, docType, photoRef: cleanRef, blob });
  } catch (e) {
    URL.revokeObjectURL(localBlob);
    throw new Error('No se pudo guardar la foto en la cola local: ' + describeError(e));
  }

  // Único escritor del array: arrayUnion garantiza idempotencia. Si falla, el
  // blob queda en cola y el flush posterior agrega la versión subida.
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'projects', projectCode, 'documents', docType), {
    registroFotografico: arrayUnion(cleanRef),
  });

  if (typeof navigator !== 'undefined' && navigator.onLine) void flushPhotoQueue();

  return { id, localBlob };
}

// Encola una firma (campo escalar, no array — solo para AC). Escribe el ref
// pending en Firestore. El caller guarda el localBlob para preview local.
export async function enqueueSignature(
  projectCode: ProjectCode,
  signatureField: string, // e.g. 'firmaCliente.firma'
  file: File,
  uploadedBy: string,
): Promise<{ cleanRef: PhotoRef; localBlob: string }> {
  const id = crypto.randomUUID();
  const storagePath = `projects/${projectCode}/AC/${id}.jpg`;
  const blob = await compressImage(file);
  const localBlob = URL.createObjectURL(blob);

  const cleanRef: PhotoRef = {
    id,
    storagePath,
    takenAt: Date.now(),
    uploadedBy,
    pending: true,
  };

  try {
    await idbPut({ entryId: crypto.randomUUID(), projectCode, docType: 'AC', photoRef: cleanRef, blob, signatureField });
  } catch (e) {
    URL.revokeObjectURL(localBlob);
    throw new Error('No se pudo guardar la firma en la cola local: ' + describeError(e));
  }

  const db = getFirebaseDb();
  await updateDoc(doc(db, 'projects', projectCode, 'documents', 'AC'), {
    [signatureField]: cleanRef,
  });

  if (typeof navigator !== 'undefined' && navigator.onLine) void flushPhotoQueue();

  return { cleanRef, localBlob };
}

// Elimina una foto de registroFotografico en Firestore y la cancela en la cola.
// El caller es responsable de revocar el localBlob del estado local.
export async function removePhotoFromDoc(
  projectCode: ProjectCode,
  docType: DocType,
  photoRef: PhotoRef,
): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'projects', projectCode, 'documents', docType), {
    registroFotografico: arrayRemove(photoRef),
  });

  if (photoRef.pending) {
    try {
      const all = await idbGetAll();
      const match = all.find(
        (e) => e.projectCode === projectCode && e.docType === docType && e.photoRef.id === photoRef.id && !e.signatureField,
      );
      if (match) await idbDelete(match.entryId);
    } catch {
      // best-effort: si no se puede limpiar la cola, el flush igual fallará el
      // arrayUnion sobre un doc del que ya se quitó la foto — sin efecto visible.
    }
  }
}

// Cancela una firma encolada (al descartar la firma del cliente en el acta).
// Evita que un flush posterior resucite la firma descartada.
export async function cancelQueuedSignature(
  projectCode: ProjectCode,
  docType: DocType,
  signatureField: string,
): Promise<void> {
  try {
    const all = await idbGetAll();
    for (const e of all) {
      if (e.projectCode === projectCode && e.docType === docType && e.signatureField === signatureField) {
        await idbDelete(e.entryId);
      }
    }
  } catch {
    // best-effort
  }
}

// ── Flush ────────────────────────────────────────────────
// Sube todas las fotos pendientes en la cola (IndexedDB + cola legacy).
export async function flushPhotoQueue(): Promise<void> {
  await drainLegacyQueue();

  let entries: QueueEntry[];
  try {
    entries = await idbGetAll();
  } catch {
    return;
  }
  if (entries.length === 0) return;

  const storage = getFirebaseStorage();
  const db = getFirebaseDb();

  for (const entry of entries) {
    try {
      const storageRef = ref(storage, entry.photoRef.storagePath);
      await uploadBytes(storageRef, entry.blob, { contentType: entry.blob.type || 'image/jpeg' });

      const uploaded: PhotoRef = {
        id: entry.photoRef.id,
        storagePath: entry.photoRef.storagePath,
        takenAt: entry.photoRef.takenAt,
        uploadedBy: entry.photoRef.uploadedBy,
        pending: false,
      };
      if (entry.photoRef.caption !== undefined) uploaded.caption = entry.photoRef.caption;

      const docRef = doc(db, 'projects', entry.projectCode, 'documents', entry.docType);

      if (entry.signatureField) {
        // Firma escalar: reemplazar el campo directamente
        await updateDoc(docRef, { [entry.signatureField]: uploaded });
      } else {
        // Array de fotos: quitar la pendiente y agregar la subida
        await updateDoc(docRef, { registroFotografico: arrayRemove(entry.photoRef) });
        await updateDoc(docRef, { registroFotografico: arrayUnion(uploaded) });
      }

      await idbDelete(entry.entryId);
    } catch {
      // queda en la cola; se reintenta en el próximo flush/online
    }
  }
}

// Migra (una sola vez) las entradas que hayan quedado en la cola vieja de
// localStorage al esquema IndexedDB. Idempotente: vacía la clave al terminar.
async function drainLegacyQueue(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
  if (!raw) return;
  try {
    const legacy: Array<{
      projectCode: ProjectCode;
      docType: DocType;
      photoRef: PhotoRef;
      blob: string; // base64
      signatureField?: string;
    }> = JSON.parse(raw);
    for (const e of legacy) {
      const blob = base64ToBlob(e.blob, 'image/jpeg');
      await idbPut({
        entryId: crypto.randomUUID(),
        projectCode: e.projectCode,
        docType: e.docType,
        photoRef: e.photoRef,
        blob,
        ...(e.signatureField ? { signatureField: e.signatureField } : {}),
      });
    }
  } catch {
    // si está corrupta, igual la descartamos abajo
  }
  localStorage.removeItem(LEGACY_QUEUE_KEY);
}

// Inicia el flush cuando la conexión se recupera.
export function initPhotoQueueListener(): () => void {
  const handler = () => flushPhotoQueue();
  window.addEventListener('online', handler);
  if (navigator.onLine) flushPhotoQueue();
  return () => window.removeEventListener('online', handler);
}

export async function getPhotoUrl(storagePath: string): Promise<string> {
  const storage = getFirebaseStorage();
  return getDownloadURL(ref(storage, storagePath));
}

// ── helpers ──────────────────────────────────────────────
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
