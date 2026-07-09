'use client';

import { use } from 'react';
import Link from 'next/link';
import { useProject } from '@/hooks/useProject';
import type { DocType } from '@/schemas';
import { Skeleton } from '@/components/ui/Skeleton';
import VTForm from '@/components/docs/VTForm';
import EPForm from '@/components/docs/EPForm';
import OTForm from '@/components/docs/OTForm';
import RFForm from '@/components/docs/RFForm';
import ACForm from '@/components/docs/ACForm';
import FMForm from '@/components/docs/FMForm';
import { DOC_LABELS, DOC_ORDER } from '@/schemas';
import type { DocStatus } from '@/schemas';

const VALID_DOC_TYPES: DocType[] = ['VT', 'EP', 'OT', 'RF', 'AC', 'FM'];

const STATUS_LABEL: Record<DocStatus, string> = {
  vacio: 'Pendiente',
  en_progreso: 'En progreso',
  completo: 'Completo',
  firmado: 'Firmado',
};

export default function DocEditorPage({
  params,
}: {
  params: Promise<{ code: string; docType: string }>;
}) {
  const { code, docType: rawDocType } = use(params);
  const docType = rawDocType as DocType;
  const stepNum = DOC_ORDER.indexOf(docType) + 1;

  const { project, docs, loading } = useProject(code);

  if (loading) {
    return (
      <div className="pb-20 max-w-2xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (!project) return <p className="text-sm text-red-500">Proyecto no encontrado.</p>;
  if (!VALID_DOC_TYPES.includes(docType)) return <p className="text-sm text-red-500">Tipo de documento inválido.</p>;

  const docData = docs[docType] ?? null;
  // project.docStatus es el mirror en vivo (subscribeProject): refleja el cierre
  // del doc sin recargar, a diferencia de docs[docType] que es un snapshot.
  const currentStatus: DocStatus = project.docStatus?.[docType] ?? 'vacio';
  const isArchived = project.status === 'archivado';
  const commonProps = { projectCode: code, project, upstream: docs, docData };

  return (
    <div className="pb-20 max-w-2xl">
      {/* ── Breadcrumb ─────────────────────────────────── */}
      <Link
        href={`/projects/${code}`}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors mb-5 no-print"
      >
        <span className="text-base leading-none">←</span>
        Proyecto
      </Link>

      {/* Project code */}
      <p className="font-mono text-[11px] font-bold text-[#C38A5A] tracking-widest mb-3">
        {code}
      </p>

      {/* Step + title */}
      <div className="flex items-center gap-4 mb-1.5 flex-wrap">
        <span
          className="inline-flex items-center justify-center font-mono font-bold text-[#F5F2ED] rounded"
          style={{
            fontSize: 18,
            width: 40,
            height: 40,
            background: '#C38A5A',
            flexShrink: 0,
          }}
        >
          {String(stepNum).padStart(2, '0')}
        </span>
        <h1
          className="font-bold text-[#2B2D2F] leading-tight text-[22px] sm:text-[28px]"
        >
          {DOC_LABELS[docType]}
        </h1>
        <Link
          href={`/print/${code}/${docType}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] border border-[rgba(43,45,47,0.15)] rounded px-3 py-1.5 text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A] no-print transition-colors"
        >
          Imprimir
        </Link>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2.5 mb-6">
        <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6155]">
          {STATUS_LABEL[currentStatus]}
        </span>
        {isArchived && (
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] border border-[#B8AEA3]/25 text-[#6B6155] rounded px-1.5 py-px">
            Archivado · Solo lectura
          </span>
        )}
      </div>

      {docType === 'VT' && <VTForm {...commonProps} />}
      {docType === 'EP' && <EPForm {...commonProps} />}
      {docType === 'OT' && <OTForm {...commonProps} />}
      {docType === 'RF' && <RFForm {...commonProps} />}
      {docType === 'AC' && <ACForm {...commonProps} />}
      {docType === 'FM' && <FMForm {...commonProps} />}
    </div>
  );
}
