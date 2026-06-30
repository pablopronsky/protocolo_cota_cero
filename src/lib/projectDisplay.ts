import type { DocStatus } from '@/schemas';
import { DOC_ORDER } from '@/schemas';

// Estilos del badge de estado del proyecto. Compartido entre la lista de
// proyectos y las vistas de clientes para mantener una sola fuente de verdad.
export const PROJECT_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  borrador:  { label: 'Borrador',  bg: 'bg-[#B8AEA3]/20', text: 'text-[#B8AEA3]' },
  en_curso:  { label: 'En Curso',  bg: 'bg-[#7BA88A]/20', text: 'text-[#5A8A6A]' },
  entregado: { label: 'Entregado', bg: 'bg-[#2B2D2F]/10', text: 'text-[#2B2D2F]' },
  archivado: { label: 'Archivado', bg: 'bg-[#B8AEA3]/10', text: 'text-[#B8AEA3]/60' },
};

// Progreso 0–100 del legajo según el estado de los 6 documentos.
export function calcProgress(docStatus: Record<string, DocStatus>): number {
  const weights: Record<DocStatus, number> = {
    vacio: 0, en_progreso: 0.5, completo: 1, firmado: 1,
  };
  const total = DOC_ORDER.reduce((sum, dt) => sum + (weights[docStatus?.[dt] ?? 'vacio'] ?? 0), 0);
  return Math.round((total / DOC_ORDER.length) * 100);
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).replace('.', '');
}
