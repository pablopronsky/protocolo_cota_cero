import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';

// #P0-5 / #P0-1 — Tests de RUTA, no de la función de elegibilidad.
//
// `signEligibilityError()` y `evaluateDeliverable()` ya tienen sus unit tests;
// lo que estos prueban es que las rutas las llaman en los dos extremos y DENTRO
// de la transacción. Esa es justamente la parte que un unit test de una función
// pura no puede demostrar: que un cambio de estado ocurrido DESPUÉS de emitir
// el link invalida el link.
//
// Corren contra el emulador de Firestore con el Admin SDK real (mismas
// transacciones y queries que en producción). Solo se sustituyen la
// verificación del ID token y el bucket de Storage, que no son lo que se prueba.

const PROJECT_ID = 'cotacero-api-test';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

let app: App;
let db: Firestore;

const saved: Array<{ path: string; bytes: number }> = [];

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => db,
  getAdminAuth: () => { throw new Error('no usado en estos tests'); },
  getAdminBucket: () => ({
    file: (path: string) => ({
      save: async (buffer: Buffer) => { saved.push({ path, bytes: buffer.length }); },
      delete: async () => {},
    }),
  }),
}));

vi.mock('@/lib/auth/requireAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/requireAuth')>(
    '@/lib/auth/requireAuth',
  );
  return {
    ...actual,
    requireUser: async () => ({ uid: 'admin-uid', role: 'admin' as const }),
    requireAdmin: async () => ({ uid: 'admin-uid', role: 'admin' as const }),
  };
});

const { POST: createSignRequest } = await import('@/app/api/sign/request/route');
const signToken = await import('@/app/api/sign/[token]/route');
const { GET: getDeliverable } = await import('@/app/api/deliverable/[code]/route');

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, `api-test-${Date.now()}`);
  db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
});

afterAll(async () => { await deleteApp(app); });

const CODE = 'COTA-2026-0001';

async function wipe() {
  for (const collectionName of ['projects', 'signRequests', 'clients']) {
    const snap = await db.collection(collectionName).get();
    for (const d of snap.docs) {
      for (const sub of await d.ref.listCollections()) {
        for (const sd of (await sub.get()).docs) await sd.ref.delete();
      }
      await d.ref.delete();
    }
  }
  saved.length = 0;
}

beforeEach(wipe);

/** Obra lista para firmar: protocolo completo, RF cerrada y apta, AC abierta. */
async function seedObraLista(overrides: {
  projectStatus?: string;
  rfStatus?: string;
  aptoEntrega?: boolean;
  acStatus?: string;
  firmaCliente?: unknown;
  otStatus?: string;
} = {}) {
  const {
    projectStatus = 'en_curso', rfStatus = 'firmado', aptoEntrega = true,
    acStatus = 'en_progreso', firmaCliente = null, otStatus = 'completo',
  } = overrides;

  await db.doc(`projects/${CODE}`).set({
    code: CODE, status: projectStatus, clienteId: 'cli-1', clienteNombre: 'Juan Perez',
    domicilioObra: { calle: 'Av Siempreviva', numero: '742', localidad: 'Springfield' },
    materialInstalado: { tipo: 'laminado', descripcion: 'roble' },
    docStatus: {
      VT: 'completo', EP: 'completo', OT: otStatus,
      RF: rfStatus, AC: acStatus, FM: 'vacio',
    },
    createdAt: 1000, createdBy: 'admin-uid', updatedAt: 1000, updatedBy: 'admin-uid',
  });

  const base = (docType: string, status: string) => ({
    docType, projectCode: CODE, status,
    lockedSnapshot: null, lockedAt: null, lockedBy: null,
    createdAt: 1000, updatedAt: 1000, updatedBy: 'admin-uid', version: 0,
  });
  await db.doc(`projects/${CODE}/documents/VT`).set(base('VT', 'completo'));
  await db.doc(`projects/${CODE}/documents/EP`).set(base('EP', 'completo'));
  await db.doc(`projects/${CODE}/documents/OT`).set({ ...base('OT', otStatus), alcance: 'Colocación' });
  await db.doc(`projects/${CODE}/documents/RF`).set({ ...base('RF', rfStatus), aptoEntrega });
  await db.doc(`projects/${CODE}/documents/AC`).set({
    ...base('AC', acStatus),
    fechaActa: '', conformidad: '', observacionesCliente: '',
    firmaCliente: { nombreAclaratorio: '', dni: '', firma: firmaCliente },
    firmaCotaCero: { uid: 'admin-uid', firma: null },
  });
  await db.doc(`projects/${CODE}/documents/FM`).set(base('FM', 'vacio'));
}

