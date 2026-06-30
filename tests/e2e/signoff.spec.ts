/**
 * E2E: AC sign-off flow
 *
 * Requires:
 *   - Firebase emulator (auth + firestore) running on default ports
 *   - Next.js app running (locally: npm run dev; CI: handled by workflow)
 *   - TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD env vars for a seeded admin user
 *
 * Run: npm run test:e2e -- --grep "sign-off"
 */
import { test, expect } from '@playwright/test';
import { signInAsAdmin, seedTestProject, advanceToReadyForSignoff } from './helpers/setup';

const TEST_PROJECT = 'P-E2E-SIGNOFF';

test.describe('AC sign-off flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedTestProject(TEST_PROJECT);
    await advanceToReadyForSignoff(TEST_PROJECT);
    await signInAsAdmin(page);
  });

  test('navigates to project and opens AC document', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT}`);
    await expect(page.getByText('Acta de Conformidad')).toBeVisible();
    await page.getByText('Acta de Conformidad').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT}`));
  });

  test('shows signing button when AC is in_progreso and RF is apto', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT}`);
    await page.getByText('Acta de Conformidad').click();
    // The sign button should be visible when all preconditions are met
    const signButton = page.getByRole('button', { name: /firmar|sign/i });
    await expect(signButton).toBeVisible({ timeout: 10_000 });
  });

  test('can fill conformidad field before signing', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT}`);
    await page.getByText('Acta de Conformidad').click();
    const conformidadSelect = page.getByLabel(/conformidad/i);
    if (await conformidadSelect.isVisible()) {
      await conformidadSelect.selectOption('conforme');
    }
    // Autosave should fire (SaveIndicator shows "guardado")
    await expect(page.getByText(/guardado/i)).toBeVisible({ timeout: 5_000 });
  });

  test('sign dialog appears and captures client name + DNI', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT}`);
    await page.getByText('Acta de Conformidad').click();

    const signButton = page.getByRole('button', { name: /firmar/i });
    await expect(signButton).toBeVisible({ timeout: 10_000 });
    await signButton.click();

    // ConfirmDialog or signing modal should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill client identification if fields are present in dialog
    const nameField = dialog.getByLabel(/nombre|name/i);
    const dniField = dialog.getByLabel(/dni/i);
    if (await nameField.isVisible()) {
      await nameField.fill('María García');
    }
    if (await dniField.isVisible()) {
      await dniField.fill('30123456');
    }
  });

  test('AC shows firmado status after signing', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT}`);
    await page.getByText('Acta de Conformidad').click();

    const signButton = page.getByRole('button', { name: /firmar/i });
    await expect(signButton).toBeVisible({ timeout: 10_000 });
    await signButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill required fields
    const nameField = dialog.getByLabel(/nombre/i);
    if (await nameField.isVisible()) await nameField.fill('María García');
    const dniField = dialog.getByLabel(/dni/i);
    if (await dniField.isVisible()) await dniField.fill('30123456');

    // Draw on canvas (simulate signature)
    const canvas = dialog.locator('canvas');
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 80);
        await page.mouse.move(box.x + 150, box.y + 50);
        await page.mouse.up();
      }
    }

    // Confirm
    const confirmButton = dialog.getByRole('button', { name: /confirmar|aceptar|ok/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    // AC should now show "firmado"
    await expect(page.getByText(/firmado/i)).toBeVisible({ timeout: 10_000 });
  });
});
