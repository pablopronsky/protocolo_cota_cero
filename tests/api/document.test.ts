import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080';
let app: App;
let db: Firestore;
let role: 'admin' | 'tecnico' = 'admin';
let fileExists = true;
vi.mock('@/lib/firebase/admin', () => ({ getAdminDb: () => db, getAdminBucket: () => ({ file: () => ({ exists: async () => [fileExists] }) }) }));
vi.mock('@/lib/auth/requireAuth', async () => ({
  ...await vi.importActual<typeof import('@/lib/auth/requireAuth')>('@/lib/auth/requireAuth'),
  requireUser: async () => ({ uid: role === 'admin' ? 'admin-test' : 'tech-test', role }),
}));
const { POST } = await import('@/app/api/projects/document/route');
const CODE = 'COTA-2026-9002';
const project = () => db.doc(`projects/${CODE}`);
const docRef = (type: string) => project().collection('documents').doc(type);
const signature = { id: 'ff5b4f85-68a4-4c5d-84e0-b33c5d2d19a8', storagePath: `projects/${CODE}/AC/ff5b4f85-68a4-4c5d-84e0-b33c5d2d19a8.jpg`, takenAt: 1000, uploadedBy: 'admin-test', pending: true };
const call = (action: string, extra: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/projects/document', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectCode: CODE, action, docType: 'AC', ...extra }),
}));
beforeAll(() => { app = initializeApp({ projectId: 'demo-lifecycle-test' }, 'lifecycle-test'); db = getFirestore(app); db.settings({ ignoreUndefinedProperties: true }); });
afterAll(async () => { await db.recursiveDelete(project()); await deleteApp(app); });
beforeEach(async () => {
  role = 'admin'; fileExists = true;
  await db.recursiveDelete(project());
  await project().set({ code: CODE, status: 'en_curso', clienteNombre: 'Cliente', domicilioObra: { calle: 'Original' }, materialInstalado: { tipo: 'spc' }, docStatus: { VT: 'vacio', EP: 'vacio', OT: 'vacio', RF: 'vacio', AC: 'vacio', FM: 'vacio' } });
  for (const type of ['VT', 'EP', 'OT', 'RF', 'AC', 'FM']) await docRef(type).set({
    docType: type, projectCode: CODE, status: ['AC', 'FM'].includes(type) ? 'en_progreso' : 'completo',
    version: 0, createdAt: 1000, updatedAt: 1000, updatedBy: 'admin-test', lockedSnapshot: null, lockedAt: null, lockedBy: null,
    ...(type === 'RF' ? { aptoEntrega: true } : {}), ...(type === 'OT' ? { alcance: 'Alcance original' } : {}),
    ...(type === 'AC' ? { fechaActa: '2026-09-10', conformidad: 'conforme', observacionesCliente: '', firmaCliente: { nombreAclaratorio: 'Cliente', dni: '30111222', firma: null } } : {}),
  });
});
async function capture() { expect((await call('capture-signature', { signature })).status).toBe(200); await docRef('AC').update({ 'firmaCliente.firma.pending': false }); }

