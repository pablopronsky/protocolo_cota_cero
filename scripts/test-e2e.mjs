import { spawn } from 'node:child_process';
const env = {
  ...process.env, CI: '1', NEXT_PUBLIC_FIREBASE_USE_EMULATORS: '1',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'cotacero-test', NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'cotacero-test.firebaseapp.com', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'cotacero-test.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000', NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:test',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:19199',
  FIREBASE_ADMIN_PROJECT_ID: 'cotacero-test', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3100',
};
if (process.env.VERCEL) throw new Error('Solo pruebas locales/CI.');
const run = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file}: exit ${code}`)));
});
await run('node_modules/next/dist/bin/next', ['build', '--webpack']);
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3100'], { env, stdio: 'inherit' });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(`${env.PLAYWRIGHT_BASE_URL}/login`)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('La aplicación de prueba no inició.');
  await run('node_modules/@playwright/test/cli.js', ['test']);
} finally { server.kill(); }
