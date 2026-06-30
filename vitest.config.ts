import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    // Give the Firebase emulator time to respond on first connect.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
