// #P1 — Normalización de imágenes de cámara física.
//
// El pipeline de fotos tenía un agujero que solo aparece con una cámara real:
// `compressImage()` hacía `catch { return file }`, así que una captura HEIC/HEIF
// —que Chrome/Android no sabe decodificar— entraba a la cola tal cual, con
// `type: 'image/heic'`. `storage.rules` solo acepta `image/(jpeg|png|webp)`, así
// que `uploadBytes` devolvía `storage/unauthorized` en cada intento y la foto
// quedaba `pending` para siempre.
//
// Regla nueva, sin excepciones: de acá sale un JPEG que cumple el contrato de
// Storage, o sale un error explicable para el usuario. Nunca el archivo crudo.

/** Tope de tamaño de `storage.rules` (`validUpload`). Debe seguir a la regla. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** MIME y extensión que produce el pipeline. Consistentes con el `storagePath`. */
export const UPLOAD_MIME = 'image/jpeg';
export const UPLOAD_EXT = 'jpg';

// Margen contra el tope duro: la regla compara el tamaño ya en el servidor y no
// queremos perder una foto por unos pocos KB de diferencia.
const TARGET_BYTES = 8 * 1024 * 1024;

// Combinaciones de lado máximo / calidad, de mejor a peor. Se recorren hasta
// que el JPEG entre en TARGET_BYTES; una foto de obra normal sale en el primer
// paso (~70 KB para 4032x3024).
const ATTEMPTS: ReadonlyArray<{ dim: number; quality: number }> = [
  { dim: 1600, quality: 0.7 },
  { dim: 1600, quality: 0.5 },
  { dim: 1200, quality: 0.5 },
  { dim: 900, quality: 0.45 },
  { dim: 640, quality: 0.4 },
];

export type PhotoPipelineCode = 'decode-failed' | 'encode-failed' | 'too-large' | 'no-canvas';

/** Fallo con mensaje pensado para mostrarse tal cual en la pantalla de obra. */
export class PhotoPipelineError extends Error {
  readonly code: PhotoPipelineCode;
  constructor(code: PhotoPipelineCode, message: string) {
    super(message);
    this.name = 'PhotoPipelineError';
    this.code = code;
  }
}

const MSG_DECODE =
  'No pudimos procesar esta foto. Probá sacar otra o seleccionarla en formato JPG.';

interface Decoded {
  width: number;
  height: number;
  source: CanvasImageSource;
  release(): void;
}

// Dos decodificadores, a propósito.
//
// `createImageBitmap` es el camino rápido y el único disponible en un worker.
// El `<img>` de respaldo no es redundante: en iOS/Safari el HEIC lo decodifica
// el sistema operativo, así que la captura del iPhone se convierte a JPEG por
// esta vía sin sumar ninguna dependencia. En Android, donde no hay decoder de
// HEIC, fallan las dos y el error sale a la UI — que es el comportamiento
// correcto: preferimos avisar antes que aflojar `storage.rules`.
async function decodeWithBitmap(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    // `imageOrientation` aplica el EXIF: sin esto una foto vertical de teléfono
    // se guardaba acostada, porque el canvas descarta los metadatos.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      release: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function decodeWithImgElement(file: Blob): Promise<Decoded | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, UPLOAD_MIME, quality));
}

/**
 * Redimensiona y recodifica a JPEG. Devuelve siempre un Blob `image/jpeg` por
 * debajo del tope de Storage, o lanza `PhotoPipelineError` con un mensaje
 * mostrable. Nunca devuelve el archivo original.
 */
export async function normalizeImage(file: Blob): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new PhotoPipelineError(
      'no-canvas',
      'Este navegador no puede preparar la foto para subirla. Probá desde otro dispositivo.',
    );
  }

  const decoded = (await decodeWithBitmap(file)) ?? (await decodeWithImgElement(file));
  if (!decoded) {
    throw new PhotoPipelineError('decode-failed', MSG_DECODE);
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new PhotoPipelineError(
        'no-canvas',
        'Este navegador no puede preparar la foto para subirla. Probá desde otro dispositivo.',
      );
    }

    let smallest: Blob | null = null;
    for (const { dim, quality } of ATTEMPTS) {
      const scale = Math.min(1, dim / Math.max(decoded.width, decoded.height));
      const w = Math.max(1, Math.round(decoded.width * scale));
      const h = Math.max(1, Math.round(decoded.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(decoded.source, 0, 0, w, h);

      const blob = await toBlob(canvas, quality);
      if (!blob || blob.size === 0) continue;
      if (blob.size <= TARGET_BYTES) return blob;
      smallest = blob;
    }

    if (!smallest) {
      throw new PhotoPipelineError('encode-failed', MSG_DECODE);
    }
    // Decodificó pero ni en el paso más agresivo entra en el tope. Es un caso de
    // laboratorio (haría falta una imagen absurdamente grande y ruidosa), pero
    // preferimos el error explícito antes que encolar algo que Storage rechaza.
    throw new PhotoPipelineError(
      'too-large',
      'Esta foto es demasiado pesada y no pudimos reducirla. Probá sacar otra con menos resolución.',
    );
  } finally {
    decoded.release();
  }
}

/**
 * Último control antes de encolar: si esto no pasa, `storage.rules` tampoco.
 * Evita dejar en IndexedDB un objeto que sabemos que Storage nunca va a aceptar.
 */
export function assertUploadable(blob: Blob): void {
  if (blob.type !== UPLOAD_MIME) {
    throw new PhotoPipelineError('decode-failed', MSG_DECODE);
  }
  if (blob.size === 0) {
    throw new PhotoPipelineError('encode-failed', MSG_DECODE);
  }
  if (blob.size >= MAX_UPLOAD_BYTES) {
    throw new PhotoPipelineError(
      'too-large',
      'Esta foto es demasiado pesada y no pudimos reducirla. Probá sacar otra con menos resolución.',
    );
  }
}
