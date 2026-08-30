import { beforeAll, afterAll, afterEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'cotacero-test';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}, 30_000);

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

// ── Helpers ───────────────────────────────────────────────────────

function admin() {
  return testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
}
function tecnico(uid = 'tec-uid') {
  return testEnv.authenticatedContext(uid, { role: 'tecnico' }).firestore();
}
function noRole() {
  return testEnv.authenticatedContext('no-role-uid').firestore();
}
function unauth() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedProject(code: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'projects', code), data);
  });
}

async function seedDoc(
  projectCode: string,
  docType: string,
  data: Record<string, unknown>,
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'projects', projectCode, 'documents', docType),
      {
        docType,
        projectCode,
        status: 'vacio',
        lockedSnapshot: null,
        lockedAt: null,
        lockedBy: null,
        createdAt: 1000,
        updatedAt: 1000,
        updatedBy: 'admin-uid',
        version: 0,
        ...data,
      },
    );
  });
}

const BASE_PROJECT = {
  code: 'P-2025-001',
  status: 'borrador',
  createdAt: 1000,
  createdBy: 'admin-uid',
  updatedAt: 1000,
  updatedBy: 'admin-uid',
  clienteNombre: 'Test Cliente',
  docStatus: {
    VT: 'vacio', EP: 'vacio', OT: 'vacio',
    RF: 'vacio', AC: 'vacio', FM: 'vacio',
  },
};

// ── Authentication gate ───────────────────────────────────────────

describe('Authentication gate', () => {
  it('denies unauthenticated read on projects', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(getDoc(doc(unauth(), 'projects', 'P-2025-001')));
  });

  it('allows admin read on projects', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertSucceeds(getDoc(doc(admin(), 'projects', 'P-2025-001')));
  });

  it('denies authenticated accounts without an application role', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(getDoc(doc(noRole(), 'projects', 'P-2025-001')));
  });

  it('allows técnico read on projects', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertSucceeds(getDoc(doc(tecnico(), 'projects', 'P-2025-001')));
  });

  it('denies unauthenticated read on documents', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'vacio' });
    await assertFails(
      getDoc(doc(unauth(), 'projects', 'P-2025-001', 'documents', 'VT')),
    );
  });
});

// ── Project create ────────────────────────────────────────────────

describe('Project create', () => {
  it('admin can create a project', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'projects', 'P-2025-001'), BASE_PROJECT),
    );
  });

  it('técnico cannot create a project', async () => {
    await assertFails(
      setDoc(doc(tecnico(), 'projects', 'P-2025-001'), BASE_PROJECT),
    );
  });

  it('unauthenticated cannot create a project', async () => {
    await assertFails(
      setDoc(doc(unauth(), 'projects', 'P-2025-001'), BASE_PROJECT),
    );
  });
});

// ── Project delete ────────────────────────────────────────────────

describe('Project delete', () => {
  it('admin can delete a project', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertSucceeds(deleteDoc(doc(admin(), 'projects', 'P-2025-001')));
  });

  it('técnico cannot delete a project', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(deleteDoc(doc(tecnico(), 'projects', 'P-2025-001')));
  });
});

// ── Admin createdAt/createdBy freeze (item 11) ────────────────────

describe('Admin createdAt/createdBy freeze', () => {
  it('admin cannot mutate createdAt', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(admin(), 'projects', 'P-2025-001'), { createdAt: 9999 }),
    );
  });

  it('admin cannot mutate createdBy', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(admin(), 'projects', 'P-2025-001'), { createdBy: 'other' }),
    );
  });
});

// ── Técnico update restrictions ───────────────────────────────────