describe('cierre y revisiones autoritativas', () => {
  it('construye snapshot/revision/mirror atomicos e ignora metadatos y snapshot enviados', async () => {
    await docRef('VT').update({ status: 'en_progreso', observaciones: 'antes' }); role = 'tecnico';
    const res = await call('close', { docType: 'VT', status: 'completo', expectedVersion: 0, values: { observaciones: 'despues', version: 99, updatedBy: 'falso', lockedSnapshot: { observaciones: 'mentira' } } });
    expect(res.status).toBe(200);
    const d = (await docRef('VT').get()).data()!;
    expect(d.version).toBe(1); expect(d.updatedBy).toBe('tech-test'); expect(d.lockedSnapshot.observaciones).toBe('despues');
    expect((await project().get()).data()?.docStatus.VT).toBe('completo');
    const revisions = await project().collection('revisions').get();
    expect(revisions.size).toBe(1); expect(revisions.docs[0].data().snapshot).toEqual(d.lockedSnapshot);
  });
  it('el tecnico no puede cerrar AC ni reabrir VT', async () => {
    role = 'tecnico'; expect((await call('close', { status: 'firmado' })).status).toBe(403);
    expect((await call('reopen', { docType: 'VT' })).status).toBe(403);
  });
  it.each(['VT', 'EP', 'OT', 'RF'])('rechaza el cierre del acta si %s esta abierto', async type => {
    await capture(); await docRef(type).update({ status: 'en_progreso' });
    expect((await call('close', { status: 'firmado' })).status).toBe(409);
    expect((await docRef('AC').get()).data()?.status).toBe('en_progreso');
  });
  it('rechaza RF no apta y firma pendiente o inexistente en Storage', async () => {
    expect((await call('capture-signature', { signature })).status).toBe(200);
    expect((await call('close', { status: 'firmado' })).status).toBe(409);
    await docRef('AC').update({ 'firmaCliente.firma.pending': false }); fileExists = false;
    expect((await call('close', { status: 'firmado' })).status).toBe(409);
    fileExists = true; await docRef('RF').update({ aptoEntrega: false });
    expect((await call('close', { status: 'firmado' })).status).toBe(409);
  });
  it('el cierre conserva el contenido y contexto aceptados aunque el proyecto cambie', async () => {
    await capture(); await project().update({ clienteNombre: 'Nombre nuevo', domicilioObra: { calle: 'Otra' } });
    const res = await call('close', { status: 'firmado', values: { conformidad: 'no_conforme', observacionesCliente: 'inyectado' } });
    expect(res.status).toBe(200);
    const ac = (await docRef('AC').get()).data()!;
    expect(ac.conformidad).toBe('conforme'); expect(ac.lockedSnapshot.cliente.nombre).toBe('Cliente'); expect(ac.lockedSnapshot.domicilioObra.calle).toBe('Original');
    expect((await project().get()).data()?.status).toBe('entregado');
    expect((await call('reopen')).status).toBe(409);
    expect((await call('reopen', { docType: 'EP' })).status).toBe(409);
  });
  it('dos cierres simultaneos producen una sola revision', async () => {
    await docRef('VT').update({ status: 'en_progreso' });
    const statuses = await Promise.all([call('close', { docType: 'VT', status: 'completo' }), call('close', { docType: 'VT', status: 'completo' })]);
    expect(statuses.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await project().collection('revisions').get()).size).toBe(1);
  });
  it('reapertura invalida una solicitud de cierre vieja', async () => {
    expect((await call('reopen', { docType: 'VT', expectedVersion: 0 })).status).toBe(200);
    expect((await call('close', { docType: 'VT', status: 'completo', expectedVersion: 0 })).status).toBe(409);
  });
  it('captura idempotente y descarte auditado permiten una nueva firma', async () => {
    expect((await call('capture-signature', { signature, values: { conformidad: 'conforme_con_observaciones' } })).status).toBe(200);
    expect((await call('capture-signature', { signature, values: { conformidad: 'no_conforme' } })).status).toBe(200);
    expect((await docRef('AC').get()).data()?.conformidad).toBe('conforme_con_observaciones');
    expect((await project().collection('revisions').get()).size).toBe(1);
    expect((await call('discard-signature')).status).toBe(200);
    expect((await docRef('AC').get()).data()?.firmaCliente.firma).toBeNull();
    expect((await project().collection('revisions').where('action', '==', 'firma_descartada').get()).size).toBe(1);
  });
  it('reconcilia todos los slots desde los documentos reales', async () => {
    expect((await call('reconcile')).status).toBe(200);
    const p = (await project().get()).data()!; expect(p.docStatus.VT).toBe('completo'); expect(p.docStatus.AC).toBe('en_progreso');
  });
  it.each(['en_curso', 'entregado'])('archivar y recuperar preserva el estado real %s', async state => {
    if (state === 'entregado') await docRef('AC').update({ status: 'firmado' });
    expect((await call('archive')).status).toBe(200); expect((await project().get()).data()?.status).toBe('archivado');
    expect((await call('unarchive')).status).toBe(200); expect((await project().get()).data()?.status).toBe(state);
  });
  it('una obra archivada rechaza captura y cierre', async () => {
    await call('archive'); expect((await call('capture-signature', { signature })).status).toBe(409);
    expect((await call('close', { docType: 'VT', status: 'completo' })).status).toBe(409);
  });
});
