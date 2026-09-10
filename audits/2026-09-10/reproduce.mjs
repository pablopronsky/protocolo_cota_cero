// Regresiones de los hallazgos iniciales; solo emuladores aislados.
// Iniciar firebase con firebase.test.json antes de ejecutar este script.
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/rules', 'tests/api/document.test.ts'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