describe('Técnico update restrictions', () => {
  it('técnico can update allowed fields', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertSucceeds(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'en_curso',
        docStatus: {
          VT: 'en_progreso', EP: 'vacio', OT: 'vacio',
          RF: 'vacio', AC: 'vacio', FM: 'vacio',
        },
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico cannot update clienteNombre', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        clienteNombre: 'Hacker',
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico cannot forge updatedBy', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'en_curso',
        docStatus: BASE_PROJECT.docStatus,
        updatedAt: 2000,
        updatedBy: 'other-uid', // forged — must match auth.uid
      }),
    );
  });

  it('técnico cannot skip status (borrador → entregado)', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'entregado',
        docStatus: BASE_PROJECT.docStatus,
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico cannot roll back status (en_curso → borrador)', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'en_curso' });
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'borrador',
        docStatus: BASE_PROJECT.docStatus,
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico cannot mark entregado without firmado AC', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'en_curso' });
    await seedDoc('P-2025-001', 'AC', { status: 'completo' }); // NOT firmado
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'entregado',
        docStatus: { ...BASE_PROJECT.docStatus, AC: 'completo' },
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico can mark entregado when AC is firmado', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'en_curso' });
    await seedDoc('P-2025-001', 'AC', { status: 'firmado' });
    await assertSucceeds(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'entregado',
        docStatus: { ...BASE_PROJECT.docStatus, AC: 'firmado' },
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });

  it('técnico cannot use invalid status value', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await assertFails(
      updateDoc(doc(tecnico(), 'projects', 'P-2025-001'), {
        status: 'publicado', // not in enum
        docStatus: BASE_PROJECT.docStatus,
        updatedAt: 2000,
        updatedBy: 'tec-uid',
      }),
    );
  });
});

// ── Document access control ───────────────────────────────────────

describe('Document access control', () => {
  it('técnico can write VT', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'vacio' });
    await assertSucceeds(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { status: 'en_progreso', updatedAt: 2000, updatedBy: 'tec-uid' },
      ),
    );
  });

  it('técnico can write EP', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'EP', { status: 'vacio' });
    await assertSucceeds(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'EP'),
        { status: 'en_progreso', updatedAt: 2000, updatedBy: 'tec-uid' },
      ),
    );
  });

  it('técnico cannot write AC', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'AC', { status: 'vacio' });
    await assertFails(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'AC'),
        { status: 'en_progreso' },
      ),
    );
  });

  it('técnico cannot write FM', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'FM', { status: 'vacio' });
    await assertFails(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'FM'),
        { status: 'en_progreso' },
      ),
    );
  });

  it('admin can write AC', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'AC', { status: 'vacio' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'AC'),
        { status: 'en_progreso' },
      ),
    );
  });

  it('admin can write FM', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'FM', { status: 'vacio' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'FM'),
        { status: 'en_progreso' },
      ),
    );
  });

  it('nobody can write a locked document (status=completo)', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'completo' });
    await assertFails(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { status: 'firmado' },
      ),
    );
  });

  it('nobody can mutate content of a locked document (status=firmado)', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'AC', { status: 'firmado' });
    await assertFails(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'AC'),
        { observacionesCliente: 'mutado' },
      ),
    );
  });

  // #19 — la única salida de un doc bloqueado es la transición exacta de
  // reopen (→ en_progreso, tocando solo los campos del batch), y solo admin.
  // #P0-3 — El acta FIRMADA quedó fuera de esa salida (ver bloque dedicado más
  // abajo); una RF firmada sí se reabre, es el circuito de corrección de obra.
  it('admin can reopen a firmado doc (exact transition)', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'RF', { status: 'firmado' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'RF'),
        {
          status: 'en_progreso', updatedAt: 2000, updatedBy: 'admin-uid',
          reopenedAt: 2000, reopenedBy: 'admin-uid',
          lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 1,
        },
      ),
    );
  });

  it('admin can reopen an AC that is completo but not signed', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'AC', { status: 'completo' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'AC'),
        {
          status: 'en_progreso', updatedAt: 2000, updatedBy: 'admin-uid',
          reopenedAt: 2000, reopenedBy: 'admin-uid',
          lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 1,
        },
      ),
    );
  });

  it('técnico cannot reopen a locked doc', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'completo' });
    await assertFails(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { status: 'en_progreso', updatedAt: 2000, updatedBy: 'tec-uid', reopenedAt: 2000, reopenedBy: 'tec-uid' },
      ),
    );
  });
});

// ── Sign requests (firma remota) ──────────────────────────────────

describe('Sign requests are Admin-SDK only', () => {
  it('admin cannot read a sign request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'signRequests', 'tok-123'), {
        projectCode: 'P-2025-001', status: 'pending',
      });
    });
    await assertFails(getDoc(doc(admin(), 'signRequests', 'tok-123')));
  });

  it('admin cannot write a sign request', async () => {
    await assertFails(
      setDoc(doc(admin(), 'signRequests', 'tok-456'), {
        projectCode: 'P-2025-001', status: 'pending',
      }),
    );
  });

  it('técnico cannot read a sign request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'signRequests', 'tok-789'), {
        projectCode: 'P-2025-001', status: 'pending',
      });
    });
    await assertFails(getDoc(doc(tecnico(), 'signRequests', 'tok-789')));
  });
});

