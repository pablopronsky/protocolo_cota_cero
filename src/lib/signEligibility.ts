import type { AnyDoc, DocAC, DocRF, DocStatus, DocType, Project } from '@/schemas';

// #P0-5 — Cuándo se puede pedir/consumir una firma remota del acta.
//
// El link público de firma es una capability: una vez emitido, cualquiera que lo
// tenga puede firmar. Por eso la elegibilidad se valida en los dos extremos —
// al emitirlo y al consumirlo, dentro de la transacción — y siempre contra los
// documentos reales. Lo que era cierto al crear el link puede haber dejado de
// serlo: la RF se puede reabrir y marcar NO apta, o la obra archivarse, entre la
// emisión y la firma.

const REQUIRED_BEFORE_AC: DocType[] = ['VT', 'EP', 'OT', 'RF'];

function isClosed(status: DocStatus | undefined): boolean {
  return status === 'completo' || status === 'firmado';
}

export type SignEligibilityDocs = Partial<Record<DocType, AnyDoc>>;

/**
 * Devuelve el motivo por el que el acta NO se puede firmar, o `null` si la obra
 * está en condiciones. `checkExistingSignature` se apaga cuando el llamador ya
 * validó la firma con su propio mensaje/código HTTP.
 */
export function signEligibilityError(
  project: Pick<Project, 'status'> | null | undefined,
  documents: SignEligibilityDocs,
): string | null {
  if (!project) return 'No se pudo verificar el estado de la obra.';
  if (project.status === 'archivado') {
    return 'La obra está archivada: no se puede firmar el acta.';
  }

  for (const docType of REQUIRED_BEFORE_AC) {
    const upstream = documents[docType];
    if (!upstream) return `Falta el documento ${docType}: no se puede firmar el acta.`;
    if (!isClosed(upstream.status)) {
      return `Completá ${docType} antes de firmar el acta.`;
    }
  }

  const rf = documents.RF as DocRF;
  if (rf.aptoEntrega !== true) {
    return 'La revisión final (RF) marcó la obra como NO apta para entrega: no se puede firmar el acta.';
  }

  const ac = documents.AC as DocAC | undefined;
  if (!ac) return 'Falta el acta de conformidad (AC).';
  if (ac.status === 'firmado') return 'El acta ya está firmada.';
  if (ac.firmaCliente?.firma) return 'El acta ya tiene la firma del cliente.';

  return null;
}
