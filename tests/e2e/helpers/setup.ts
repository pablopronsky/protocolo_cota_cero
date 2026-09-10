import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { expect, type Page } from '@playwright/test';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099') throw new Error('El E2E requiere emuladores aislados.');
const app = getApps().find(app => app.name === 'e2e-fixtures') ?? initializeApp({ projectId: 'cotacero-test' }, 'e2e-fixtures');
export const db = getFirestore(app);
export const docRef = (code: string, type: string) => db.doc(`projects/${code}/documents/${type}`);
export async function signIn(page: Page, role: 'admin' | 'tecnico' = 'admin') {
  const uid = `${role}-e2e`; const email = `${role}@cotacero.test`; const password = 'test-password-123';
  const auth = getAuth(app);
  try { await auth.getUser(uid); } catch { await auth.createUser({ uid, email, password }); }
  await auth.setCustomUserClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ uid, nombre: role, email, role, activo: true });
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
export async function seed(code: string) {
  await db.recursiveDelete(db.doc(`projects/${code}`));
  await db.doc(`projects/${code}`).set({
    code, year: 2026, seq: 9901, clienteId: 'client-e2e', clienteNombre: 'Cliente E2E',
    domicilioObra: { calle: 'Prueba', numero: '123', localidad: 'CABA' }, tipoEspacio: 'vivienda', modalidad: 'obra_integral',
    materialInstalado: { tipo: 'spc', descripcion: 'Roble de prueba', m2Estimados: 20 }, status: 'en_curso',
    docStatus: { VT: 'completo', EP: 'completo', OT: 'completo', RF: 'firmado', AC: 'en_progreso', FM: 'vacio' },
    responsableComercial: 'admin-e2e', responsableTecnico: 'tecnico-e2e', createdAt: 1000, updatedAt: 1000, createdBy: 'admin-e2e', updatedBy: 'admin-e2e',
  });
  await db.doc('clients/client-e2e').set({ id: 'client-e2e', nombre: 'Cliente E2E', contacto: 'Cliente', telefono: '1100000000', createdAt: 1000, updatedAt: 1000 });
  for (const type of ['VT', 'EP', 'OT', 'RF', 'AC', 'FM']) await docRef(code, type).set({
    docType: type, projectCode: code, status: type === 'RF' ? 'firmado' : type === 'AC' ? 'en_progreso' : type === 'FM' ? 'vacio' : 'completo',
    createdAt: 1000, updatedAt: 1000, updatedBy: 'admin-e2e', version: 0, lockedSnapshot: null, lockedAt: null, lockedBy: null,
    ...(type === 'OT' ? { alcance: 'Instalación de piso' } : {}), ...(type === 'RF' ? { aptoEntrega: true } : {}),
    ...(type === 'AC' ? { fechaActa: '', conformidad: '', observacionesCliente: '', firmaCliente: { nombreAclaratorio: '', dni: '', firma: null }, firmaCotaCero: { uid: '', firma: null } } : {}),
  });
}
export async function drawSignature(page: Page) {
  const canvas = page.locator('canvas').first(); await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(); if (!box) throw new Error('No hay lienzo de firma.');
  await page.mouse.move(box.x + 20, box.y + 35); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 65, { steps: 5 }); await page.mouse.move(box.x + 120, box.y + 25, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Guardar firma', exact: true }).first().click();
}