// NextRequest real: las rutas leen headers, searchParams y json().
function post(url: string, body: unknown) {
  return new NextRequest(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer fake' },
    body: JSON.stringify(body),
  }));
}
function get(url: string) {
  return new NextRequest(new Request(url, { headers: { authorization: 'Bearer fake' } }));
}

const requestLink = () =>
  createSignRequest(post('http://localhost/api/sign/request', { projectCode: CODE }));

async function tokenFromDb(): Promise<string> {
  const snap = await db.collection('signRequests').get();
  return snap.docs[0].id;
}

// JPEG mínimo con los magic bytes que valida la ruta (SOI ... EOI, >= 100 bytes).
const FIRMA_JPEG = 'data:image/jpeg;base64,' + Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.alloc(200, 0x20),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');

const submit = (token: string) =>
  signToken.POST(
    post(`http://localhost/api/sign/${token}`, {
      nombreAclaratorio: 'Juan Perez', dni: '30111222',
      conformidad: 'conforme', observacionesCliente: '', firmaDataUrl: FIRMA_JPEG,
    }),
    { params: Promise.resolve({ token }) },
  );

/** Cierre presencial del acta por el admin (lo que hace setDocStatus). */
async function firmarActaComoAdmin() {
  await db.doc(`projects/${CODE}/documents/AC`).update({
    status: 'firmado', lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
    lockedSnapshot: { conformidad: 'conforme' },
  });
  await db.doc(`projects/${CODE}`).update({ 'docStatus.AC': 'firmado' });
}

// ── Emisión del link ──────────────────────────────────────────────

describe('POST /api/sign/request — no emite links para obras que no corresponden', () => {
  it('emite el link con la obra lista', async () => {
    await seedObraLista();
    const res = await requestLink();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('/firmar/');
  });

  it('request prematuro: OT todavía abierta → 409', async () => {
    await seedObraLista({ otStatus: 'en_progreso' });
    const res = await requestLink();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('OT');
  });

  it('RF no apta para entrega → 409', async () => {
    await seedObraLista({ aptoEntrega: false });
    const res = await requestLink();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('NO apta');
  });

  it('RF todavía abierta → 409', async () => {
    await seedObraLista({ rfStatus: 'en_progreso' });
    expect((await requestLink()).status).toBe(409);
  });

  it('proyecto archivado → 409', async () => {
    await seedObraLista({ projectStatus: 'archivado' });
    const res = await requestLink();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('archivada');
  });

  it('acta ya firmada → 409', async () => {
    await seedObraLista({ acStatus: 'firmado' });
    expect((await requestLink()).status).toBe(409);
  });

  it('no se apoya en docStatus: espejo "todo listo" con RF real no apta → 409', async () => {
    await seedObraLista({ aptoEntrega: false });
    // El espejo denormalizado miente; los documentos reales mandan.
    await db.doc(`projects/${CODE}`).update({
      'docStatus.RF': 'firmado', 'docStatus.AC': 'en_progreso',
    });
    expect((await requestLink()).status).toBe(409);
  });
});

// ── Consumo del link ──────────────────────────────────────────────

