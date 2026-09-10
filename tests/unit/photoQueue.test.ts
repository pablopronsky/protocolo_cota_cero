import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// #P1 — Tests del contrato de la cola de fotos.
//
// El blocker de cámara física fue posible porque nada ejercitaba el camino
// completo: el smoke escribía los `PhotoRef` a mano y subía a Storage con el
// SDK, así que `enqueuePhoto` → IndexedDB → `flushPhotoQueue` nunca corría. Acá
// la cola es IndexedDB de verdad; lo único simulado es Firebase, que es
// justamente lo que devuelve los errores que hay que clasificar.

const uploadBytes = vi.fn();
const updateDoc = vi.fn();
const getDoc = vi.fn();
const documentAction = vi.fn();
vi.mock('@/lib/documentApi', () => ({ documentAction: (...args: unknown[]) => documentAction(...args) }));

vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ path }),
  uploadBytes: (...args: unknown[]) => uploadBytes(...args),
  getDownloadURL: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getDoc: (...args: unknown[]) => getDoc(...args),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  arrayUnion: (v: unknown) => ({ __op: 'arrayUnion', v }),
  arrayRemove: (v: unknown) => ({ __op: 'arrayRemove', v }),
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: 'tec-uid' } }),
  getFirebaseStorage: () => ({}),
  getFirebaseDb: () => ({}),
}));

// El pipeline de normalización se prueba de verdad en tests/browser (necesita
// canvas). Acá se simula el resultado que produce: un JPEG válido.
const normalizeImage = vi.fn();
vi.mock('@/lib/imageNormalize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/imageNormalize')>();
  return { ...actual, normalizeImage: (f: Blob) => normalizeImage(f) };
});

import {
  enqueuePhoto, enqueueSignature,
  flushPhotoQueue,
  retryPhotoUpload,
  getPhotoQueueSnapshot,
  classifyUploadError,
} from '@/lib/photos';
import { assertUploadable, PhotoPipelineError, MAX_UPLOAD_BYTES } from '@/lib/imageNormalize';

const CODE = 'COTA-2026-0001';
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

