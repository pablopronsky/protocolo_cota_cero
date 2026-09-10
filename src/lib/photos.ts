import { documentAction } from './documentApi';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseStorage, getFirebaseDb } from './firebase/client';
import { normalizeImage, assertUploadable, UPLOAD_EXT, PhotoPipelineError } from './imageNormalize';
import type { PhotoRef, ProjectCode, DocType } from '@/schemas';

// #23 — La cola offline vive en IndexedDB (no localStorage): guarda los Blobs
// comprimidos directamente, sin inflar a base64 ni chocar contra el tope de 5MB.
//
// #P1 — Cámara física. Dos cambios de fondo respecto de la versión anterior:
//
//   1. Nada entra a la cola sin haber sido normalizado a JPEG y validado contra
//      el contrato de Storage (`imageNormalize.ts`). Antes, una captura HEIC se
//      encolaba cruda y Storage la rechazaba en cada intento.
//   2. `flushPhotoQueue()` ya no se traga los errores. Distingue fallo
//      transitorio (sigue en cola, se reintenta) de fallo permanente (se marca,
//      se deja de reintentar y la UI lo muestra). El estado "pendiente para
//      siempre y sin explicación" deja de ser alcanzable.

const DB_NAME = 'cotacero';
const DB_VERSION = 1;
const STORE = 'photoQueue';
const LEGACY_QUEUE_KEY = 'cotacero_photo_queue';

/** Fallo registrado sobre una entrada de la cola. */
export interface QueueFailure {
  code: string;      // código de Firebase o del pipeline, para diagnóstico
  message: string;   // texto mostrable al usuario
  at: number;
}

interface QueueEntry {
  entryId: string; // clave única de la entrada (no la del PhotoRef)
  projectCode: ProjectCode;
  docType: DocType;
  photoRef: PhotoRef; // cleanRef — sin localBlob
  blob: Blob; // imagen normalizada lista para subir
  signatureContent?: Record<string, unknown>;
  signatureField?: string; // si está: actualizar este campo en lugar de registroFotografico
  attempts?: number; // intentos con respuesta del servidor (no cuenta los offline)
  failed?: QueueFailure; // si está: fallo permanente, no se reintenta solo
}

// Después de esto damos por permanente un error que se presentaba como
// transitorio: evita el reintento ciego e infinito ante un fallo desconocido.
const MAX_ATTEMPTS = 8;

function auditFields(): { updatedAt: number; updatedBy: string } {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new Error('La sesión venció. Volvé a iniciar sesión antes de guardar archivos.');
  }
  return { updatedAt: Date.now(), updatedBy: uid };
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

// ── Estado observable de la cola ─────────────────────────
// La UI necesita distinguir "pendiente de sincronización" de "error al subir", y
// esa diferencia solo existe acá: el binario vive en IndexedDB, en este
// dispositivo. Firestore solo sabe `pending: true`.

export type PhotoUploadState = 'pending' | 'error';

export interface PhotoQueueItem {
  photoId: string;
  state: PhotoUploadState;
  message?: string;
  code?: string;
}

/** Estado por `PhotoRef.id`. Solo incluye adjuntos que siguen en la cola. */
export type PhotoQueueSnapshot = ReadonlyMap<string, PhotoQueueItem>;

const listeners = new Set<(snapshot: PhotoQueueSnapshot) => void>();

function snapshotFrom(entries: QueueEntry[]): PhotoQueueSnapshot {
  const map = new Map<string, PhotoQueueItem>();
  for (const entry of entries) {
    map.set(entry.photoRef.id, entry.failed
      ? { photoId: entry.photoRef.id, state: 'error', message: entry.failed.message, code: entry.failed.code }
      : { photoId: entry.photoRef.id, state: 'pending' });
  }
  return map;
}

async function notifyQueueListeners(): Promise<void> {
  if (listeners.size === 0) return;
  let snapshot: PhotoQueueSnapshot;
  try {
    snapshot = snapshotFrom(await idbGetAll());
  } catch {
    return; // sin lectura de la cola no hay nada que informar
  }
  for (const listener of listeners) listener(snapshot);
}

