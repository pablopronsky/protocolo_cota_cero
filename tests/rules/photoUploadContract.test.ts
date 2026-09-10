import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MAX_UPLOAD_BYTES, UPLOAD_MIME } from '@/lib/imageNormalize';

// #P1 — El contrato que el cliente cree tener con Storage, verificado.
//
// El blocker de cámara física fue exactamente una discrepancia entre los dos
// lados: `compressImage()` podía devolver un `image/heic` y `storage.rules` solo
// acepta `image/(jpeg|png|webp)`. Nadie lo notó porque ningún test comparaba lo
// que el cliente produce con lo que las reglas admiten. Estos tests fijan esa
// frontera: si alguien afloja el pipeline o endurece las reglas, falla acá.
//
// Mismo projectId que firestore.test.ts / storage.test.ts a propósito: las
// Storage Rules resuelven `firestore.get()` contra el proyecto del emulador.
const PROJECT_ID = 'cotacero-test';
const CODE = 'COTA-2026-0001';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 18080,
    },
    storage: {
      rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'),
      host: '127.0.0.1', port: 19199,
    },
  });
}, 60_000);

afterAll(async () => { await testEnv.cleanup(); });
afterEach(async () => { await testEnv.clearFirestore(); await testEnv.clearStorage(); });

function tecnico() {
  return testEnv.authenticatedContext('tec-uid', { role: 'tecnico' }).storage();
}

async function seedDocStatus(docType: string, status: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'projects', CODE, 'documents', docType), {
      docType, projectCode: CODE, status,
    });
  });
}

const small = new Uint8Array(1024);

function put(name: string, bytes: Uint8Array, contentType: string) {
  return uploadBytes(ref(tecnico(), `projects/${CODE}/VT/${name}.jpg`), bytes, { contentType });
}

describe('lo que produce el pipeline es exactamente lo que Storage acepta', () => {
  it(`acepta el MIME que produce normalizeImage (${UPLOAD_MIME})`, async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertSucceeds(put('normalizada', small, UPLOAD_MIME));
  });

  // Las reglas siguen aceptando png/webp (no se relajan ni se endurecen acá),
  // pero el cliente ya no los produce: todo sale como JPEG.
  it.each(['image/png', 'image/webp'])('sigue aceptando %s', async (mime) => {
    await seedDocStatus('VT', 'en_progreso');
    await assertSucceeds(put(`ok-${mime.split('/')[1]}`, small, mime));
  });

  // Regresión del blocker: esto es lo que subía la versión anterior con una
  // captura de iPhone/Android en HEIC, y lo que Storage rechazaba en silencio.
  it.each(['image/heic', 'image/heif', 'image/gif', 'application/octet-stream', ''])(
    'rechaza %s — el pipeline nunca debe llegar a intentarlo',
    async (mime) => {
      await seedDocStatus('VT', 'en_progreso');
      await assertFails(put('rechazada', small, mime));
    },
  );

  it('rechaza un archivo por encima del tope que valida assertUploadable', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(put('pesada', new Uint8Array(MAX_UPLOAD_BYTES + 1024), UPLOAD_MIME));
  });

  it('acepta un archivo justo por debajo del tope', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertSucceeds(put('al-limite', new Uint8Array(MAX_UPLOAD_BYTES - 1024), UPLOAD_MIME));
  }, 60_000);

  // El caso que la cola debe clasificar como permanente y mostrar al usuario.
  it.each(['completo', 'firmado'])(
    'documento %s: la subida se rechaza (permission-denied para la cola)',
    async (status) => {
      await seedDocStatus('VT', status);
      await assertFails(put('cerrada', small, UPLOAD_MIME));
    },
  );
});

describe('el tope del cliente no se puede desincronizar de la regla', () => {
  it('MAX_UPLOAD_BYTES coincide con el límite escrito en storage.rules', () => {
    const rules = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');
    expect(rules).toContain('request.resource.size < 10 * 1024 * 1024');
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('el MIME del cliente está entre los que acepta la regla', () => {
    const rules = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');
    expect(rules).toContain("request.resource.contentType.matches('image/(jpeg|png|webp)')");
    expect(UPLOAD_MIME).toBe('image/jpeg');
  });
});

// Por qué el flush confirma el PhotoRef en Firestore ANTES de subir el binario.
//
// Las dos autorizaciones no son equivalentes: `firestore.rules` deniega toda
// escritura sobre un proyecto `archivado` (`projectArchived`), condición que
// `storage.rules` no mira — solo mira `docIsOpen` y `actaFirmada`. Con un
// proyecto archivado y una VT todavía abierta, Firestore rechaza el ref y
// Storage acepta el archivo. Como `allow delete: if false`, ese objeto queda
// para siempre. El orden del flush es lo que lo vuelve inalcanzable; este test
// existe para que la divergencia no se pierda de vista si alguien toca alguna
// de las dos reglas.
describe('divergencia Firestore/Storage que obliga a ordenar el flush', () => {
  it('proyecto archivado con VT abierta: Firestore deniega el ref pero Storage aceptaría el binario', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'projects', CODE), { code: CODE, status: 'archivado' });
      await setDoc(doc(db, 'projects', CODE, 'documents', 'VT'), {
        docType: 'VT', projectCode: CODE, status: 'en_progreso', version: 1, registroFotografico: [],
      });
    });

    const tec = testEnv.authenticatedContext('tec-uid', { role: 'tecnico' });
    const photoRef = {
      id: 'huerfana', storagePath: `projects/${CODE}/VT/huerfana.jpg`,
      takenAt: 1, uploadedBy: 'tec-uid', pending: true,
    };

    // Firestore: denegado por proyecto archivado.
    await assertFails(updateDoc(doc(tec.firestore(), 'projects', CODE, 'documents', 'VT'), {
      registroFotografico: arrayUnion(photoRef), updatedAt: Date.now(), updatedBy: 'tec-uid',
    }));

    // Storage: lo aceptaría. De ahí el riesgo de objeto huérfano si se subiera
    // antes de confirmar el ref — el pipeline nunca llega acá (ver
    // tests/unit/photoQueue.test.ts, "orden Firestore → Storage").
    await assertSucceeds(uploadBytes(
      ref(tec.storage(), `projects/${CODE}/VT/huerfana.jpg`), small, { contentType: UPLOAD_MIME },
    ));
  }, 60_000);
});