/** Error de Firebase tal como lo lanza el SDK: un Error con `.code`. */
function fbError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  // Base limpia por test: fake-indexeddb no tiene reset global.
  globalThis.indexedDB = new IDBFactory();
  uploadBytes.mockReset().mockResolvedValue(undefined);
  updateDoc.mockReset().mockResolvedValue(undefined);
  getDoc.mockReset().mockResolvedValue({ data: () => ({ firmaCliente: { firma: { pending: true } } }) });
  documentAction.mockReset().mockResolvedValue(undefined);
  normalizeImage.mockReset().mockImplementation(async () => jpeg());
  setOnline(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function enqueueOne() {
  return enqueuePhoto(CODE, 'VT', new File([new Uint8Array([1])], 'IMG.JPG', { type: 'image/jpeg' }), 'tec-uid');
}

// ── 10. MIME y extensión coherentes ──────────────────────────────

describe('contrato del blob que se sube', () => {
  it('sube image/jpeg a un path .jpg', async () => {
    await enqueueOne();
    await flushPhotoQueue();

    expect(uploadBytes).toHaveBeenCalledTimes(1);
    const [storageRef, blob, meta] = uploadBytes.mock.calls[0] as [{ path: string }, Blob, { contentType: string }];
    expect(storageRef.path).toMatch(/^projects\/COTA-2026-0001\/VT\/[0-9a-f-]{36}\.jpg$/);
    expect(blob.type).toBe('image/jpeg');
    expect(meta.contentType).toBe('image/jpeg');
  });

  it('una foto subida sale de la cola y se marca pending:false', async () => {
    await enqueueOne();
    await flushPhotoQueue();

    expect(await getPhotoQueueSnapshot()).toHaveProperty('size', 0);
    const union = updateDoc.mock.calls
      .map((c) => (c[1] as Record<string, { __op?: string; v?: { pending?: boolean } }>).registroFotografico)
      .find((v) => v?.__op === 'arrayUnion' && v.v?.pending === false);
    expect(union).toBeDefined();
  });
});

// ── 4. Formato no procesable: nada llega a la cola ───────────────

describe('archivo no procesable', () => {
  it('un HEIC que no se puede decodificar no se encola ni se escribe en Firestore', async () => {
    normalizeImage.mockRejectedValue(
      new PhotoPipelineError('decode-failed', 'No pudimos procesar esta foto. Probá sacar otra o seleccionarla en formato JPG.'),
    );

    await expect(enqueueOne()).rejects.toThrow('No pudimos procesar esta foto');
    expect(updateDoc).not.toHaveBeenCalled();
    expect(await getPhotoQueueSnapshot()).toHaveProperty('size', 0);
  });
});

// ── 5. Validación de tamaño previa a encolar ─────────────────────

describe('assertUploadable — contrato con storage.rules', () => {
  it('rechaza un MIME que las reglas no aceptan', () => {
    expect(() => assertUploadable(new Blob([new Uint8Array([1])], { type: 'image/heic' })))
      .toThrow(PhotoPipelineError);
  });

  it('rechaza un blob por encima del tope de Storage', () => {
    const big = { type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 } as Blob;
    expect(() => assertUploadable(big)).toThrow(/demasiado pesada/);
  });

  it('acepta un JPEG normal', () => {
    expect(() => assertUploadable(jpeg())).not.toThrow();
  });
});

// ── 6. Fallo permanente: error visible, sin reintento ciego ──────

describe('fallo permanente', () => {
  it('permission-denied de Storage marca error y lo expone a la UI', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unauthorized'));
    await enqueueOne();
    await flushPhotoQueue();

    const snapshot = await getPhotoQueueSnapshot();
    expect(snapshot.size).toBe(1);
    const [item] = [...snapshot.values()];
    expect(item.state).toBe('error');
    expect(item.code).toBe('storage/unauthorized');
    expect(item.message).toMatch(/rechazó esta imagen/);
  });

  it('permission-denied de Firestore también se marca como error', async () => {
    await enqueueOne();
    // El rechazo empieza después de encolar: es el caso del documento que se
    // cerró mientras la foto todavía estaba en la cola.
    updateDoc.mockReset().mockRejectedValue(fbError('permission-denied'));
    await flushPhotoQueue();

    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('error');
    expect(item.code).toBe('permission-denied');
  });

  // 9 — no loop infinito
  it('no vuelve a intentar una entrada ya marcada como permanente', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unauthorized'));
    await enqueueOne();
    await flushPhotoQueue();
    expect(uploadBytes).toHaveBeenCalledTimes(1);

    await flushPhotoQueue();
    await flushPhotoQueue();
    expect(uploadBytes).toHaveBeenCalledTimes(1);
  });

  it('un error transitorio desconocido deja de reintentarse tras el tope', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unknown'));
    await enqueueOne();
    for (let i = 0; i < 12; i++) await flushPhotoQueue();

    // 8 intentos (MAX_ATTEMPTS) y después se marca; no sigue creciendo.
    expect(uploadBytes).toHaveBeenCalledTimes(8);
    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('error');
    expect(item.message).toMatch(/varios intentos/);
  });
});

// ── 7 y 8. Offline / recuperar conexión ──────────────────────────

describe('offline', () => {
  it('sin conexión la foto queda pendiente, no en error', async () => {
    await enqueueOne();
    setOnline(false);
    uploadBytes.mockRejectedValue(fbError('storage/retry-limit-exceeded'));
    await flushPhotoQueue();

    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('pending');
  });

  it('estar offline no consume el presupuesto de reintentos', async () => {
    await enqueueOne();
    setOnline(false);
    uploadBytes.mockRejectedValue(fbError('storage/unknown'));
    for (let i = 0; i < 20; i++) await flushPhotoQueue();

    // Ningún intento se marca como agotado: sigue pendiente y sube al volver.
    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('pending');
  });

  it('al recuperar la conexión sube y sale de la cola', async () => {
    await enqueueOne();
    setOnline(false);
    uploadBytes.mockRejectedValue(fbError('storage/unknown'));
    await flushPhotoQueue();
    expect((await getPhotoQueueSnapshot()).size).toBe(1);

    setOnline(true);
    uploadBytes.mockReset().mockResolvedValue(undefined);
    await flushPhotoQueue();

    expect(uploadBytes).toHaveBeenCalledTimes(1);
    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });
});

