import { defineConfig, devices } from '@playwright/test';

// Config aparte de playwright.config.ts: estos tests corren el pipeline de
// imágenes sobre about:blank y no necesitan la app ni los emuladores, así que
// no deben arrastrar el `webServer` del suite e2e.
export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/globalSetup.ts',
  fullyParallel: true,
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
