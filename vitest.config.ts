import { configDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    // Playwright specs have their own runner and must never be collected by Vitest.
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/browser/**'],
    // Give the Firebase emulator time to respond on first connect.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Los suites de reglas comparten el mismo proyecto del emulador (lo exige
    // el `firestore.get()` cross-service de storage.rules) y cada uno limpia la
    // base entre tests. En paralelo se pisarían entre archivos.
    fileParallelism: false,
  },
});