// ── Reintento manual ─────────────────────────────────────────────

describe('reintento manual', () => {
  it('limpia la marca de error y sube si la condición cambió', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unauthorized'));
    const { id } = await enqueueOne();
    await flushPhotoQueue();
    expect([...(await getPhotoQueueSnapshot()).values()][0].state).toBe('error');

    uploadBytes.mockReset().mockResolvedValue(undefined);
    await retryPhotoUpload(id);

    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });
});

// ── Dos fotos simultáneas ────────────────────────────────────────

describe('concurrencia', () => {
  // Se encola offline a propósito: así el flush automático de `enqueuePhoto`
  // no interfiere y el conteo de subidas es determinista.
  it('dos flushes en paralelo no suben la misma foto dos veces', async () => {
    setOnline(false);
    await enqueueOne();
    setOnline(true);

    await Promise.all([flushPhotoQueue(), flushPhotoQueue(), flushPhotoQueue()]);
    expect(uploadBytes).toHaveBeenCalledTimes(1);
  });

  it('dos fotos encoladas suben las dos', async () => {
    setOnline(false);
    await enqueueOne();
    await enqueueOne();
    setOnline(true);

    await flushPhotoQueue();

    expect(uploadBytes).toHaveBeenCalledTimes(2);
    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });
});

// ── Clasificación ────────────────────────────────────────────────

describe('classifyUploadError', () => {
  it.each([
    ['storage/unauthorized', 'permanent'],
    ['storage/invalid-format', 'permanent'],
    ['storage/quota-exceeded', 'permanent'],
    ['permission-denied', 'permanent'],
    ['storage/retry-limit-exceeded', 'transient'],
    ['storage/unknown', 'transient'],
    ['unavailable', 'transient'],
    ['deadline-exceeded', 'transient'],
  ])('%s → %s', (code, kind) => {
    expect(classifyUploadError(fbError(code)).kind).toBe(kind);
  });

  it('un fallo del pipeline es permanente y conserva el mensaje al usuario', () => {
    const failure = classifyUploadError(new PhotoPipelineError('decode-failed', 'No pudimos procesar esta foto.'));
    expect(failure.kind).toBe('permanent');
    expect(failure.message).toBe('No pudimos procesar esta foto.');
  });

  it('estar offline gana sobre cualquier código', () => {
    setOnline(false);
    expect(classifyUploadError(fbError('storage/unauthorized')).kind).toBe('transient');
  });
});

// ── Pasada adversarial ───────────────────────────────────────────

describe('recarga de la página con una entrada en la cola', () => {
  it('el estado de error sobrevive: la cola vive en IndexedDB, no en memoria', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unauthorized'));
    await enqueueOne();
    await flushPhotoQueue();

    // Una recarga se lleva el estado en memoria; lo que persiste es IndexedDB.
    const afterReload = await getPhotoQueueSnapshot();
    expect(afterReload.size).toBe(1);
    expect([...afterReload.values()][0].state).toBe('error');
    expect([...afterReload.values()][0].code).toBe('storage/unauthorized');
  });

  it('una entrada pendiente sobrevive y sube al volver la señal', async () => {
    setOnline(false);
    await enqueueOne();
    setOnline(true);

    // Nueva "sesión": lo único que se conserva es la cola.
    expect((await getPhotoQueueSnapshot()).size).toBe(1);
    await flushPhotoQueue();
    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });
});

