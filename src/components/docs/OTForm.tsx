'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { sequencingError } from '@/lib/sequencing';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Project, DocOT, AnyDoc, DocType } from '@/schemas';
import { CRITERIOS_TECNICOS } from '@/schemas';
import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
import { templateSeedFor } from '@/lib/protocolDefaults';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

const EMPTY_OT: Partial<DocOT> = {
  equipo: [], fechaInicio: '', fechaFinEstimada: '', alcance: '',
  secuenciaEjecucion: [], criteriosTecnicos: [], materialesHerramientas: [],
  registroIncidencias: [], observaciones: '',
};

export default function OTForm({ projectCode, project, upstream, docData }: Props) {
  const { user } = useAuth();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'OT');
  const seedDoc = docData as DocOT | null;
  const ot = (liveDoc as DocOT | null) ?? seedDoc;
  const isLocked = ot?.status === 'completo' || ot?.status === 'firmado';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();
  const { template, loading: tplLoading } = useProtocolTemplate();
  const seededRef = useRef(false);

  const seed = deriveInherited(project, upstream, 'OT');

  const { register, control, watch, getValues, reset } = useForm<DocOT>({
    defaultValues: ot ?? (EMPTY_OT as DocOT),
  });

  const { fields: equipo, append: addEquipo, remove: removeEquipo } = useFieldArray({ control, name: 'equipo' });
  const { fields: secuencia, append: addPaso, remove: removePaso } = useFieldArray({ control, name: 'secuenciaEjecucion' });
  const { fields: materiales, append: addMaterial, remove: removeMaterial } = useFieldArray({ control, name: 'materialesHerramientas' });
  const { fields: incidencias, append: addIncidencia, remove: removeIncidencia } = useFieldArray({ control, name: 'registroIncidencias' });

  // Seed de campos: una sola vez. Doc vacío espera el template antes de sembrar.
  useEffect(() => {
    if (!seedDoc || seededRef.current) return;
    const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
    if (isEmpty && tplLoading) return;
    reset({
      ...(EMPTY_OT as DocOT),
      ...(isEmpty ? templateSeedFor('OT', template) : {}),
      ...seedDoc,
    });
    seededRef.current = true;
  }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line

  // Autosave: gatear en type==='change' para evitar autosave fantasma al hacer reset() (#6).
  useEffect(() => {
    const sub = watch((values, { type }) => {
      if (type !== 'change') return;
      if (isLocked) return;
      autosave(values as Partial<DocOT>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleLock() {
    const values = getValues();
    const errs: string[] = [];
    if (!values.fechaInicio) errs.push('Fecha de inicio requerida');
    if (!values.alcance?.trim()) errs.push('Alcance de la obra requerido');
    if (!values.equipo?.length) errs.push('Agregar al menos un integrante del equipo');
    if (!values.secuenciaEjecucion?.length) errs.push('Agregar al menos un paso en la secuencia');
    const seqErr = sequencingError('OT', 'completo', project.docStatus, upstream);
    if (seqErr) errs.push(seqErr);
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!await openConfirm('¿Marcar como completo? El documento quedará bloqueado.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      const snapshot = buildLockedSnapshot(project, upstream, { ...values, docType: 'OT' } as AnyDoc);
      await setDocStatus(projectCode, 'OT', 'completo', {
        ...values, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (ot?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'OT', 'completo', snapshot, (ot?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo bloquear el documento.']);
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#B8AEA3] mb-1.5';
  const ro = seed.readonly as Record<string, unknown>;

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#B8AEA3] capitalize">{ot?.status ?? 'vacio'}</span>
        <SaveIndicator state={saveState} />
      </div>

      {isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Documento bloqueado · Solo lectura
        </div>
      )}

      {/* Heredados readonly */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Datos heredados · Solo lectura</p>
        <div className="text-sm space-y-1">
          {project.domicilioObra && (
            <p><span className="text-[#B8AEA3]">Domicilio:</span> {project.domicilioObra.calle} {project.domicilioObra.numero}, {project.domicilioObra.localidad}</p>
          )}
          <p><span className="text-[#B8AEA3]">Material:</span> {project.materialInstalado.tipo} · {project.materialInstalado.descripcion}</p>
          <p><span className="text-[#B8AEA3]">Soporte:</span> {String(ro.materialSoporte || '—')}</p>
        </div>
      </div>

      {/* Equipo */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Equipo</p>
        {equipo.map((f, i) => (
          <div key={f.id} className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor={`equipo-${i}-nombre`} className="text-xs text-[#B8AEA3] block mb-0.5">Nombre</label>
              <input id={`equipo-${i}-nombre`} {...register(`equipo.${i}.nombre`)} className={inputCls} disabled={isLocked} />
            </div>
            <div className="flex-1">
              <label htmlFor={`equipo-${i}-rol`} className="text-xs text-[#B8AEA3] block mb-0.5">Rol</label>
              <input id={`equipo-${i}-rol`} {...register(`equipo.${i}.rol`)} className={inputCls} disabled={isLocked} />
            </div>
            {!isLocked && <button type="button" onClick={() => removeEquipo(i)} className="text-red-400 text-sm pb-3">✕</button>}
          </div>
        ))}
        {!isLocked && <button type="button" onClick={() => addEquipo({ nombre: '', rol: '' })} className="text-sm text-[#C38A5A] font-semibold">+ Agregar</button>}
      </div>

      {/* Fechas y alcance */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fechaInicio" className={labelCls}>Fecha inicio</label>
            <input id="fechaInicio" type="date" {...register('fechaInicio')} className={inputCls} disabled={isLocked} />
          </div>
          <div>
            <label htmlFor="fechaFinEstimada" className={labelCls}>Fecha fin estimada</label>
            <input id="fechaFinEstimada" type="date" {...register('fechaFinEstimada')} className={inputCls} disabled={isLocked} />
          </div>
        </div>
        <div>
          <label htmlFor="alcance" className={labelCls}>Alcance de la obra *</label>
          <textarea id="alcance" rows={3} {...register('alcance')} className={inputCls} disabled={isLocked} placeholder="Descripción general del trabajo a realizar…" />
        </div>
      </div>

      {/* Secuencia de ejecución */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Secuencia de ejecución</p>
        {secuencia.map((f, i) => (
          <div key={f.id} className="border border-[rgba(43,45,47,0.10)] rounded-md px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#B8AEA3]">Paso {i + 1}</span>
              {!isLocked && <button type="button" onClick={() => removePaso(i)} className="text-red-400 text-xs">✕</button>}
            </div>
            <input placeholder="Descripción" {...register(`secuenciaEjecucion.${i}.descripcion`)} className={inputCls} disabled={isLocked} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" {...register(`secuenciaEjecucion.${i}.completado`)} disabled={isLocked} />
              Completado
            </label>
          </div>
        ))}
        {!isLocked && (
          <button type="button" onClick={() => addPaso({ paso: secuencia.length + 1, descripcion: '', completado: false })}
            className="text-sm text-[#C38A5A] font-semibold">+ Agregar paso</button>
        )}
      </div>

      {/* Criterios técnicos */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Criterios técnicos</p>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {CRITERIOS_TECNICOS.map((c) => (
            <label key={c} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={c} {...register('criteriosTecnicos')} disabled={isLocked} />
              {c.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </div>

      {/* Materiales y herramientas */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Materiales y herramientas</p>
        {materiales.map((f, i) => (
          <div key={f.id} className="flex gap-2 items-end">
            <div className="flex-1"><input placeholder="Item" {...register(`materialesHerramientas.${i}.item`)} className={inputCls} disabled={isLocked} /></div>
            <div className="w-20"><input type="number" placeholder="Cant." {...register(`materialesHerramientas.${i}.cantidad`, { valueAsNumber: true })} className={inputCls} disabled={isLocked} /></div>
            <div className="w-28">
              <select {...register(`materialesHerramientas.${i}.provistoPor`)} className={inputCls} disabled={isLocked}>
                <option value="cota_cero">COTA CERO</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            {!isLocked && <button type="button" onClick={() => removeMaterial(i)} className="text-red-400 text-sm pb-3">✕</button>}
          </div>
        ))}
        {!isLocked && <button type="button" onClick={() => addMaterial({ item: '', cantidad: 1, provistoPor: 'cota_cero' })} className="text-sm text-[#C38A5A] font-semibold">+ Agregar</button>}
      </div>

      {/* Registro de incidencias */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Registro de incidencias</p>
        {incidencias.map((f, i) => (
          <div key={f.id} className="border border-[rgba(43,45,47,0.10)] rounded-md px-3 py-2 space-y-2">
            <div className="flex gap-2">
              <input type="date" {...register(`registroIncidencias.${i}.fecha`)} className={`${inputCls} flex-1`} disabled={isLocked} />
              {!isLocked && <button type="button" onClick={() => removeIncidencia(i)} className="text-red-400 text-xs">✕</button>}
            </div>
            <input placeholder="Descripción" {...register(`registroIncidencias.${i}.descripcion`)} className={inputCls} disabled={isLocked} />
            <input placeholder="Acción tomada" {...register(`registroIncidencias.${i}.accion`)} className={inputCls} disabled={isLocked} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" {...register(`registroIncidencias.${i}.resuelto`)} disabled={isLocked} />
              Resuelto
            </label>
          </div>
        ))}
        {!isLocked && <button type="button" onClick={() => addIncidencia({ fecha: '', descripcion: '', accion: '', resuelto: false })} className="text-sm text-[#C38A5A] font-semibold">+ Agregar incidencia</button>}
      </div>

      <div>
        <label htmlFor="otObservaciones" className={labelCls}>Observaciones</label>
        <textarea id="otObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
      </div>

      {lockErrors.length > 0 && (
        <div className="border border-red-300/50 bg-red-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de bloquear</p>
          {lockErrors.map((e, i) => <p key={i} className="text-[13px] text-red-500">· {e}</p>)}
        </div>
      )}

      {!isLocked && (
        <button type="button" onClick={handleLock} disabled={locking}
          className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 no-print transition-colors" style={{ background: '#C38A5A' }}>
          {locking ? 'Bloqueando…' : 'Marcar como completo'}
        </button>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