describe('POST /api/sign/[token] — revalida al consumir, no solo al emitir', () => {
  it('token válido sobre una obra que sigue apta → registra la firma del cliente', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    const res = await submit(token);
    expect(res.status).toBe(200);

    const ac = (await db.doc(`projects/${CODE}/documents/AC`).get()).data()!;
    // La firma remota NO cierra el acta: deja la firma del cliente y el acta
    // sigue abierta hasta que un admin la firma desde el panel. Por eso una
    // firma remota, por sí sola, todavía no produce un entregable final.
    expect(ac.status).toBe('en_progreso');
    expect(ac.firmaCliente.firma.pending).toBe(false);
    expect(ac.firmaCliente.firma.storagePath).toContain(`projects/${CODE}/AC/`);
    expect(saved).toHaveLength(1);
  });

  it('token ya usado → rechazado', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();
    expect((await submit(token)).status).toBe(200);

    expect((await submit(token)).status).toBeGreaterThanOrEqual(400);
  });

  it('proyecto ARCHIVADO después de generar el link → rechazado', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    await db.doc(`projects/${CODE}`).update({ status: 'archivado' });

    const res = await submit(token);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('archivada');
    expect((await db.doc(`projects/${CODE}/documents/AC`).get()).data()!.status)
      .toBe('en_progreso');
  });

  it('RF REABIERTA después de generar el link → rechazado', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    await db.doc(`projects/${CODE}/documents/RF`).update({ status: 'en_progreso' });

    expect((await submit(token)).status).toBe(409);
    expect((await db.doc(`projects/${CODE}/documents/AC`).get()).data()!.status)
      .toBe('en_progreso');
  });

  it('RF marcada NO APTA después de generar el link → rechazado', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    await db.doc(`projects/${CODE}/documents/RF`).update({ aptoEntrega: false });

    const res = await submit(token);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('NO apta');
  });

  it('firma PRESENCIAL concurrente después de generar el link → rechazado', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    // El admin firma el acta en la obra mientras el link sigue vivo.
    await db.doc(`projects/${CODE}/documents/AC`).update({
      status: 'firmado',
      firmaCliente: {
        nombreAclaratorio: 'Juan Perez', dni: '30111222',
        firma: {
          id: 'presencial', storagePath: `projects/${CODE}/AC/presencial.jpg`,
          takenAt: 1500, uploadedBy: 'admin-uid', pending: false,
        },
      },
    });

    // La transacción encuentra el acta ya firmada y aborta antes de escribir.
    expect((await submit(token)).status).toBe(409);
    // La firma presencial sigue intacta: el link no la pisó.
    const ac = (await db.doc(`projects/${CODE}/documents/AC`).get()).data()!;
    expect(ac.firmaCliente.firma.id).toBe('presencial');
  });

  it('el GET del link deja de servir el formulario si la obra dejó de estar apta', async () => {
    await seedObraLista();
    await requestLink();
    const token = await tokenFromDb();

    await db.doc(`projects/${CODE}/documents/RF`).update({ aptoEntrega: false });

    const res = await signToken.GET(
      get(`http://localhost/api/sign/${token}`),
      { params: Promise.resolve({ token }) },
    );
    expect(res.status).toBe(409);
  });
});

// ── Entregable ────────────────────────────────────────────────────

describe('GET /api/deliverable/[code] — el servidor decide si hay entregable final', () => {
  const call = (query = '') =>
    getDeliverable(get(`http://localhost/api/deliverable/${CODE}${query}`), {
      params: Promise.resolve({ code: CODE }),
    });

  it('sin acta firmada NIEGA el payload (403), aunque la sesión sea válida', async () => {
    await seedObraLista();
    const res = await call();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.deliverable.final).toBe(false);
    expect(body.project).toBeUndefined();
  });

  it('con acta firmada y RF apta devuelve el entregable como final', async () => {
    await seedObraLista();
    await requestLink();
    await submit(await tokenFromDb());
    await firmarActaComoAdmin();

    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).deliverable.final).toBe(true);
  });

  it('una firma remota SIN el cierre del admin todavía no es entregable final', async () => {
    await seedObraLista();
    await requestLink();
    await submit(await tokenFromDb());

    expect((await call()).status).toBe(403);
  });

  it('RF no apta con acta firmada NO es final (solo preview, marcado borrador)', async () => {
    await seedObraLista();
    await requestLink();
    await submit(await tokenFromDb());
    await firmarActaComoAdmin();
    await db.doc(`projects/${CODE}/documents/RF`).update({ aptoEntrega: false });

    expect((await call()).status).toBe(403);
    const preview = await call('?preview=1');
    expect(preview.status).toBe(200);
    expect((await preview.json()).deliverable.final).toBe(false);
  });

  it('el preview de una obra sin firmar se entrega SIEMPRE marcado no-final', async () => {
    await seedObraLista();
    const res = await call('?preview=1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deliverable.final).toBe(false);
    expect(body.deliverable.reasons.join(' ')).toContain('acta');
  });

  it('docStatus manipulado a "todo firmado" no alcanza para un entregable final', async () => {
    await seedObraLista();
    await db.doc(`projects/${CODE}`).update({
      'docStatus.AC': 'firmado', 'docStatus.RF': 'firmado', status: 'entregado',
    });
    expect((await call()).status).toBe(403);
  });
});
