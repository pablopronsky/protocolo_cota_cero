'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useAuth } from '@/hooks/useAuth';
import { archiveProject, unarchiveProject } from '@/lib/repo/projects';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { DocType, DocStatus } from '@/schemas';
import { DOC_ORDER, DOC_LABELS } from '@/schemas';

const STATUS_CONFIG: Record<DocStatus, {
  label: string;
  rowCls: string;
  codeCls: string;
  labelCls: string;
  numCls: string;
  dotCls: string;
  chevronCls: string;
}> = {
  vacio: {
    label: 'Pendiente',
    rowCls: 'border-[rgba(43,45,47,0.08)] bg-white hover:border-[#C38A5A]/30 hover:shadow-[0_1px_8px_rgba(195,138,90,0.05)]',
    codeCls: 'text-[#B8AEA3]/60',
    labelCls: 'text-[#B8AEA3]',
    numCls: 'text-[#B8AEA3]/35',
    dotCls: 'border-[#B8AEA3]/25 bg-transparent',
    chevronCls: 'text-[#B8AEA3]/30',
  },
  en_progreso: {
    label: 'En progreso',
    rowCls: 'border-[#C38A5A]/22 bg-[#C38A5A]/[0.025] hover:border-[#C38A5A]/45 hover:shadow-[0_1px_8px_rgba(195,138,90,0.08)]',
    codeCls: 'text-[#C38A5A]',
    labelCls: 'text-[#2B2D2F]',
    numCls: 'text-[#C38A5A]/50',
    dotCls: 'border-[#C38A5A]/45 bg-[#C38A5A]/22',
    chevronCls: 'text-[#C38A5A]/50',
  },
  completo: {
    label: 'Completo',
    rowCls: 'border-[rgba(43,45,47,0.12)] bg-white hover:border-[#C38A5A]/35',
    codeCls: 'text-[#2B2D2F]',
    labelCls: 'text-[#2B2D2F]',
    numCls: 'text-[#2B2D2F]/35',
    dotCls: 'border-[#C38A5A] bg-[#C38A5A]',
    chevronCls: 'text-[#B8AEA3]/40',
  },
  firmado: {
    label: 'Firmado',
    rowCls: 'border-[#2B2D2F] bg-[#2B2D2F] hover:border-[#2B2D2F]',
    codeCls: 'text-[#C38A5A]',
    labelCls: 'text-[#F5F2ED]',
    numCls: 'text-[#B8AEA3]/45',
    dotCls: 'border-[#C38A5A] bg-[#C38A5A]',
    chevronCls: 'text-[#B8AEA3]/35',
  },
};

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { project, docs, loading } = useProject(code);
  const { role, user } = useAuth();
  const router = useRouter();
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();

  if (loading) {
    return (
      <div className="py-20 text-center">
        <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#B8AEA3]/60">
          Cargando…
        </span>
      </div>
    );
  }

  if (!project) {
    return <p className="text-sm text-red-500">Proyecto no encontrado.</p>;
  }

  const isArchived = project.status === 'archivado';

  async function handleArchive() {
    if (!project) return;
    if (isArchived) {
      await unarchiveProject(project.code);
    } else {
      if (!await openConfirm('¿Archivar este proyecto? Quedará en solo lectura.')) return;
      await archiveProject(project.code);
    }
  }

  async function handleDuplicate() {
    if (!project || !user) return;
    const token = await user.getIdToken();
    const res = await fetch('/api/projects/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ originCode: project.code }),
    });
    if (res.ok) {
      const { code: newCode } = await res.json();
      router.push(`/projects/${newCode}`);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'No se pudo duplicar el proyecto.');
    }
  }

  return (
    <>
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#B8AEA3]/60 hover:text-[#C38A5A] transition-colors"
      >
        <span className="text-base leading-none">←</span>
        Proyectos
      </Link>

      {/* Project header */}
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="font-mono text-[11px] font-bold text-[#C38A5A] tracking-widest">
            {project.code}
          </span>
          {isArchived && (
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] border border-[#B8AEA3]/25 text-[#B8AEA3]/50 rounded px-1.5 py-px">
              Archivado
            </span>
          )}
        </div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">
          <Link
            href={`/clients/${encodeURIComponent(project.clienteId)}`}
            className="text-[#2B2D2F] hover:text-[#C38A5A] transition-colors"
            title="Ver ficha del cliente"
          >
            {project.clienteNombre}
          </Link>
        </h1>
        <p className="text-[13px] text-[#B8AEA3] mt-1.5 leading-snug">
          {project.domicilioObra.calle} {project.domicilioObra.numero}
          {project.domicilioObra.referencia ? ` · ${project.domicilioObra.referencia}` : ''}
          {' — '}{project.domicilioObra.localidad}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B8AEA3]/55 mt-1.5">
          {project.tipoEspacio.replace(/_/g, ' ')}
          {' · '}
          {project.modalidad.replace(/_/g, ' ')}
        </p>
      </div>

      {isArchived && (
        <div className="border border-[#B8AEA3]/20 rounded-md px-4 py-3 text-[12px] text-[#B8AEA3]/70 bg-white">
          Proyecto archivado · documentos en solo lectura.
        </div>
      )}

      {/* Protocol steps */}
      <div>
        <p className="eyebrow mb-3">Protocolo de obra</p>
        <div className="space-y-1.5">
          {DOC_ORDER.map((docType: DocType, i) => {
            const status = project.docStatus?.[docType] ?? 'vacio';
            const cfg = STATUS_CONFIG[status];
            const docData = docs[docType];
            const upstreamEmpty =
              i > 0 && (project.docStatus?.[DOC_ORDER[i - 1]] ?? 'vacio') === 'vacio';

            return (
              <Link
                key={docType}
                href={isArchived ? '#' : `/projects/${project.code}/${docType}`}
                className={`block border rounded-lg px-4 py-3 transition-all duration-150 ${cfg.rowCls} ${
                  isArchived ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Step number */}
                  <span className={`font-mono text-[13px] font-bold shrink-0 w-4 text-right ${cfg.numCls}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {/* Status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full border shrink-0 ${cfg.dotCls}`} />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`font-mono text-[14px] font-bold ${cfg.codeCls}`}>
                        {docType}
                      </span>
                      <span className={`text-[13px] font-medium ${cfg.labelCls}`}>
                        {DOC_LABELS[docType]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[12px] ${cfg.labelCls} opacity-55`}>
                        {cfg.label}
                      </span>
                      {upstreamEmpty && status === 'vacio' && (
                        <span className="text-[12px] text-[#C38A5A]/65">
                          · Completar {DOC_ORDER[i - 1]} primero
                        </span>
                      )}
                      {docData && 'updatedAt' in docData && (
                        <span className={`text-[12px] ${cfg.labelCls} opacity-35`}>
                          · {new Date(docData.updatedAt as number).toLocaleDateString('es-AR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm leading-none shrink-0 ${cfg.chevronCls}`}>›</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Material */}
      <div className="bg-white border border-[rgba(43,45,47,0.08)] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[rgba(43,45,47,0.06)]">
          <p className="eyebrow text-[10px]">Material a instalar</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[13px] font-semibold text-[#2B2D2F] capitalize">
            {project.materialInstalado.tipo} · {project.materialInstalado.descripcion}
          </p>
          {project.materialInstalado.m2Estimados && (
            <p className="text-[12px] font-mono text-[#B8AEA3] mt-1">
              {project.materialInstalado.m2Estimados} m²
            </p>
          )}
        </div>
      </div>

      {/* Entregable cliente PDF */}
      {project.docStatus?.AC === 'firmado' ? (
        <Link
          href={`/print/${project.code}/entregable`}
          target="_blank"
          className="block w-full text-center text-[11px] font-bold uppercase tracking-[0.22em] rounded-md py-3 text-white transition-colors"
          style={{ background: '#C38A5A' }}
        >
          Entregable cliente · PDF
        </Link>
      ) : (
        <div className="block w-full text-center text-[11px] font-bold uppercase tracking-[0.22em] rounded-md py-3 text-[#B8AEA3]/50" style={{ background: '#f5f2ed' }}>
          Disponible al firmar el acta
        </div>
      )}

      {/* Legajo PDF */}
      <Link
        href={`/print/${project.code}`}
        target="_blank"
        className="block w-full text-center text-[11px] font-bold uppercase tracking-[0.22em] border border-[rgba(43,45,47,0.15)] rounded-md py-3 text-[#B8AEA3]/60 hover:border-[#C38A5A]/40 hover:text-[#C38A5A] transition-colors"
      >
        Legajo completo · PDF
      </Link>

      {/* Admin actions */}
      {role === 'admin' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDuplicate}
            className="flex-1 text-[11px] font-bold uppercase tracking-[0.2em] border border-[rgba(43,45,47,0.15)] rounded-md py-3 text-[#2B2D2F]/70 hover:border-[#C38A5A]/35 hover:text-[#C38A5A] transition-colors cursor-pointer"
          >
            Duplicar plantilla
          </button>
          <button
            onClick={handleArchive}
            className="flex-1 text-[11px] font-bold uppercase tracking-[0.2em] border border-[rgba(43,45,47,0.15)] rounded-md py-3 text-[#2B2D2F]/70 hover:border-[#C38A5A]/35 hover:text-[#C38A5A] transition-colors cursor-pointer"
          >
            {isArchived ? 'Desarchivar' : 'Archivar'}
          </button>
        </div>
      )}
    </div>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
