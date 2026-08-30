import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// #P1 — El pipeline de fotos solo se puede verificar de verdad en un navegador.
//
// El blocker que originó estos tests se escapó precisamente porque el smoke
// inyectaba JPEG sintéticos por SDK: nunca pasó por `createImageBitmap`, ni por
// canvas, ni por el `<input capture="environment">`. Acá se ejecuta el módulo
// real (`src/lib/imageNormalize.ts`, transpilado por el globalSetup) contra
// bytes reales, incluido un HEIC como el que produce la cámara de un teléfono.

const BUNDLE = resolve(__dirname, '../../.playwright-tmp/imageNormalize.js');
const HEIC = resolve(__dirname, '../fixtures/camera-iphone.heic');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Result {
  ok: boolean;
  type?: string;
  size?: number;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Carga el módulo real en la página. */
async function loadModule(page: Page) {
  await page.goto('about:blank');
  await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8'), type: 'module' });
  // El módulo se expone en window desde el shim del bundle.
  await page.waitForFunction(() => '__imageNormalize' in window);
}

/** Corre normalizeImage sobre bytes concretos y devuelve un resultado serializable. */
async function normalize(page: Page, bytes: Buffer, name: string, mime: string): Promise<Result> {
  return page.evaluate(async ({ b64, name, mime }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], name, { type: mime });
    const mod = (window as unknown as { __imageNormalize: Record<string, unknown> }).__imageNormalize;
    const normalizeImage = mod.normalizeImage as (f: Blob) => Promise<Blob>;
    const assertUploadable = mod.assertUploadable as (b: Blob) => void;
    try {
      const blob = await normalizeImage(file);
      assertUploadable(blob);
      return { ok: true, type: blob.type, size: blob.size };
    } catch (e) {
      const err = e as { name?: string; code?: string; message?: string };
      return { ok: false, errorName: err.name, errorCode: err.code, errorMessage: err.message };
    }
  }, { b64: bytes.toString('base64'), name, mime });
}

/** Genera un JPEG/PNG/WebP real dentro del navegador, del tamaño pedido. */
async function makeImage(page: Page, w: number, h: number, mime: string): Promise<Buffer> {
  const b64 = await page.evaluate(async ({ w, h, mime }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // Ruido: comprime mal a propósito, para que el tamaño sea representativo.
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 255;
      img.data[i + 1] = (i * 13) % 255;
      img.data[i + 2] = (i * 29) % 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, 0.95));
    const buf = new Uint8Array(await blob!.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return btoa(s);
  }, { w, h, mime });
  return Buffer.from(b64, 'base64');
}

test.beforeEach(async ({ page }) => { await loadModule(page); });

// 1 — JPEG válido de cámara
test('JPEG de cámara se normaliza a image/jpeg dentro del límite', async ({ page }) => {
  const jpeg = await makeImage(page, 4032, 3024, 'image/jpeg');
  const res = await normalize(page, jpeg, 'IMG_0001.JPG', 'image/jpeg');
  expect(res.ok).toBe(true);
  expect(res.type).toBe('image/jpeg');
  expect(res.size!).toBeGreaterThan(0);
  expect(res.size!).toBeLessThan(MAX_UPLOAD_BYTES);
});

// 2 — PNG válido
test('PNG se normaliza a image/jpeg (no queda como image/png)', async ({ page }) => {
  const png = await makeImage(page, 1200, 900, 'image/png');
  const res = await normalize(page, png, 'captura.png', 'image/png');
  expect(res.ok).toBe(true);
  expect(res.type).toBe('image/jpeg');
});

// 3 — WebP: comportamiento definido = se recodifica, no se pasa tal cual
test('WebP se recodifica a image/jpeg', async ({ page }) => {
  const webp = await makeImage(page, 1200, 900, 'image/webp');
  const res = await normalize(page, webp, 'captura.webp', 'image/webp');
  expect(res.ok).toBe(true);
  expect(res.type).toBe('image/jpeg');
});

// 4 — HEIC no decodificable: error visible, nunca un blob que Storage rechace
test('HEIC no decodificable falla con mensaje para el usuario, no en silencio', async ({ page }) => {
  const heic = readFileSync(HEIC);
  const res = await normalize(page, heic, 'IMG_0002.HEIC', 'image/heic');
  expect(res.ok).toBe(false);
  expect(res.errorName).toBe('PhotoPipelineError');
  expect(res.errorCode).toBe('decode-failed');
  expect(res.errorMessage).toContain('No pudimos procesar esta foto');
});

// Regresión directa del blocker: lo que antes salía era el File original HEIC.
test('el HEIC nunca se devuelve tal cual (regresión del blocker)', async ({ page }) => {
  const heic = readFileSync(HEIC);
  const leaked = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'IMG.HEIC', { type: 'image/heic' });
    const mod = (window as unknown as { __imageNormalize: Record<string, unknown> }).__imageNormalize;
    try {
      const out = await (mod.normalizeImage as (f: Blob) => Promise<Blob>)(file);
      return { returned: true, sameObject: out === (file as Blob), type: out.type };
    } catch {
      return { returned: false, sameObject: false, type: null };
    }
  }, heic.toString('base64'));
  expect(leaked.returned).toBe(false);
  expect(leaked.sameObject).toBe(false);
});

// 5 — imagen muy grande: se comprime, no se rechaza
test('imagen enorme se reduce por debajo del límite de Storage', async ({ page }) => {
  const big = await makeImage(page, 6000, 6000, 'image/jpeg');
  expect(big.byteLength).toBeGreaterThan(2 * 1024 * 1024);
  const res = await normalize(page, big, 'IMG_0003.JPG', 'image/jpeg');
  expect(res.ok).toBe(true);
  expect(res.type).toBe('image/jpeg');
  expect(res.size!).toBeLessThan(MAX_UPLOAD_BYTES);
});

// 10 — MIME final y extensión del path son coherentes
test('el MIME producido coincide con la extensión .jpg del storagePath', async ({ page }) => {
  const consts = await page.evaluate(() => {
    const mod = (window as unknown as { __imageNormalize: Record<string, unknown> }).__imageNormalize;
    return { mime: mod.UPLOAD_MIME, ext: mod.UPLOAD_EXT, max: mod.MAX_UPLOAD_BYTES };
  });
  expect(consts.mime).toBe('image/jpeg');
  expect(consts.ext).toBe('jpg');
  // Debe seguir al tope de storage.rules.
  expect(consts.max).toBe(MAX_UPLOAD_BYTES);
});

// Un archivo que no es imagen tampoco puede colarse.
test('un archivo que no es imagen falla explícitamente', async ({ page }) => {
  const res = await normalize(page, Buffer.from('esto no es una imagen'), 'nota.jpg', 'image/jpeg');
  expect(res.ok).toBe(false);
  expect(res.errorCode).toBe('decode-failed');
});

// Pasada adversarial: el MIME declarado no decide nada — decide el contenido.
test('un HEIC disfrazado de image/jpeg tampoco pasa', async ({ page }) => {
  const heic = readFileSync(HEIC);
  const res = await normalize(page, heic, 'IMG_0004.jpg', 'image/jpeg');
  expect(res.ok).toBe(false);
  expect(res.errorCode).toBe('decode-failed');
});

test('un JPEG con extensión .heic sí pasa: manda el contenido', async ({ page }) => {
  const jpeg = await makeImage(page, 800, 600, 'image/jpeg');
  const res = await normalize(page, jpeg, 'IMG_0005.HEIC', 'image/heic');
  expect(res.ok).toBe(true);
  expect(res.type).toBe('image/jpeg');
});