/** Se suscribe al estado de la cola. Emite una vez al suscribirse. */
export function subscribePhotoQueue(
  listener: (snapshot: PhotoQueueSnapshot) => void,
): () => void {
  listeners.add(listener);
  void notifyQueueListeners();
  return () => { listeners.delete(listener); };
}

export async function getPhotoQueueSnapshot(): Promise<PhotoQueueSnapshot> {
  try {
    return snapshotFrom(await idbGetAll());
  } catch {
    return new Map();
  }
}

// ── Clasificación de errores ─────────────────────────────

export type FailureKind = 'transient' | 'permanent';

export interface ClassifiedFailure {
  kind: FailureKind;
  code: string;
  message: string;
}

// Códigos de Firebase que describen una condición que no cambia por reintentar:
// el archivo, el path o el permiso están mal. Reintentar solo gasta batería.
const PERMANENT_CODES = new Set([
  'storage/unauthorized',
  'storage/invalid-argument',
  'storage/invalid-format',
  'storage/invalid-url',
  'storage/invalid-root-operation',
  'storage/bucket-not-found',
  'storage/project-not-found',
  'storage/quota-exceeded',
  'permission-denied',
  'invalid-argument',
  'not-found',
  'failed-precondition',
]);

// Fallos de red o de disponibilidad. La foto se queda en cola tal cual.
const TRANSIENT_CODES = new Set([
  'storage/retry-limit-exceeded',
  'storage/canceled',
  'storage/unknown',
  'storage/server-file-wrong-size',
  'storage/unauthenticated',
  'firestore/timeout', // sin ACK dentro del flush: falta de señal, no rechazo
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'aborted',
  'internal',
  'cancelled',
]);

const MSG_PERMANENT: Record<string, string> = {
  'storage/unauthorized': 'El servidor rechazó esta imagen. Eliminala y sacá otra foto.',
  'storage/invalid-format': 'El formato de esta imagen no es válido. Eliminala y sacá otra foto.',
  'storage/quota-exceeded': 'No hay espacio disponible para subir la foto. Avisá a administración.',
  'permission-denied': 'No tenés permiso para subir esta imagen, o el documento ya está cerrado.',
};

function errorCode(e: unknown): string {
  if (e instanceof PhotoPipelineError) return `pipeline/${e.code}`;
  const candidate = e as { code?: unknown };
  if (typeof candidate?.code === 'string') return candidate.code;
  return 'unknown';
}

export function classifyUploadError(e: unknown): ClassifiedFailure {
  const code = errorCode(e);

  // Sin conexión no hay diagnóstico posible: es transitorio por definición.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'transient', code: 'offline', message: 'Pendiente de sincronización' };
  }

  if (e instanceof PhotoPipelineError) {
    return { kind: 'permanent', code, message: e.message };
  }
  if (PERMANENT_CODES.has(code)) {
    return {
      kind: 'permanent',
      code,
      message: MSG_PERMANENT[code] ?? 'El servidor rechazó esta imagen. Eliminala y sacá otra foto.',
    };
  }
  if (TRANSIENT_CODES.has(code)) {
    return { kind: 'transient', code, message: 'Pendiente de sincronización' };
  }
  // Desconocido: se trata como transitorio, pero MAX_ATTEMPTS le pone techo.
  return { kind: 'transient', code, message: 'Pendiente de sincronización' };
}

