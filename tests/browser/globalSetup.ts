import { execFileSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Transpila el módulo real a JS para poder cargarlo en la página. No tiene
// imports, así que un `tsc` de un solo archivo alcanza: el test corre el mismo
// código que produce la app, no una copia.
export default function globalSetup() {
  const root = resolve(__dirname, '../..');
  const out = resolve(root, '.playwright-tmp');
  mkdirSync(out, { recursive: true });
  // `node <ruta a tsc>` en lugar de `npx`: en Windows el .cmd no se puede
  // spawnear sin shell y el binario resuelto sirve igual en los tres SO.
  execFileSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), 'src/lib/imageNormalize.ts',
     '--outDir', '.playwright-tmp',
     '--target', 'es2020', '--module', 'esnext',
     '--lib', 'es2020,dom', '--skipLibCheck', '--strict'],
    { cwd: root, stdio: 'inherit' },
  );
  appendFileSync(
    resolve(out, 'imageNormalize.js'),
    '\nwindow.__imageNormalize = { normalizeImage, assertUploadable, PhotoPipelineError,'
    + ' UPLOAD_MIME, UPLOAD_EXT, MAX_UPLOAD_BYTES };\n',
  );
}
