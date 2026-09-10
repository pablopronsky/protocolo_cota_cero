import { test, expect } from '@playwright/test';
import { db, docRef, seed, signIn, drawSignature } from './helpers/setup';
const CODE = 'COTA-2026-9901';
test.describe('firma presencial y guardado', () => {
  test.beforeEach(async () => { await seed(CODE); });
  test('cliente firma, admin cierra y el entregable conserva la firma', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await signIn(page); await page.goto(`/projects/${CODE}/AC`);
    await page.getByLabel('Fecha del acta').fill('2026-09-10');
    await page.locator('input[value="conforme"]').check();
    await page.getByLabel('Nombre aclaratorio').fill('Cliente E2E'); await page.getByLabel('DNI', { exact: true }).fill('30111222');
    await drawSignature(page);
    await expect.poll(async () => (await docRef(CODE, 'AC').get()).data()?.firmaCliente?.firma?.pending).toBe(false);
    await expect(page.getByLabel('Fecha del acta')).toBeDisabled();
    await page.getByRole('button', { name: 'Firmar acta de conformidad', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /confirmar/i }).click();
    await expect(page.getByText('Acta firmada · Documento definitivo')).toBeVisible();
    const acta = (await docRef(CODE, 'AC').get()).data()!;
    expect(acta.lockedSnapshot.firmaCliente.firma.pending).toBe(false);
    expect((await db.doc(`projects/${CODE}`).get()).data()?.status).toBe('entregado');
    expect((await db.collection(`projects/${CODE}/revisions`).where('action', '==', 'firmado').get()).size).toBe(1);
    await page.goto(`/print/${CODE}/entregable`);
    await expect(page.getByText('BORRADOR — NO VÁLIDO PARA ENTREGA')).toHaveCount(0);
    await expect(page.getByText('Cliente E2E').first()).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/entregable-final.png', fullPage: true });
  });
  test('otro tecnico puede continuar y guardar un documento iniciado por admin', async ({ page }) => {
    await docRef(CODE, 'VT').update({ status: 'en_progreso', observaciones: 'original' });
    await signIn(page, 'tecnico'); await page.goto(`/projects/${CODE}/VT`);
    await page.getByLabel('Observaciones generales').fill('Continuado por técnico');
    await expect.poll(async () => (await docRef(CODE, 'VT').get()).data()?.observaciones).toBe('Continuado por técnico');
    expect((await docRef(CODE, 'VT').get()).data()?.updatedBy).toBe('tecnico-e2e');
  });
  test('repara un espejo atrasado sin bloquear la vista del proyecto', async ({ page }) => {
    await db.doc(`projects/${CODE}`).update({ 'docStatus.VT': 'vacio' });
    await signIn(page); await page.goto(`/projects/${CODE}`);
    await expect.poll(async () => (await db.doc(`projects/${CODE}`).get()).data()?.docStatus.VT).toBe('completo');
  });
});
