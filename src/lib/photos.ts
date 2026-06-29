import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseStorage, getFirebaseDb } from './firebase/client';
import type { PhotoRef, ProjectCode, DocType } from '@/schemas';

const QUEUE_KEY = 'cotacero_photo_queue';

interface QueueEntry {
  projectCode: ProjectCode;
  docType: DocType;
  photoRef: PhotoRef; // cleanRef — sin localBlob
  blob: string; // base64 para resubir
  signatureField?: string; // si está: actualizar este campo en lugar de registroFotografico
}

function readQueue(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeQueue(q: QueueEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

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
  const localBlob = URL.createObjectURL(file);

  const cleanRef: PhotoRef = {
    id,
    storagePath,
    takenAt: Date.now(),
    uploadedBy,
    pending: true,
  };

  const base64 = await fileToBase64(file);
  const queue = readQueue();
  queue.push({ projectCode, docType, photoRef: cleanRef, blob: base64 });
  writeQueue(queue);

  // Único escritor del array: arrayUnion garantiza idempotencia
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
  const localBlob = URL.createObjectURL(file);

  const cleanRef: PhotoRef = {
    id,
    storagePath,
    takenAt: Date.now(),
    uploadedBy,
    pending: true,
  };

  const base64 = await fileToBase64(file);
  const queue = readQueue();
  queue.push({ projectCode, docType: 'AC', photoRef: cleanRef, blob: base64, signatureField });
  writeQueue(queue);

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
    writeQueue(
      readQueue().filter(
        (e) =>
          !(
            e.projectCode === projectCode &&
            e.docType === docType &&
            e.photoRef.id === photoRef.id &&
            !e.signatureField
          ),
      ),
    );
  }
}

// Sube todas las fotos pendientes en la cola.
export async function flushPhotoQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const storage = getFirebaseStorage();
  const db = getFirebaseDb();
  const remaining: QueueEntry[] = [];

  for (const entry of queue) {
    try {
      const blob = base64ToBlob(entry.blob, 'image/jpeg');
      const storageRef = ref(storage, entry.photoRef.storagePath);
      await uploadBytes(storageRef, blob);

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
    } catch {
      remaining.push(entry);
    }
  }

  writeQueue(remaining);
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
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