// Diagnóstico sin secretos: ni URLs firmadas, ni tokens, ni contenido.
function logFailure(entry: QueueEntry, failure: ClassifiedFailure, attempts: number): void {
  console.warn('[photos] fallo de subida', {
    photoId: entry.photoRef.id,
    storagePath: entry.photoRef.storagePath,
    docType: entry.docType,
    blobType: entry.blob.type,
    blobSize: entry.blob.size,
    kind: failure.kind,
    code: failure.code,
    attempts,
  });
}

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
  const storagePath = `projects/${projectCode}/${docType}/${id}.${UPLOAD_EXT}`;
  // Si el archivo no se puede normalizar, esto lanza y el formulario muestra el
  // error. No se escribe nada ni en IndexedDB ni en Firestore.
  const blob = await normalizeImage(file);
  assertUploadable(blob);
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
  void notifyQueueListeners();

  // Único escritor del array: arrayUnion garantiza idempotencia. Si falla, el
  // blob queda en cola y el flush posterior agrega la versión subida.
  //
  // No se espera el ack del servidor: con `persistentLocalCache` la promesa de
  // `updateDoc` no resuelve hasta que la escritura se confirma, así que
  // esperarla dejaba la captura colgada mientras no hubiera señal —
  // exactamente el escenario de obra. La caché local aplica el cambio al
  // instante y el SDK conserva la escritura hasta reconectar; acá solo se
  // registra el fallo si la escritura resulta rechazada.
  const db = getFirebaseDb();
  const audit = auditFields();
  void updateDoc(doc(db, 'projects', projectCode, 'documents', docType), {
    registroFotografico: arrayUnion(cleanRef),
    ...audit,
  }).catch((e: unknown) => { void recordEntryFailure(id, e); });

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
  signatureContent?: Record<string, unknown>,
): Promise<{ cleanRef: PhotoRef; localBlob: string }> {
  const id = crypto.randomUUID();
  const storagePath = `projects/${projectCode}/AC/${id}.${UPLOAD_EXT}`;
  const blob = await normalizeImage(file);
  assertUploadable(blob);
  const localBlob = URL.createObjectURL(blob);

  const cleanRef: PhotoRef = {
    id,
    storagePath,
    takenAt: Date.now(),
    uploadedBy,
    pending: true,
  };

  try {
    await idbPut({ entryId: crypto.randomUUID(), projectCode, docType: 'AC', photoRef: cleanRef, blob, signatureField, signatureContent });
  } catch (e) {
    URL.revokeObjectURL(localBlob);
    throw new Error('No se pudo guardar la firma en la cola local: ' + describeError(e));
  }
  void notifyQueueListeners();

  if (signatureField !== 'firmaCliente.firma') {
    void updateDoc(doc(getFirebaseDb(), 'projects', projectCode, 'documents', 'AC'), {
      [signatureField]: cleanRef, ...auditFields(),
    }).catch((e: unknown) => { void recordEntryFailure(id, e); });
  }
  // La firma del cliente y su contenido se registran juntos al sincronizar.
  // El Blob y los valores sobreviven offline en la misma entrada IndexedDB.

  if (typeof navigator !== 'undefined' && navigator.onLine) void flushPhotoQueue();

  return { cleanRef, localBlob };
}

/**
 * Marca una entrada de la cola con un fallo permanente. Se usa cuando lo que
 * falla no es la subida sino la escritura del `PhotoRef` en Firestore: sin esto
 * la foto quedaría en la cola sin que nadie explique por qué no avanza.
 */
async function recordEntryFailure(photoId: string, e: unknown): Promise<void> {
  const failure = classifyUploadError(e);
  if (failure.kind !== 'permanent') return; // transitorio: el SDK reintenta solo
  try {
    const all = await idbGetAll();
    const entry = all.find((x) => x.photoRef.id === photoId);
    if (!entry) return;
    logFailure(entry, failure, entry.attempts ?? 0);
    await idbPut({ ...entry, failed: { code: failure.code, message: failure.message, at: Date.now() } });
    await notifyQueueListeners();
  } catch {
    // best-effort: sin la cola no hay nada que anotar.
  }
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
    ...auditFields(),
  });

  if (photoRef.pending) {
    try {
      const all = await idbGetAll();
      const match = all.find(
        (e) => e.projectCode === projectCode && e.docType === docType && e.photoRef.id === photoRef.id && !e.signatureField,
      );
      if (match) await idbDelete(match.entryId);
      void notifyQueueListeners();
    } catch {
      // best-effort: si no se puede limpiar la cola, el flush igual fallará el
      // arrayUnion sobre un doc del que ya se quitó la foto — sin efecto visible.
    }
  }
}

/**
 * Reintenta a mano un adjunto marcado como error permanente. Limpia la marca y
 * dispara un flush; si vuelve a fallar, se vuelve a marcar.
 */
