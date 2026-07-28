'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useAuth } from '@/hooks/useAuth';
import { archiveProject, unarchiveProject, updateProjectMaterial } from '@/lib/repo/projects';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { DocType, DocStatus, Project } from '@/schemas';
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
    codeCls: 'text-[#6B6155]',
    labelCls: 'text-[#6B6155]',
    numCls: 'text-[#6B6155]',
    dotCls: 'border-[#B8AEA3]/25 bg-transparent',
    chevronCls: 'text-[#6B6155]',
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
    chevronCls: 'text-[#6B6155]',
  },
  firmado: {
    label: 'Firmado',
    rowCls: 'border-[#2B2D2F] bg-[#2B2D2F] hover:border-[#2B2D2F]',
    codeCls: 'text-[#C38A5A]',
    labelCls: 'text-[#F5F2ED]',
    numCls: 'text-[#B8AEA3]/70',
    dotCls: 'border-[#C38A5A] bg-[#C38A5A]',
    chevronCls: 'text-[#B8AEA3]/60',
  },
};

function isDocLocked(status: DocStatus | undefined): boolean {
  return status === 'completo' || status === 'firmado';
}

function isLegajoFinal(docStatus: Partial<Record<DocType, DocStatus>> | undefined): boolean {
  return DOC_ORDER.every((docType) => isDocLocked(docStatus?.[docType]))
    && docStatus?.RF === 'firmado'
    && docStatus?.AC === 'firmado';
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { project, docs, loading, error } = useProject(code);
  const { role, user } = useAuth();
  const router = useRouter();
  const { confirmOpen, confirmMessage, confirmDanger, openConfirm, onConfirm, onCancel } = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialTipo, setMaterialTipo] = useState<Project['materialInstalado']['tipo'] | ''>('');
  const [materialDescripcion, setMaterialDescripcion] = useState('');
  const [materialM2, setMaterialM2] = useState('');

  if (loading) {
    return (
      <div className="py-20 text-center">
        <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#6B6155]">
          Cargando…
        </span>
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="text-sm text-red-500">{error} Recargá la página para volver a intentar.</p>;
  }

  if (!project) {
    return <p className="text-sm text-red-500">Proyecto no encontrado.</p>;
  }

  const isArchived = project.status === 'archivado';
  const legajoFinal = isLegajoFinal(project.docStatus);

  async function handleArchive() {
    if (!project) return;
    if (isArchived) {
      await unarchiveProject(project.code);
    } else {
      if (!await openConfirm('¿Archivar este proyecto? Quedará en solo lectura.', { danger: true })) return;
      await archiveProject(project.code);
    }
  }

  async function handleDuplicate() {
    // El guard de `duplicating` evita que un doble tap dispare dos duplicados.
    if (!project || !user || duplicating) return;
    setActionError(null);
    setDuplicating(true);
    try {
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
        setActionError(data.error ?? 'No se pudo duplicar el proyecto.');
      }
    } catch {
      setActionError('No se pudo duplicar el proyecto.');
    } finally {
      setDuplicating(false);
    }
  }

  function startEditingMaterial() {
    if (!project) return;
    setMaterialTipo(project.materialInstalado.tipo);
    setMaterialDescripcion(project.materialInstalado.descripcion);
    setMaterialM2(project.materialInstalado.m2Estimados?.toString() ?? '');
    setActionError(null);
    setActionSuccess(null);
    setEditingMaterial(true);
  }

  async function handleSaveMaterial() {
    if (!project || !materialTipo || !materialDescripcion.trim()) {
      setActionError('Completá el tipo y la descripción del material.');
      return;
    }
    const parsedM2 = materialM2.trim() ? Number(materialM2.replace(',', '.')) : undefined;
    if (parsedM2 !== undefined && (!Number.isFinite(parsedM2) || parsedM2 <= 0)) {
      setActionError('Ingresá una superficie válida.');
      return;
    }

    setSavingMaterial(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateProjectMaterial(project.code, {
        tipo: materialTipo,
        descripcion: materialDescripcion.trim(),
        ...(parsedM2 !== undefined ? { m2Estimados: parsedM2 } : {}),
      });
      setEditingMaterial(false);
      setActionSuccess('Material actualizado. La ficha de mantenimiento usará estos datos.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo actualizar el material.');
    } finally {
      setSavingMaterial(false);
    }
  }

  return (
    <>
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors"
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
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] border border-[#B8AEA3]/25 text-[#6B6155] rounded px-1.5 py-px">
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
        <p className="text-[13px] text-[#6B6155] mt-1.5 leading-snug">
          {project.domicilioObra.calle} {project.domicilioObra.numero}
          {project.domicilioObra.referencia ? ` · ${project.domicilioObra.referencia}` : ''}
          {' — '}{project.domicilioObra.localidad}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] mt-1.5">
          {project.tipoEspacio.replace(/_/g, ' ')}
          {' · '}
          {project.modalidad.replace(/_/g, ' ')}
        </p>
      </div>

      {isArchived && (
        <div className="border border-[#B8AEA3]/20 rounded-md px-4 py-3 text-[12px] text-[#6B6155] bg-white">
          Proyecto archivado · documentos en solo lectura.
        </div>
      )}

      {actionError && (
        <div className="border border-red-300/50 bg-red-50 rounded-md px-4 py-3 text-[13px] text-red-500">
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="border border-emerald-700/20 bg-emerald-50 rounded-md px-4 py-3 text-[13px] text-emerald-800">
          {actionSuccess}
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

            // Los borradores se editan en cualquier orden (el contrato del
            // protocolo solo gatea el CIERRE, ver sequencing.ts). El hint
            // "Completar X primero" queda como guía, sin bloquear el acceso.
            const isBlocked = isArchived;

            return (
              <Link
                key={docType}
                href={isBlocked ? '#' : `/projects/${project.code}/${docType}`}
                aria-disabled={isBlocked}
                tabIndex={isBlocked ? -1 : undefined}
                className={`block border rounded-lg px-4 py-3 transition-all duration-150 ${cfg.rowCls} ${
                  isBlocked ? 'pointer-events-none opacity-50' : 'cursor-pointer'
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
        <div className="px-4 py-2.5 border-b border-[rgba(43,45,47,0.06)] flex items-center justify-between gap-3">
          <p className="eyebrow text-[10px]">Material a instalar</p>
          {role === 'admin' && !isArchived && !editingMaterial && (
            <button
              type="button"
              onClick={startEditingMaterial}
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8F5B33] hover:text-[#C38A5A] transition-colors"
            >
              Editar material
            </button>
          )}
        </div>
        <div className="px-4 py-3.5">
          {editingMaterial ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.8fr_0.7fr] gap-3">
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#6B6155] mb-1.5">Tipo</span>
                  <select
                    value={materialTipo}
                    onChange={(event) => setMaterialTipo(event.target.value as Project['materialInstalado']['tipo'])}
                    className="field-input w-full"
                  >
                    <option value="laminado">Laminado</option>
                    <option value="spc">SPC</option>
                    <option value="madera">Madera</option>
                    <option value="deck">Deck</option>
                    <option value="revestimiento">Revestimiento</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#6B6155] mb-1.5">Marca, modelo o especificación</span>
                  <input
                    value={materialDescripcion}
                    onChange={(event) => setMaterialDescripcion(event.target.value)}
                    className="field-input w-full"
                    placeholder="Ej.: SPC 5 mm · capa de uso 0,5 mm"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#6B6155] mb-1.5">Superficie m²</span>
                  <input
                    value={materialM2}
                    onChange={(event) => setMaterialM2(event.target.value)}
                    className="field-input w-full"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-[#6B6155]">
                Este dato aparece en la portada, el legajo y la ficha de mantenimiento.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(false)}
                  disabled={savingMaterial}
                  className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B6155] border border-[rgba(43,45,47,0.14)] rounded-md disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveMaterial}
                  disabled={savingMaterial}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white bg-[#C38A5A] rounded-md disabled:opacity-50"
                >
                  {savingMaterial ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-[#2B2D2F]">
                  <span className="uppercase">{project.materialInstalado.tipo}</span>
                  <span className="text-[#C38A5A] mx-2">·</span>
                  {project.materialInstalado.descripcion}
                </p>
                <p className="text-[11px] text-[#6B6155] mt-1">Especificación vigente para la obra</p>
              </div>
              {project.materialInstalado.m2Estimados && (
                <p className="text-[12px] font-mono font-bold text-[#6B6155] shrink-0">
                  {project.materialInstalado.m2Estimados.toLocaleString('es-AR')} m²
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Entregable cliente PDF */}
      <Link
        href={`/print/${project.code}/entregable`}
        target="_blank"
        className="block w-full text-center text-[11px] font-bold uppercase tracking-[0.22em] rounded-md py-3 text-white transition-colors"
        style={{ background: '#C38A5A' }}
      >
        Entregable cliente · PDF
      </Link>

      {/* Legajo PDF */}
      <Link
        href={`/print/${project.code}`}
        target="_blank"
        className={`block w-full text-center text-[11px] font-bold uppercase tracking-[0.22em] border rounded-md py-3 transition-colors ${
          legajoFinal
            ? 'border-[#C38A5A]/55 text-[#2B2D2F] hover:border-[#C38A5A] hover:text-[#C38A5A]'
            : 'border-[#C38A5A]/35 text-[#8F5B33] hover:border-[#C38A5A]/60'
        }`}
      >
        {legajoFinal ? 'Legajo final · PDF' : 'Vista previa legajo · PDF'}
      </Link>

      {/* Admin actions */}
      {role === 'admin' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="flex-1 text-[11px] font-bold uppercase tracking-[0.2em] border border-[rgba(43,45,47,0.15)] rounded-md py-3 text-[#2B2D2F]/70 hover:border-[#C38A5A]/35 hover:text-[#C38A5A] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {duplicating ? 'Duplicando…' : 'Duplicar plantilla'}
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
      <ConfirmDialog open={confirmOpen} message={confirmMessage} danger={confirmDanger} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
