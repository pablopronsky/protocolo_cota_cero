import { test, expect } from '@playwright/test';
import { db, seed, signIn } from './helpers/setup';
const CODE = 'COTA-2026-9902';
test.describe('entregable y archivo', () => {
  test.beforeEach(async ({ page }) => { await seed(CODE); await signIn(page); });
  test('un acta sin firma se imprime como borrador', async ({ page }) => {
    await page.goto(`/print/${CODE}/entregable`);
    await expect(page.getByText('BORRADOR — NO VÁLIDO PARA ENTREGA').first()).toBeVisible();
    await expect(page.getByText('Cliente E2E').first()).toBeVisible();
  });
  test('un codigo inexistente termina mostrando el error', async ({ page }) => {
    await page.goto('/projects/COTA-2026-9999');
    await expect(page.getByText('Proyecto no encontrado.')).toBeVisible();
  });
  test('archivar y desarchivar recupera una obra entregada', async ({ page }) => {
    await db.doc(`projects/${CODE}/documents/AC`).update({ status: 'firmado' });
    await page.goto(`/projects/${CODE}`);
    await page.getByRole('button', { name: /^Archivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /confirmar/i }).click();
    await expect.poll(async () => (await db.doc(`projects/${CODE}`).get()).data()?.status).toBe('archivado');
    await page.getByRole('button', { name: /Desarchivar/ }).click();
    await expect.poll(async () => (await db.doc(`projects/${CODE}`).get()).data()?.status).toBe('entregado');
  });
});