export async function retryPhotoUpload(photoId: string): Promise<void> {
  const all = await idbGetAll();
  const entry = all.find((e) => e.photoRef.id === photoId);
  if (!entry) return;
  const cleared: QueueEntry = { ...entry, attempts: 0 };
  delete cleared.failed;
  await idbPut(cleared);
  await notifyQueueListeners();
  await flushPhotoQueue();
}

// Cancela una firma encolada (al descartar la firma del cliente en el acta).
// Evita que un flush posterior resucite la firma descartada.
export async function cancelQueuedSignature(
  projectCode: ProjectCode,
  docType: DocType,
  signatureField: string,
): Promise<void> {
  if (inFlight) await inFlight;
  try {
    const all = await idbGetAll();
    for (const e of all) {
      if (e.projectCode === projectCode && e.docType === docType && e.signatureField === signatureField) {
        await idbDelete(e.entryId);
      }
    }
    void notifyQueueListeners();
  } catch {
    // best-effort
  }
}

// ── Flush ────────────────────────────────────────────────
// Un solo flush a la vez: `enqueuePhoto`, el listener de `online` y el reintento
// manual pueden dispararlo casi simultáneamente, y dos recorridos en paralelo
// sobre la misma cola se pisan (doble arrayUnion, doble delete).
// Tope de espera del ACK de Firestore dentro del flush. Con
// `persistentLocalCache` la promesa de `updateDoc` no resuelve hasta que el
// servidor confirma, así que si la señal se corta en mitad del flush esperarla
// colgaría la cola para siempre — justo el síntoma que este arreglo elimina.
const FIRESTORE_ACK_TIMEOUT_MS = 20_000;

const ACK_TIMEOUT_CODE = 'firestore/timeout';

/**
 * Confirma —de forma idempotente y esperable— que el `PhotoRef` pending puede
 * existir en Firestore, ANTES de subir el binario a Storage.
 *
 * Sin este paso las dos autorizaciones corrían sueltas: `enqueuePhoto` disparaba
 * el write sin esperarlo (para no colgar la captura sin señal) y el flush subía
 * el archivo en paralelo. Si Firestore rechazaba el ref de forma permanente, el
 * objeto ya estaba escrito en Storage — y con `allow delete: if false` la app no
 * tiene manera de borrarlo. El caso no es teórico: `firestore.rules` deniega
 * toda escritura en un proyecto `archivado`, condición que `storage.rules` no
 * mira, así que Firestore rechaza y Storage acepta.
 *
 * `arrayUnion` con el mismo elemento es un no-op, y reescribir el campo escalar
 * de una firma con el mismo valor también, así que repetirlo es seguro.
 */
async function ensurePendingRef(entry: QueueEntry): Promise<boolean> {
  if (entry.signatureField === 'firmaCliente.firma') {
    await documentAction({ action: 'capture-signature', projectCode: entry.projectCode,
      docType: 'AC', signature: entry.photoRef, values: entry.signatureContent ?? {} });
    const snap = await getDoc(doc(getFirebaseDb(), 'projects', entry.projectCode, 'documents', 'AC'));
    return snap.data()?.firmaCliente?.firma?.pending !== false;
  }
  const db = getFirebaseDb();
  const docRef = doc(db, 'projects', entry.projectCode, 'documents', entry.docType);
  await withAckTimeout(entry.signatureField
    ? updateDoc(docRef, { [entry.signatureField]: entry.photoRef, ...auditFields() })
    : updateDoc(docRef, { registroFotografico: arrayUnion(entry.photoRef), ...auditFields() }));
  return true;
}

/**
 * Le pone techo a la espera de un ACK de Firestore dentro del flush.
 *
 * Se aplica a TODAS las escrituras del flush, no solo a la confirmación previa:
 * si la señal se corta justo después de subir el binario, la escritura de
 * `pending: false` tampoco resuelve, y sin techo el `inFlight` del flush queda
 * trabado para siempre — lo que congela la cola entera durante toda la sesión,
 * porque cada flush posterior devuelve esa misma promesa colgada. El reintento
 * es seguro: la subida usa el mismo path y `arrayRemove`/`arrayUnion` son
 * idempotentes.
 */