describe('reintento pedido mientras hay un flush en curso', () => {
  it('no se descarta: se encadena otra pasada', async () => {
    uploadBytes.mockRejectedValue(fbError('storage/unauthorized'));
    const { id } = await enqueueOne();
    await flushPhotoQueue();
    expect([...(await getPhotoQueueSnapshot()).values()][0].state).toBe('error');

    // Un flush lento en curso mientras llega el reintento.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    uploadBytes.mockReset().mockImplementation(async () => { await gate; });

    const slow = flushPhotoQueue();
    const retry = retryPhotoUpload(id);
    release();
    await Promise.all([slow, retry]);

    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });
});

// ── Orden Firestore → Storage (carrera del objeto huérfano) ──────
//
// `storage.rules` tiene `allow delete: if false`: un objeto subido no se puede
// borrar desde la app. Por eso el permiso de Firestore tiene que quedar
// confirmado ANTES de escribir el binario. Que las dos autorizaciones no sean
// equivalentes no es teórico — `firestore.rules` deniega toda escritura en un
// proyecto `archivado` y `storage.rules` no mira esa condición (queda fijado en
// tests/rules/photoUploadContract.test.ts).

/** Etiqueta cada updateDoc según lo que escribe, para poder ordenar la traza. */
function labelUpdate(payload: Record<string, unknown>): string {
  const arr = payload.registroFotografico as { __op?: string; v?: { pending?: boolean } } | undefined;
  if (arr?.__op === 'arrayUnion') return arr.v?.pending ? 'ensure-pending' : 'union-uploaded';
  if (arr?.__op === 'arrayRemove') return 'remove-pending';
  return 'signature-write';
}

