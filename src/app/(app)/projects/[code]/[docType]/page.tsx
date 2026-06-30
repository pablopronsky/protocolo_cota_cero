'use client';

import { use } from 'react';
import Link from 'next/link';
import { useProject } from '@/hooks/useProject';
import type { DocType } from '@/schemas';
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
      <div className="py-16 text-center">
        <span className="text-[13px] font-mono uppercase tracking-[0.2em] text-[#6B6155]">
          Cargando…
        </span>
      </div>
    );
  }
  if (!project) return <p className="text-sm text-red-500">Proyecto no encontrado.</p>;
  if (!VALID_DOC_TYPES.includes(docType)) return <p className="text-sm text-red-500">Tipo de documento inválido.</p>;

  const docData = docs[docType] ?? null;
  const currentStatus = (docData as { status?: DocStatus } | null)?.status ?? 'vacio';
  const commonProps = { projectCode: code, project, upstream: docs, docData };

  return (
    <div className="pb-20 max-w-2xl">
      {/* ── Breadcrumb ─────────────────────────────────── */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors mb-5 no-print"
      >
        <span className="text-base leading-none">←</span>
        Proyectos
      </Link>

      {/* Project code */}
      <p className="font-mono text-[11px] font-bold text-[#C38A5A] tracking-widest mb-3">
        {code}
      </p>

      {/* Step + title */}
      <div className="flex items-center gap-4 mb-1.5">
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
          className="font-bold text-[#2B2D2F] leading-tight"
          style={{ fontSize: 28 }}
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
      <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6155] mb-6">
        {STATUS_LABEL[currentStatus]}
      </span>

      {docType === 'VT' && <VTForm {...commonProps} />}
      {docType === 'EP' && <EPForm {...commonProps} />}
      {docType === 'OT' && <OTForm {...commonProps} />}
      {docType === 'RF' && <RFForm {...commonProps} />}
      {docType === 'AC' && <ACForm {...commonProps} />}
      {docType === 'FM' && <FMForm {...commonProps} />}
    </div>
  );
}