// ── Archived project is read-only ─────────────────────────────────

describe('Archived project documents are read-only', () => {
  it('admin cannot write a document of an archived project', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'archivado' });
    await seedDoc('P-2025-001', 'VT', { status: 'en_progreso' });
    await assertFails(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { observaciones: 'edición sobre archivado' },
      ),
    );
  });

  it('técnico cannot write a document of an archived project', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'archivado' });
    await seedDoc('P-2025-001', 'VT', { status: 'en_progreso' });
    await assertFails(
      updateDoc(
        doc(tecnico(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { status: 'en_progreso', observaciones: 'edición sobre archivado' },
      ),
    );
  });

  it('documents are writable again on a non-archived project', async () => {
    await seedProject('P-2025-001', { ...BASE_PROJECT, status: 'en_curso' });
    await seedDoc('P-2025-001', 'VT', { status: 'en_progreso' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'VT'),
        { observaciones: 'edición normal' },
      ),
    );
  });
});

// ── Sequencing enforcement (item 21 in rules) ─────────────────────

describe('Sequencing enforcement', () => {
  it('cannot close EP if VT is not closed', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'en_progreso' });
    await seedDoc('P-2025-001', 'EP', { status: 'en_progreso' });
    await assertFails(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'EP'),
        {
          status: 'completo', updatedAt: 2000, updatedBy: 'admin-uid',
          lockedSnapshot: {}, lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
        },
      ),
    );
  });

  it('can close EP when VT is closed', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'completo' });
    await seedDoc('P-2025-001', 'EP', { status: 'en_progreso' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'EP'),
        {
          status: 'completo', updatedAt: 2000, updatedBy: 'admin-uid',
          lockedSnapshot: {}, lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
        },
      ),
    );
  });

  it('can close VT without any prerequisite', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'en_progreso' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'VT'),
        {
          status: 'completo', updatedAt: 2000, updatedBy: 'admin-uid',
          lockedSnapshot: {}, lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
        },
      ),
    );
  });

  it('cannot sign AC if RF marks obra NOT apto para entrega', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'RF', { status: 'completo', aptoEntrega: false });
    await seedDoc('P-2025-001', 'AC', { status: 'en_progreso' });
    await assertFails(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'AC'),
        {
          status: 'firmado', updatedAt: 2000, updatedBy: 'admin-uid',
          lockedSnapshot: {}, lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
        },
      ),
    );
  });

  it('can sign AC when RF is apto para entrega', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'RF', { status: 'completo', aptoEntrega: true });
    await seedDoc('P-2025-001', 'AC', { status: 'en_progreso' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'AC'),
        {
          status: 'firmado', updatedAt: 2000, updatedBy: 'admin-uid',
          lockedSnapshot: {}, lockedAt: 2000, lockedBy: 'admin-uid', version: 1,
          // Firmar exige una firma del cliente ya subida (ver P0-3/P0-4).
          firmaCliente: {
            nombreAclaratorio: 'Juan Perez', dni: '30111222',
            firma: {
              id: 'f1', storagePath: 'projects/P-2025-001/AC/f1.jpg',
              takenAt: 1400, uploadedBy: 'admin-uid', pending: false,
            },
          },
        },
      ),
    );
  });

  it('can save EP in_progreso without VT closed (autosave not gated)', async () => {
    await seedProject('P-2025-001', BASE_PROJECT);
    await seedDoc('P-2025-001', 'VT', { status: 'vacio' });
    await seedDoc('P-2025-001', 'EP', { status: 'vacio' });
    await assertSucceeds(
      updateDoc(
        doc(admin(), 'projects', 'P-2025-001', 'documents', 'EP'),
        { status: 'en_progreso' },
      ),
    );
  });
});

// ── Revisions: append-only (item 10) ─────────────────────────────