describe('orden Firestore → Storage', () => {
  let trace: string[];

  beforeEach(() => {
    trace = [];
    updateDoc.mockReset().mockImplementation(async (_ref: unknown, payload: Record<string, unknown>) => {
      trace.push(labelUpdate(payload));
    });
    uploadBytes.mockReset().mockImplementation(async () => { trace.push('upload'); });
  });

  // 1 — permission-denied de Firestore antes del upload
  it('un rechazo permanente de Firestore no llega a llamar a Storage', async () => {
    await enqueueOne();
    updateDoc.mockReset().mockRejectedValue(fbError('permission-denied'));

    await flushPhotoQueue();

    expect(uploadBytes).not.toHaveBeenCalled();
    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('error');
    expect(item.code).toBe('permission-denied');
  });

  // 6 — no queda objeto huérfano por el rechazo del primer write
  it('si el write del ref pending se rechaza, no se escribe ningún objeto en Storage', async () => {
    // El write disparado por enqueuePhoto se rechaza (proyecto archivado).
    updateDoc.mockReset().mockRejectedValue(fbError('permission-denied'));
    await enqueueOne();
    await flushPhotoQueue();
    await flushPhotoQueue();

    // Ningún uploadBytes = ningún objeto que después no se pueda borrar.
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  // 3 — reconexión: Firestore confirmado → Storage → pending:false
  it('confirma el ref pending, después sube y recién entonces marca pending:false', async () => {
    setOnline(false);
    await enqueueOne();
    setOnline(true);
    trace.length = 0; // solo interesa el orden dentro del flush

    await flushPhotoQueue();

    expect(trace).toEqual(['ensure-pending', 'upload', 'remove-pending', 'union-uploaded']);
    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });

  // 4 — transitorio de Firestore: ni upload prematuro ni error
  it('un transitorio de Firestore no sube nada y deja la foto pendiente para reintentar', async () => {
    await enqueueOne();
    updateDoc.mockReset().mockRejectedValue(fbError('unavailable'));

    await flushPhotoQueue();
    expect(uploadBytes).not.toHaveBeenCalled();
    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('pending');

    // Al recuperarse, el mismo flush completa el pipeline.
    updateDoc.mockReset().mockImplementation(async (_r: unknown, p: Record<string, unknown>) => { trace.push(labelUpdate(p)); });
    await flushPhotoQueue();

    expect(uploadBytes).toHaveBeenCalledTimes(1);
    expect((await getPhotoQueueSnapshot()).size).toBe(0);
  });

  it('quedarse sin ACK de Firestore no sube el binario ni marca error', async () => {
    // Offline al encolar: así no queda un flush de fondo compitiendo.
    setOnline(false);
    await enqueueOne();
    setOnline(true);
    // El write nunca resuelve: es lo que hace persistentLocalCache sin señal.
    updateDoc.mockReset().mockImplementation(() => new Promise(() => {}));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const flush = flushPhotoQueue();
    // Turnos de macrotarea reales para que IndexedDB resuelva y el race quede
    // armado; recién entonces se adelanta el reloj falso.
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(21_000);
    await flush;
    vi.useRealTimers();

    expect(uploadBytes).not.toHaveBeenCalled();
    const [item] = [...(await getPhotoQueueSnapshot()).values()];
    expect(item.state).toBe('pending');
  });

  // 5 — dos flush concurrentes: un solo pipeline efectivo
  it('dos flush concurrentes ejecutan un solo pipeline', async () => {
    setOnline(false);
    await enqueueOne();
    setOnline(true);
    trace.length = 0;

    await Promise.all([flushPhotoQueue(), flushPhotoQueue(), flushPhotoQueue()]);

    expect(uploadBytes).toHaveBeenCalledTimes(1);
    expect(trace.filter((t) => t === 'ensure-pending')).toHaveLength(1);
    expect(trace.filter((t) => t === 'upload')).toHaveLength(1);
  });
});

// 2 — la captura offline no espera a la red
describe('captura offline', () => {
  it('resuelve con preview y entrada en cola aunque el write de Firestore no responda', async () => {
    setOnline(false);
    // Sin señal, `updateDoc` no resuelve nunca (persistentLocalCache).
    updateDoc.mockReset().mockImplementation(() => new Promise(() => {}));

    const result = await Promise.race([
      enqueueOne(),
      new Promise<never>((_r, reject) => setTimeout(() => reject(new Error('la captura esperó a la red')), 2000)),
    ]);

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.localBlob).toBeTruthy();
    expect((await getPhotoQueueSnapshot()).size).toBe(1);
    expect([...(await getPhotoQueueSnapshot()).values()][0].state).toBe('pending');
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});


describe('firma y contenido en la misma entrada offline', () => {
  it('sincroniza el contenido aceptado antes de subir los bytes', async () => {
    setOnline(false);
    const file = new File([new Uint8Array([1])], 'firma.jpg', { type: 'image/jpeg' });
    await enqueueSignature(CODE, 'firmaCliente.firma', file, 'tec-uid', { conformidad: 'conforme', observacionesCliente: 'original' });
    expect(documentAction).not.toHaveBeenCalled();
    await flushPhotoQueue();
    expect(documentAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'capture-signature', values: { conformidad: 'conforme', observacionesCliente: 'original' } }));
    expect(documentAction.mock.invocationCallOrder[0]).toBeLessThan(uploadBytes.mock.invocationCallOrder[0]);
    expect(await getPhotoQueueSnapshot()).toHaveProperty('size', 0);
  });
  it('un reintento despues del ACK perdido no sobrescribe una firma ya subida', async () => {
    setOnline(false); getDoc.mockResolvedValue({ data: () => ({ firmaCliente: { firma: { pending: false } } }) });
    await enqueueSignature(CODE, 'firmaCliente.firma', new File([new Uint8Array([1])], 'firma.jpg'), 'tec-uid', {});
    await flushPhotoQueue();
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(await getPhotoQueueSnapshot()).toHaveProperty('size', 0);
  });
  it('un rechazo del registro de firma no sube un objeto huerfano', async () => {
    setOnline(false); documentAction.mockRejectedValue(fbError('permission-denied'));
    await enqueueSignature(CODE, 'firmaCliente.firma', new File([new Uint8Array([1])], 'firma.jpg'), 'tec-uid', {});
    setOnline(true); await flushPhotoQueue(); expect(uploadBytes).not.toHaveBeenCalled();
    expect([...await getPhotoQueueSnapshot()].map(([,value]) => value.state)).toEqual(['error']);
  });
});
