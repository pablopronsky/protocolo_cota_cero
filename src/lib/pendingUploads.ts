import type { PhotoRef } from '@/schemas';

// #P0-4 — Un único lugar que sepa detectar adjuntos sin sincronizar.
//
// El problema que resuelve: una foto o firma encolada offline se escribe en
// Firestore como `pending: true` y su binario todavía vive en IndexedDB. Si el
// documento se cierra en ese estado, `buildLockedSnapshot()` congela la
// referencia pendiente y a partir de ahí las reglas rechazan cualquier
// `updateDoc` sobre el documento bloqueado — así que `flushPhotoQueue()` nunca
// puede pasar la referencia a `pending: false`. La foto queda congelada como
// "pendiente de sincronización" para siempre, incluso en el entregable.
//
// El recorrido es genérico a propósito: los `PhotoRef` viven en formas
// distintas según el documento (`registroFotografico[]` en VT/RF,
// `firmaCliente.firma` y `firmaCotaCero.firma` en AC), y un campo nuevo con
// adjuntos quedaría cubierto sin tocar este archivo ni los formularios.

function isPhotoRef(value: object): value is PhotoRef {
  const candidate = value as Partial<PhotoRef>;
  return typeof candidate.id === 'string'
      && typeof candidate.storagePath === 'string';
}

/** Todos los PhotoRef alcanzables desde `value`, sin duplicados por id. */
export function collectPhotoRefs(value: unknown): PhotoRef[] {
  const found = new Map<string, PhotoRef>();
  const visited = new WeakSet<object>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (isPhotoRef(node)) {
      // Un PhotoRef es una hoja: no se sigue recorriendo hacia adentro.
      // Se conserva la primera aparición; el `lockedSnapshot` que se está por
      // escribir repite las mismas referencias y no debe contarlas dos veces.
      if (!found.has(node.id)) found.set(node.id, node);
      return;
    }
    Object.values(node as Record<string, unknown>).forEach(walk);
  };

  walk(value);
  return [...found.values()];
}

/** Los adjuntos que todavía no terminaron de subir a Storage. */
export function pendingPhotoRefs(value: unknown): PhotoRef[] {
  return collectPhotoRefs(value).filter((photo) => photo.pending === true);
}

/**
 * Mensaje de bloqueo si el documento no se puede cerrar todavía, o `null` si
 * todos los adjuntos están sincronizados.
 */
export function pendingUploadsError(
  value: unknown,
  // #P1 — Estado de la cola local, cuando el caller lo tiene. Sin esto el
  // mensaje dice "esperá a que termine de subir" incluso para una imagen que
  // Storage ya rechazó de forma definitiva, y el usuario espera para siempre.
  queue?: ReadonlyMap<string, { state: 'pending' | 'error' }>,
): string | null {
  const pendings = pendingPhotoRefs(value);
  if (pendings.length === 0) return null;

  const failed = queue
    ? pendings.filter((photo) => queue.get(photo.id)?.state === 'error').length
    : 0;
  if (failed > 0) {
    const noun = failed === 1 ? 'imagen' : 'imágenes';
    return `${failed} ${noun} no se pudieron subir. Reintentá o eliminalas antes de cerrar el documento.`;
  }

  const count = pendings.length;
  const noun = count === 1 ? 'imagen' : 'imágenes';
  return `Esperá a que terminen de subir ${count} ${noun} antes de cerrar el documento.`;
}
