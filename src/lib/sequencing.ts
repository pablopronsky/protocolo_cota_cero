import type { DocType, DocStatus, AnyDoc, DocRF } from '@/schemas';
import { DOC_ORDER, DOC_LABELS } from '@/schemas';

// Un documento se considera "cerrado" cuando ya no admite edición.
function isLocked(s: DocStatus | undefined): boolean {
  return s === 'completo' || s === 'firmado';
}

/**
 * #21 — Contrato del protocolo (VT→EP→OT→RF→AC→FM).
 *
 * Devuelve un mensaje de error si NO se puede llevar `docType` al estado
 * `target`, o `null` si la transición es válida. Solo gatea el cierre
 * (`completo`/`firmado`): los borradores (`en_progreso`) se editan en cualquier
 * orden. Un documento solo se cierra si el anterior del protocolo ya está
 * cerrado; el acta (AC) además exige que la revisión final (RF) sea apta para
 * entrega.
 */
export function sequencingError(
  docType: DocType,
  target: DocStatus,
  docStatus: Partial<Record<DocType, DocStatus>>,
  upstream?: Partial<Record<DocType, AnyDoc>>,
): string | null {
  if (!isLocked(target)) return null;

  const i = DOC_ORDER.indexOf(docType);
  if (i > 0) {
    const prev = DOC_ORDER[i - 1];
    if (!isLocked(docStatus[prev])) {
      return `Completá ${prev} · ${DOC_LABELS[prev]} antes de cerrar ${docType}.`;
    }
  }

  // Precondición RF→AC: el acta solo se firma sobre una revisión final apta.
  // (Que RF esté firmada ya lo garantiza el chequeo del documento anterior.)
  if (docType === 'AC') {
    const rf = upstream?.RF as DocRF | undefined;
    if (rf && rf.aptoEntrega !== true) {
      return 'La revisión final (RF) marcó la obra como NO apta para entrega: no se puede firmar el acta.';
    }
  }

  return null;
}
