import { beforeAll, afterAll, afterEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// #P0-4 — Inmutabilidad real de los binarios.
//
// Firestore congela el `storagePath` dentro del `lockedSnapshot`, pero eso solo
// vale si el objeto que hay detrás no se puede pisar ni borrar. Estos tests son
// adversariales: atacan Storage directamente con el SDK, que es lo que puede
// hacer cualquiera con una sesión válida, sin pasar por la UI.
//
// Mismo projectId que firestore.test.ts a propósito: el `firestore.get()` de
// las Storage Rules resuelve contra el proyecto con el que arrancó el emulador,
// no contra el del contexto de test, así que un projectId distinto haría que la
// regla no encuentre nunca el documento y denegara todo. Los dos archivos no se
// pisan porque `fileParallelism` está apagado en vitest.config.ts.
const PROJECT_ID = 'cotacero-test';
const CODE = 'COTA-2026-0001';

// JPEG mínimo válido (SOI + EOI).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
    storage: {
      rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'),
      host: '127.0.0.1', port: 9199,
    },
  });
}, 60_000);

afterAll(async () => { await testEnv.cleanup(); });

afterEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

// ── Helpers ───────────────────────────────────────────────────────

function adminStorage() {
  return testEnv.authenticatedContext('admin-uid', { role: 'admin' }).storage();
}
function tecnicoStorage() {
  return testEnv.authenticatedContext('tec-uid', { role: 'tecnico' }).storage();
}
function noRoleStorage() {
  return testEnv.authenticatedContext('no-role-uid').storage();
}
function unauthStorage() {
  return testEnv.unauthenticatedContext().storage();
}

/** Estado real del documento en Firestore: es lo que consultan las reglas. */
async function seedDocStatus(docType: string, status: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'projects', CODE, 'documents', docType), {
      docType, projectCode: CODE, status,
    });
  });
}

/** Deja un objeto ya existente en Storage, sin pasar por las reglas. */
async function seedFile(path: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), JPEG, { contentType: 'image/jpeg' });
  });
}

const upload = (
  storage: ReturnType<typeof adminStorage>,
  path: string,
  bytes: Uint8Array = JPEG,
) => uploadBytes(ref(storage, path), bytes, { contentType: 'image/jpeg' });

// ── 1. Alta durante edición ───────────────────────────────────────

describe('1 - subir archivo durante edicion', () => {
  it('admin puede subir a un documento abierto', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertSucceeds(upload(adminStorage(), `projects/${CODE}/VT/foto-a.jpg`));
  });

  it('tecnico puede subir a un documento suyo abierto', async () => {
    await seedDocStatus('RF', 'en_progreso');
    await assertSucceeds(upload(tecnicoStorage(), `projects/${CODE}/RF/foto-b.jpg`));
  });

  it('admin puede subir la firma del acta mientras el acta esta abierta', async () => {
    await seedDocStatus('AC', 'en_progreso');
    await assertSucceeds(upload(adminStorage(), `projects/${CODE}/AC/firma.jpg`));
  });

  it('un documento vacio tambien admite subidas', async () => {
    await seedDocStatus('VT', 'vacio');
    await assertSucceeds(upload(adminStorage(), `projects/${CODE}/VT/foto-c.jpg`));
  });
});

// ── 2. Reemplazo durante edición: comportamiento definido ─────────

describe('2 - reemplazar archivo durante edicion', () => {
  // Definido como PERMITIDO a propósito: flushPhotoQueue() reintenta una subida
  // cuyo updateDoc posterior falló, y ese reintento pisa el mismo objeto.
  it('admin puede sobrescribir un objeto de un documento abierto (reintento de la cola)', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await seedFile(`projects/${CODE}/VT/foto-d.jpg`);
    await assertSucceeds(upload(adminStorage(), `projects/${CODE}/VT/foto-d.jpg`));
  });

  it('nadie puede borrar un objeto ni siquiera con el documento abierto', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await seedFile(`projects/${CODE}/VT/foto-e.jpg`);
    await assertFails(deleteObject(ref(adminStorage(), `projects/${CODE}/VT/foto-e.jpg`)));
  });
});