describe('Revisions append-only', () => {
  const validRevision = {
    docType: 'VT',
    projectCode: 'P-2025-001',
    action: 'en_progreso',
    snapshot: { status: 'en_progreso' },
    version: 1,
    by: 'tec-uid',
    at: serverTimestamp(),
  };

  it('signed-in user can create a well-formed revision', async () => {
    await assertSucceeds(
      addDoc(collection(tecnico(), 'projects', 'P-2025-001', 'revisions'), validRevision),
    );
  });

  it('cannot create revision with forged by field', async () => {
    await assertFails(
      addDoc(collection(tecnico(), 'projects', 'P-2025-001', 'revisions'), {
        ...validRevision,
        by: 'other-uid',
      }),
    );
  });

  it('cannot create revision with client-side timestamp', async () => {
    await assertFails(
      addDoc(collection(tecnico(), 'projects', 'P-2025-001', 'revisions'), {
        ...validRevision,
        at: Date.now(),
      }),
    );
  });

  it('cannot create revision with extra untrusted fields', async () => {
    await assertFails(
      addDoc(collection(tecnico(), 'projects', 'P-2025-001', 'revisions'), {
        ...validRevision,
        forged: true,
      }),
    );
  });

  it('unauthenticated cannot create revision', async () => {
    await assertFails(
      addDoc(collection(unauth(), 'projects', 'P-2025-001', 'revisions'), validRevision),
    );
  });
});

// Users collection

describe('Users collection', () => {
  it('admin can write user', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'users', 'new-uid'), {
        role: 'tecnico', nombre: 'Juan Test', email: 'j@test.com', activo: true,
      }),
    );
  });

  it('técnico cannot write user', async () => {
    await assertFails(
      setDoc(doc(tecnico(), 'users', 'new-uid'), { role: 'admin' }),
    );
  });

  it('signed-in user can read users', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'some-uid'), { nombre: 'Test' });
    });
    await assertSucceeds(getDoc(doc(tecnico(), 'users', 'some-uid')));
  });
});

// ── Clients collection ────────────────────────────────────────────

describe('Clients collection', () => {
  it('signed-in user can read clients', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clients', 'c-001'), { nombre: 'Test' });
    });
    await assertSucceeds(getDoc(doc(admin(), 'clients', 'c-001')));
  });

  it('admin cannot write client directly (only Admin SDK)', async () => {
    await assertFails(
      setDoc(doc(admin(), 'clients', 'c-001'), { nombre: 'Directo' }),
    );
  });

  it('técnico cannot write client', async () => {
    await assertFails(
      setDoc(doc(tecnico(), 'clients', 'c-001'), { nombre: 'Hack' }),
    );
  });
});

// ── Config collection ─────────────────────────────────────────────

describe('Config collection', () => {
  it('admin can write config', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'config', 'template'), { updatedBy: 'admin-uid' }),
    );
  });

  it('técnico cannot write config', async () => {
    await assertFails(
      setDoc(doc(tecnico(), 'config', 'template'), { updatedBy: 'tec-uid' }),
    );
  });

  it('técnico can read config', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'config', 'template'), { data: 'x' });
    });
    await assertSucceeds(getDoc(doc(tecnico(), 'config', 'template')));
  });
});

// ── #P0-3 — El acta firmada es definitiva ─────────────────────────
//
// Tests adversariales: no alcanza con que la UI no ofrezca el botón. Estos
// intentan romper la inmutabilidad del acta firmada directamente por el SDK,
// que es la vía que tiene cualquiera con una sesión de admin.

