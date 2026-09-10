import { DOC_ORDER, type AnyDoc, type DocStatus, type DocType, type ProjectStatus } from '@/schemas';

export function documentStatuses(docs: Partial<Record<DocType, AnyDoc>>): Record<DocType, DocStatus> {
  return Object.fromEntries(DOC_ORDER.map(type => [type, docs[type]?.status ?? 'vacio'])) as Record<DocType, DocStatus>;
}

export function effectiveProjectStatus(docs: Partial<Record<DocType, AnyDoc>>, archived = false): ProjectStatus {
  if (archived) return 'archivado';
  if (docs.AC?.status === 'firmado') return 'entregado';
  return Object.values(docs).some(doc => doc?.status !== 'vacio') ? 'en_curso' : 'borrador';
}