// ── 3 y 4. Documento cerrado: inmutable ───────────────────────────

describe('3 - reemplazar archivo de documento cerrado', () => {
  for (const status of ['completo', 'firmado']) {
    it(`admin NO puede sobrescribir un objeto de un documento ${status}`, async () => {
      await seedDocStatus('VT', status);
      await seedFile(`projects/${CODE}/VT/congelada.jpg`);
      await assertFails(upload(adminStorage(), `projects/${CODE}/VT/congelada.jpg`));
    });

    it(`tecnico NO puede sobrescribir un objeto de un documento ${status}`, async () => {
      await seedDocStatus('RF', status);
      await seedFile(`projects/${CODE}/RF/congelada.jpg`);
      await assertFails(upload(tecnicoStorage(), `projects/${CODE}/RF/congelada.jpg`));
    });
  }

  it('admin NO puede sustituir la firma del cliente de un acta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedFile(`projects/${CODE}/AC/firma-cliente.jpg`);
    await assertFails(upload(adminStorage(), `projects/${CODE}/AC/firma-cliente.jpg`));
  });

  it('admin tampoco puede subir un objeto NUEVO a un documento cerrado', async () => {
    await seedDocStatus('VT', 'completo');
    await assertFails(upload(adminStorage(), `projects/${CODE}/VT/colada.jpg`));
  });
});

describe('4 - borrar archivo de documento cerrado', () => {
  it('admin NO puede borrar un objeto de un documento completo', async () => {
    await seedDocStatus('VT', 'completo');
    await seedFile(`projects/${CODE}/VT/borrame.jpg`);
    await assertFails(deleteObject(ref(adminStorage(), `projects/${CODE}/VT/borrame.jpg`)));
  });

  it('admin NO puede borrar la firma de un acta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedFile(`projects/${CODE}/AC/firma-cliente.jpg`);
    await assertFails(deleteObject(ref(adminStorage(), `projects/${CODE}/AC/firma-cliente.jpg`)));
  });

  it('tecnico NO puede borrar un objeto de una RF firmada', async () => {
    await seedDocStatus('RF', 'firmado');
    await seedFile(`projects/${CODE}/RF/evidencia.jpg`);
    await assertFails(deleteObject(ref(tecnicoStorage(), `projects/${CODE}/RF/evidencia.jpg`)));
  });
});

// ── 5. Separación de roles ────────────────────────────────────────

describe('5 - tecnico escribiendo AC/FM', () => {
  for (const docType of ['AC', 'FM']) {
    it(`tecnico NO puede subir a ${docType} aunque este abierto`, async () => {
      await seedDocStatus(docType, 'en_progreso');
      await assertFails(upload(tecnicoStorage(), `projects/${CODE}/${docType}/intento.jpg`));
    });

    it(`tecnico NO puede sobrescribir un objeto de ${docType}`, async () => {
      await seedDocStatus(docType, 'en_progreso');
      await seedFile(`projects/${CODE}/${docType}/existente.jpg`);
      await assertFails(upload(tecnicoStorage(), `projects/${CODE}/${docType}/existente.jpg`));
    });
  }
});

// ── Restricciones que ya existían: no se perdieron ────────────────