describe('AC firmada es inmutable (P0-3)', () => {
  const CODE = 'P-2025-001';

  async function seedActaFirmada() {
    await seedProject(CODE, {
      ...BASE_PROJECT,
      status: 'entregado',
      docStatus: { ...BASE_PROJECT.docStatus, RF: 'firmado', AC: 'firmado' },
    });
    await seedDoc(CODE, 'RF', { status: 'firmado', aptoEntrega: true });
    await seedDoc(CODE, 'AC', {
      status: 'firmado',
      version: 1,
      lockedSnapshot: { conformidad: 'conforme' },
      lockedAt: 1500,
      lockedBy: 'admin-uid',
      conformidad: 'conforme',
      observacionesCliente: 'sin observaciones',
      firmaCliente: {
        nombreAclaratorio: 'Juan Perez',
        dni: '30111222',
        firma: { id: 'f1', storagePath: `projects/${CODE}/AC/f1.jpg`, takenAt: 1400, uploadedBy: 'admin-uid', pending: false },
      },
    });
  }

  // Una firma del cliente válida: ya subida a Storage y bajo el path del acta.
  const FIRMA_SUBIDA = {
    id: 'f1', storagePath: `projects/${CODE}/AC/f1.jpg`,
    takenAt: 1400, uploadedBy: 'admin-uid', pending: false,
  };

  async function seedActaEnProgreso() {
    await seedProject(CODE, {
      ...BASE_PROJECT,
      docStatus: { ...BASE_PROJECT.docStatus, RF: 'firmado', AC: 'en_progreso' },
    });
    await seedDoc(CODE, 'RF', { status: 'firmado', aptoEntrega: true });
    await seedDoc(CODE, 'AC', { status: 'en_progreso', version: 0 });
  }

  // El write exacto que hace setDocStatus() al firmar, con la firma variable.
  function firmarCon(firma: unknown) {
    return {
      status: 'firmado',
      conformidad: 'conforme',
      firmaCliente: { nombreAclaratorio: 'Juan Perez', dni: '30111222', firma },
      version: 1,
      lockedSnapshot: { conformidad: 'conforme' },
      lockedAt: 2000,
      lockedBy: 'admin-uid',
      updatedAt: 2000,
      updatedBy: 'admin-uid',
    };
  }

  const acRef = (db: ReturnType<typeof admin>) =>
    doc(db, 'projects', CODE, 'documents', 'AC');

  it('1 · admin NO puede reabrir el acta firmada (transición exacta de reopen)', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        status: 'en_progreso', updatedAt: 2000, updatedBy: 'admin-uid',
        reopenedAt: 2000, reopenedBy: 'admin-uid',
        lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 2,
      }),
    );
  });

  it('2 · admin NO puede cambiar el contenido del acta firmada', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        conformidad: 'no_conforme',
        observacionesCliente: 'reescrito despues de firmar',
        updatedAt: 2000, updatedBy: 'admin-uid',
      }),
    );
  });

  it('3 · admin NO puede cambiar la firma del cliente', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        firmaCliente: {
          nombreAclaratorio: 'Otro Nombre',
          dni: '99999999',
          firma: { id: 'f2', storagePath: `projects/${CODE}/AC/f2.jpg`, takenAt: 2000, uploadedBy: 'admin-uid', pending: false },
        },
        updatedAt: 2000, updatedBy: 'admin-uid',
      }),
    );
  });

  it('4 · el flujo normal de firma sigue permitido (en_progreso → firmado)', async () => {
    await seedActaEnProgreso();
    await assertSucceeds(updateDoc(acRef(admin()), firmarCon(FIRMA_SUBIDA)));
  });

  // ── Intentos de evasión ─────────────────────────────────────────

  it('5 · admin NO puede vaciar el lockedSnapshot del acta firmada', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        lockedSnapshot: null, updatedAt: 2000, updatedBy: 'admin-uid',
      }),
    );
  });

  it('6 · admin NO puede degradar el acta firmada a "completo" para después reabrirla', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        status: 'completo', updatedAt: 2000, updatedBy: 'admin-uid', version: 2,
        lockedSnapshot: { conformidad: 'conforme' }, lockedAt: 2000, lockedBy: 'admin-uid',
      }),
    );
  });

  it('7 · admin NO puede reabrir y reescribir contenido en el mismo write', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        status: 'en_progreso', updatedAt: 2000, updatedBy: 'admin-uid',
        reopenedAt: 2000, reopenedBy: 'admin-uid',
        lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 2,
        conformidad: 'no_conforme',
      }),
    );
  });

  it('8 · técnico NO puede tocar el acta firmada', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(tecnico()), {
        status: 'en_progreso', updatedAt: 2000, updatedBy: 'tec-uid',
        reopenedAt: 2000, reopenedBy: 'tec-uid',
        lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 2,
      }),
    );
  });

  it('9 · nadie puede borrar el acta firmada', async () => {
    await seedActaFirmada();
    await assertFails(deleteDoc(acRef(admin())));
  });

  it('10 · admin NO puede reabrir el acta suplantando el uid del reopen', async () => {
    await seedActaFirmada();
    await assertFails(
      updateDoc(acRef(admin()), {
        status: 'en_progreso', updatedAt: 2000, updatedBy: 'otro-uid',
        reopenedAt: 2000, reopenedBy: 'otro-uid',
        lockedSnapshot: null, lockedAt: null, lockedBy: null, version: 2,
      }),
    );
  });
});

