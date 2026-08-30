import type { DocStatus, DocType } from '@/schemas';

// #P0-3 — Regla única de reapertura, compartida por la UI y por el repo.
//
// La frontera real es `isReopen()` en firestore.rules; esto existe para que el
// botón no se ofrezca y para que el error que ve el usuario sea explicativo en
// lugar de un `permission-denied` crudo.

export const AC_SIGNED_IS_FINAL =
  'El acta de conformidad firmada es definitiva y no se puede reabrir.';

export function isReopenable(docType: DocType, status: DocStatus | undefined): boolean {
  if (status !== 'completo' && status !== 'firmado') return false;
  // El acta firmada lleva la firma del cliente: en esta versión, firmado =
  // definitivo e irreversible. No hay anulación ni versionado todavía.
  if (docType === 'AC' && status === 'firmado') return false;
  return true;
}