function withAckTimeout<T>(write: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('ack timeout'), { code: ACK_TIMEOUT_CODE })),
      FIRESTORE_ACK_TIMEOUT_MS,
    );
  });
  return Promise.race([write, guard]).finally(() => { if (timer) clearTimeout(timer); });
}

let inFlight: Promise<void> | null = null;
let rerun = false;

/**
 * Sube todas las fotos pendientes en la cola (IndexedDB + cola legacy).
 *
 * Si ya hay un flush en curso no se descarta la llamada: se encadena otra
 * pasada al final. Descartarla dejaba un agujero — `retryPhotoUpload()` limpia
 * la marca de error y pide un flush, pero si en ese momento había uno corriendo
 * (que ya había leído la cola sin esa entrada) el reintento no se ejecutaba
 * nunca y la foto se quedaba pendiente en silencio: el mismo síntoma que este
 * arreglo viene a eliminar.
 */
export function flushPhotoQueue(): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = runFlush()
    .finally(() => { inFlight = null; })
    .then(() => {
      if (!rerun) return;
      rerun = false;
      return flushPhotoQueue();
    });
  return inFlight;
}

async function runFlush(): Promise<void> {
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
  let changed = false;

  for (const entry of entries) {
    // Un fallo permanente ya marcado no se reintenta solo: espera a que el
    // usuario reintente o elimine la foto. Es lo que evita el loop infinito.
    if (entry.failed) continue;

    try {
      // Primero el permiso de Firestore, después el binario. El orden importa:
      // un objeto en Storage no se puede borrar desde la app.
      const stillPending = await ensurePendingRef(entry);
      if (!stillPending) { await idbDelete(entry.entryId); changed = true; continue; }

      const storageRef = ref(storage, entry.photoRef.storagePath);
      await uploadBytes(storageRef, entry.blob, { contentType: entry.blob.type });

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
        await withAckTimeout(updateDoc(docRef, {
          [entry.signatureField]: uploaded,
          ...auditFields(),
        }));
      } else {
        // Array de fotos: quitar la pendiente y agregar la subida
        await withAckTimeout(updateDoc(docRef, {
          registroFotografico: arrayRemove(entry.photoRef),
          ...auditFields(),
        }));
        await withAckTimeout(updateDoc(docRef, {
          registroFotografico: arrayUnion(uploaded),
          ...auditFields(),
        }));
      }

      await idbDelete(entry.entryId);
      changed = true;
    } catch (e) {
      const failure = classifyUploadError(e);
      // Los intentos solo se cuentan cuando hubo respuesta del servidor: estar
      // offline no debe consumir el presupuesto de reintentos.
      // Ni estar offline ni quedarse sin ACK son un rechazo del servidor: no
      // deben gastar el presupuesto de reintentos ni convertirse en error.
      const noSignal = failure.code === 'offline' || failure.code === ACK_TIMEOUT_CODE;
      const attempts = noSignal ? (entry.attempts ?? 0) : (entry.attempts ?? 0) + 1;
      const exhausted = failure.kind === 'transient' && attempts >= MAX_ATTEMPTS;
      logFailure(entry, failure, attempts);

      const next: QueueEntry = { ...entry, attempts };
      if (failure.kind === 'permanent') {
        next.failed = { code: failure.code, message: failure.message, at: Date.now() };
      } else if (exhausted) {
        next.failed = {
          code: `${failure.code}/agotado`,
          message: 'No pudimos subir esta imagen después de varios intentos. Reintentá o eliminala.',
          at: Date.now(),
        };
      }
      try {
        await idbPut(next);
        changed = true;
      } catch {
        // Si ni siquiera se puede anotar el fallo, la entrada queda como estaba
        // y se reintenta en el próximo flush. No se pierde la foto.
      }
    }
  }

  if (changed) await notifyQueueListeners();
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
  const handler = () => { void flushPhotoQueue(); };
  window.addEventListener('online', handler);
  if (navigator.onLine) void flushPhotoQueue();
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
