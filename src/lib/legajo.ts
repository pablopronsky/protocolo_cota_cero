import { DOC_ORDER, DOC_LABELS } from '@/schemas';
import type { AnyDoc, DocType, DocStatus } from '@/schemas';

export type DocRow = {
  docType: DocType;
  label: string;
  status: DocStatus;
  locked: boolean;
  version: number;
  updatedAt: number | null;
};

export function isDocLocked(status: DocStatus | undefined): boolean {
  return status === 'completo' || status === 'firmado';
}

// El legajo impreso deriva estado, cierre y finalidad EXCLUSIVAMENTE de los
// documentos reales (documents/{docType}.status), nunca de project.docStatus:
// ese mapa es un espejo denormalizado que puede quedar desfasado (mismo
// principio que lib/deliverable.ts y /api/sign/request).
export function buildDocRows(docs: Partial<Record<DocType, AnyDoc>>): DocRow[] {
  return DOC_ORDER.map((docType) => {
    const doc = docs[docType];
    const status = (doc?.status ?? 'vacio') as DocStatus;
    return {
      docType,
      label: DOC_LABELS[docType],
      status,
      locked: isDocLocked(status),
      version: doc?.version ?? 0,
      updatedAt: typeof doc?.updatedAt === 'number' ? doc.updatedAt : null,
    };
  });
}

export function isLegajoFinal(rows: DocRow[]): boolean {
  const statusByType = Object.fromEntries(rows.map((row) => [row.docType, row.status])) as Partial<Record<DocType, DocStatus>>;
  return rows.length === DOC_ORDER.length
    && rows.every((row) => row.locked)
    && statusByType.RF === 'firmado'
    && statusByType.AC === 'firmado';
}