// #P0-3/#P0-4 — La firma que cierra el acta tiene que ser una imagen realmente
// subida y guardada bajo el path del propio acta. Estos tests atacan el momento
// de la firma, que es la única ventana en la que el acta admite escrituras.
describe('el acta no se firma sin una firma del cliente real (P0-3/P0-4)', () => {
  const CODE = 'P-2025-001';

  const acRef = (db: ReturnType<typeof admin>) =>
    doc(db, 'projects', CODE, 'documents', 'AC');

  async function seedActaEnProgreso() {
    await seedProject(CODE, {
      ...BASE_PROJECT,
      docStatus: { ...BASE_PROJECT.docStatus, RF: 'firmado', AC: 'en_progreso' },
    });
    await seedDoc(CODE, 'RF', { status: 'firmado', aptoEntrega: true });
    await seedDoc(CODE, 'AC', { status: 'en_progreso', version: 0 });
  }

  function firmarCon(firma: unknown) {
    return {
      status: 'firmado',
      conformidad: 'conforme',
      firmaCliente: { nombreAclaratorio: 'Juan Perez', dni: '30111222', firma },
      version: 1,
      lockedSnapshot: { conformidad: 'conforme' },
      lockedAt: 2000, lockedBy: 'admin-uid',
      updatedAt: 2000, updatedBy: 'admin-uid',
    };
  }

  it('NO se puede firmar con la firma todavía en la cola (pending: true)', async () => {
    await seedActaEnProgreso();
    await assertFails(updateDoc(acRef(admin()), firmarCon({
      id: 'f1', storagePath: `projects/${CODE}/AC/f1.jpg`,
      takenAt: 1400, uploadedBy: 'admin-uid', pending: true,
    })));
  });

  it('NO se puede firmar sin firma del cliente (firma: null)', async () => {
    await seedActaEnProgreso();
    await assertFails(updateDoc(acRef(admin()), firmarCon(null)));
  });

  it('NO se puede firmar sin el campo firmaCliente', async () => {
    await seedActaEnProgreso();
    await assertFails(updateDoc(acRef(admin()), {
      status: 'firmado', conformidad: 'conforme', version: 1,
      lockedSnapshot: { conformidad: 'conforme' },
      lockedAt: 2000, lockedBy: 'admin-uid',
      updatedAt: 2000, updatedBy: 'admin-uid',
    }));
  });

  // El ataque de blanqueo de path: guardar la firma bajo un docType cuyo
  // documento sigue abierto para poder sustituir el JPEG después de firmar.
  it('NO se puede firmar con la firma guardada bajo otro docType (FM abierto)', async () => {
    await seedActaEnProgreso();
    await assertFails(updateDoc(acRef(admin()), firmarCon({
      id: 'f1', storagePath: `projects/${CODE}/FM/f1.jpg`,
      takenAt: 1400, uploadedBy: 'admin-uid', pending: false,
    })));
  });

  it('NO se puede firmar con la firma apuntando a otra obra', async () => {
    await seedActaEnProgreso();
    await assertFails(updateDoc(acRef(admin()), firmarCon({
      id: 'f1', storagePath: 'projects/P-2025-999/AC/f1.jpg',
      takenAt: 1400, uploadedBy: 'admin-uid', pending: false,
    })));
  });

  it('sí se puede firmar con una firma subida bajo el path del acta', async () => {
    await seedActaEnProgreso();
    await assertSucceeds(updateDoc(acRef(admin()), firmarCon({
      id: 'f1', storagePath: `projects/${CODE}/AC/f1.jpg`,
      takenAt: 1400, uploadedBy: 'admin-uid', pending: false,
    })));
  });

  it('cerrar el acta como "completo" no exige firma (todavía no es evidencia)', async () => {
    await seedActaEnProgreso();
    await assertSucceeds(updateDoc(acRef(admin()), {
      status: 'completo', conformidad: 'conforme', version: 1,
      lockedSnapshot: { conformidad: 'conforme' },
      lockedAt: 2000, lockedBy: 'admin-uid',
      updatedAt: 2000, updatedBy: 'admin-uid',
    }));
  });
});
