import type { AnyDoc, DocAC, DocRF, DocStatus, DocType } from '@/schemas';

// #P0-1 — Cuándo existe un entregable FINAL.
//
// El entregable es el documento que el cliente se lleva. Antes se generaba para
// cualquier obra y la portada estampaba "Apto para entrega" de forma fija, así
// que una obra sin acta firmada producía un PDF con aspecto definitivo.
//
// La condición se evalúa SIEMPRE sobre los documentos reales, nunca sobre
// `project.docStatus`: ese mapa es un espejo denormalizado que puede quedar
// desfasado (lo escribe el cliente en un batch aparte) y no conoce
// `RF.aptoEntrega`.

export const DRAFT_NOTICE = 'BORRADOR — NO VÁLIDO PARA ENTREGA';

export interface DeliverableGate {
  /** true solo si la obra puede producir el entregable definitivo. */
  final: boolean;
  /** Motivos por los que todavía no es final, en lenguaje de obra. */
  reasons: string[];
}

function isClosed(status: DocStatus | undefined): boolean {
  return status === 'completo' || status === 'firmado';
}

export function evaluateDeliverable(
  documents: Partial<Record<DocType, AnyDoc>>,
): DeliverableGate {
  const reasons: string[] = [];

  const rf = documents.RF as DocRF | undefined;
  if (!rf) {
    reasons.push('Falta la revisión final (RF).');
  } else {
    if (!isClosed(rf.status)) {
      reasons.push('La revisión final (RF) todavía no está cerrada.');
    }
    if (rf.aptoEntrega !== true) {
      reasons.push('La revisión final (RF) no marcó la obra como apta para entrega.');
    }
  }

  const ac = documents.AC as DocAC | undefined;
  if (!ac) {
    reasons.push('Falta el acta de conformidad (AC).');
  } else if (ac.status !== 'firmado') {
    reasons.push('El acta de conformidad (AC) todavía no está firmada.');
  }

  return { final: reasons.length === 0, reasons };
}
