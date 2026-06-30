import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, collection,
} from 'firebase/firestore';
import type { Page } from '@playwright/test';

const EMULATOR_HOST = '127.0.0.1';
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;

let app: FirebaseApp;

function getApp(): FirebaseApp {
  if (!app) {
    app = getApps()[0] ?? initializeApp({
      apiKey: 'test-api-key',
      authDomain: `${EMULATOR_HOST}:${AUTH_PORT}`,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'cotacero-test',
      storageBucket: 'cotacero-test.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:000000000000000000000000',
    });
    connectAuthEmulator(getAuth(app), `http://${EMULATOR_HOST}:${AUTH_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(app), EMULATOR_HOST, FIRESTORE_PORT);
  }
  return app;
}

export function getTestDb() {
  return getFirestore(getApp());
}

export async function signInAsAdmin(page: Page) {
  const email = process.env.TEST_ADMIN_EMAIL ?? 'admin@test.cotacero.com';
  const password = process.env.TEST_ADMIN_PASSWORD ?? 'testpassword123';
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /ingresar|login|entrar/i }).click();
  await page.waitForURL('/projects');
}

export async function seedTestProject(projectCode: string) {
  const db = getTestDb();
  const projectData = {
    code: projectCode,
    year: 2025,
    seq: 999,
    clienteId: 'client-test',
    clienteNombre: 'Cliente Test E2E',
    domicilioObra: { calle: 'Calle Test', numero: '1', localidad: 'CABA' },
    tipoEspacio: 'vivienda',
    modalidad: 'obra_integral',
    materialInstalado: { tipo: 'laminado', descripcion: 'Test 8mm' },
    status: 'borrador',
    docStatus: { VT: 'vacio', EP: 'vacio', OT: 'vacio', RF: 'vacio', AC: 'vacio', FM: 'vacio' },
    responsableComercial: 'admin-uid',
    responsableTecnico: 'tec-uid',
    createdAt: Date.now(),
    createdBy: 'admin-uid',
    updatedAt: Date.now(),
    updatedBy: 'admin-uid',
  };

  await setDoc(doc(db, 'projects', projectCode), projectData);

  const docTypes = ['VT', 'EP', 'OT', 'RF', 'AC', 'FM'];
  for (const dt of docTypes) {
    await setDoc(doc(db, 'projects', projectCode, 'documents', dt), {
      docType: dt,
      projectCode,
      status: 'vacio',
      lockedSnapshot: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: 'admin-uid',
      version: 0,
    });
  }

  return projectData;
}

export async function advanceToReadyForSignoff(projectCode: string) {
  const db = getTestDb();

  const docUpdates: Record<string, Record<string, unknown>> = {
    VT: { status: 'completo', dictamen: 'apto', aptoEntrega: true },
    EP: { status: 'completo' },
    OT: { status: 'completo', alcance: 'Instalación laminado living' },
    RF: { status: 'completo', aptoEntrega: true },
    AC: { status: 'en_progreso', conformidad: '', observacionesCliente: '' },
    FM: { status: 'vacio' },
  };

  for (const [dt, data] of Object.entries(docUpdates)) {
    await setDoc(
      doc(db, 'projects', projectCode, 'documents', dt),
      {
        docType: dt,
        projectCode,
        lockedSnapshot: null,
        lockedAt: null,
        lockedBy: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: 'admin-uid',
        version: 1,
        ...data,
      },
    );
  }

  await setDoc(doc(db, 'projects', projectCode), {
    status: 'en_curso',
    docStatus: { VT: 'completo', EP: 'completo', OT: 'completo', RF: 'completo', AC: 'en_progreso', FM: 'vacio' },
    updatedAt: Date.now(),
    updatedBy: 'admin-uid',
  }, { merge: true });
}