describe('restricciones preexistentes (MIME, tamano, path, sesion)', () => {
  it('rechaza a un usuario no autenticado', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(upload(unauthStorage(), `projects/${CODE}/VT/anon.jpg`));
  });

  it('rechaza a una cuenta autenticada sin rol de la app', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(upload(noRoleStorage(), `projects/${CODE}/VT/sinrol.jpg`));
  });

  it('rechaza un contentType que no es imagen', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(uploadBytes(
      ref(adminStorage(), `projects/${CODE}/VT/script.jpg`),
      JPEG,
      { contentType: 'application/pdf' },
    ));
  });

  it('rechaza un archivo de mas de 10 MB', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(uploadBytes(
      ref(adminStorage(), `projects/${CODE}/VT/gigante.jpg`),
      new Uint8Array(11 * 1024 * 1024),
      { contentType: 'image/jpeg' },
    ));
  });

  it('rechaza un codigo de obra con formato invalido', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(upload(adminStorage(), 'projects/NO-ES-UN-CODIGO/VT/foto.jpg'));
  });

  it('rechaza un docType que no existe', async () => {
    await seedDocStatus('XX', 'en_progreso');
    await assertFails(upload(adminStorage(), `projects/${CODE}/XX/foto.jpg`));
  });

  it('rechaza una extension que no es de imagen', async () => {
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(upload(adminStorage(), `projects/${CODE}/VT/payload.svg`));
  });

  it('rechaza si el documento de Firestore no existe (fail-closed)', async () => {
    await assertFails(upload(adminStorage(), `projects/${CODE}/VT/huerfana.jpg`));
  });
});

// ── Lectura: el legajo cerrado tiene que seguir imprimiéndose ──────

describe('lectura', () => {
  it('admin puede leer un objeto de un documento cerrado', async () => {
    await seedDocStatus('VT', 'firmado');
    await seedFile(`projects/${CODE}/VT/evidencia.jpg`);
    await assertSucceeds(getBytes(ref(adminStorage(), `projects/${CODE}/VT/evidencia.jpg`)));
  });

  it('un usuario sin sesion no puede leer', async () => {
    await seedDocStatus('VT', 'firmado');
    await seedFile(`projects/${CODE}/VT/evidencia.jpg`);
    await assertFails(getBytes(ref(unauthStorage(), `projects/${CODE}/VT/evidencia.jpg`)));
  });
});

// ── 9. Acta firmada: el legajo entero queda congelado ─────────────
//
// El ataque que cubre este bloque: `docIsOpen` mira el documento que da nombre
// al path, pero el path lo elige quien escribe el PhotoRef en Firestore. Un
// escritor directo puede dejar la firma del acta —o una foto de una VT ya
// cerrada— bajo el docType de un documento que sigue abierto (FM no se cierra
// nunca en el flujo real) y sustituir el JPEG después de firmar. Con el acta
// firmada no se escribe ningún archivo del proyecto, y la vía desaparece.

describe('9 - acta firmada congela los archivos de toda la obra', () => {
  it('admin NO puede subir a FM (abierto) si el acta ya esta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedDocStatus('FM', 'en_progreso');
    await assertFails(upload(adminStorage(), `projects/${CODE}/FM/plantado.jpg`));
  });

  it('admin NO puede sustituir un objeto guardado bajo FM si el acta esta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedDocStatus('FM', 'en_progreso');
    await seedFile(`projects/${CODE}/FM/plantado.jpg`);
    await assertFails(upload(adminStorage(), `projects/${CODE}/FM/plantado.jpg`));
  });

  it('tecnico NO puede subir a una VT abierta si el acta ya esta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedDocStatus('VT', 'en_progreso');
    await assertFails(upload(tecnicoStorage(), `projects/${CODE}/VT/tardia.jpg`));
  });

  // Control: la misma escritura es válida mientras el acta no esté firmada.
  it('la misma subida a FM SI se permite con el acta todavia en progreso', async () => {
    await seedDocStatus('AC', 'en_progreso');
    await seedDocStatus('FM', 'en_progreso');
    await assertSucceeds(upload(adminStorage(), `projects/${CODE}/FM/plantado.jpg`));
  });

  it('leer sigue permitido con el acta firmada', async () => {
    await seedDocStatus('AC', 'firmado');
    await seedFile(`projects/${CODE}/AC/firma.jpg`);
    await assertSucceeds(getBytes(ref(adminStorage(), `projects/${CODE}/AC/firma.jpg`)));
  });
});
