'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import InheritedBanner from '@/components/InheritedBanner';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { sequencingError } from '@/lib/sequencing';
import { buildLockedSnapshot, detectDrift, deriveInherited } from '@/lib/inheritance';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Project, DocEP, AnyDoc, DocType } from '@/schemas';
import { LIMPIEZA_SOPORTE, CONDICIONES_INICIAR } from '@/schemas';
import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
import { templateSeedFor } from '@/lib/protocolDefaults';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

export default function EPForm({ projectCode, project, upstream, docData }: Props) {
  const { user } = useAuth();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'EP');
  const seedDoc = docData as DocEP | null;
  const ep = (liveDoc as DocEP | null) ?? seedDoc;
  const isLocked = ep?.status === 'completo' || ep?.status === 'firmado';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();
  const { template, loading: tplLoading } = useProtocolTemplate();
  const seededRef = useRef(false);

  const seed = deriveInherited(project, upstream, 'EP');
  const drifts = ep ? detectDrift(ep, project, upstream) : [];

  // Mezcla los valores guardados con el seed de herencia. Un doc recién creado
  // existe pero sin los campos heredados, así que hay que sembrarlos desde VT.
  function withSeed(base: Partial<DocEP> | null): DocEP {
    return {
      requiereNivelacion: false,
      tratamientoHumedad: false,
      requiereImprimacion: false,
      limpiezaSoporte: [],
      reparacionesPrevias: [],
      condicionesParaIniciar: [],
      observaciones: '',
      ...(base ?? {}),
      desnivelMm: base?.desnivelMm ?? (seed.editable.desnivelMm as DocEP['desnivelMm']),
      humedadPct: base?.humedadPct ?? (seed.editable.humedadPct as DocEP['humedadPct']),
    } as DocEP;
  }

  const { register, control, watch, getValues, setValue, reset } = useForm<DocEP>({
    defaultValues: withSeed(ep),
  });

  const { fields: reparaciones, append: addReparacion, remove: removeReparacion } = useFieldArray({
    control, name: 'reparacionesPrevias',
  });

  // Seed de campos: una sola vez. Doc vacío espera el template antes de sembrar.
  useEffect(() => {
    if (!seedDoc || seededRef.current) return;
    const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
    if (isEmpty && tplLoading) return;
    reset(withSeed(isEmpty ? { ...templateSeedFor('EP', template), ...seedDoc } : seedDoc));
    seededRef.current = true;
  }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line

  // Autosave: gatear en type==='change' para evitar autosave fantasma al hacer reset() (#6).
  useEffect(() => {
    const sub = watch((values, { type }) => {
      if (type !== 'change') return;
      if (isLocked) return;
      autosave(values as Partial<DocEP>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  function reimport() {
    const newSeed = deriveInherited(project, upstream, 'EP');
    setValue('desnivelMm', newSeed.editable.desnivelMm as DocEP['desnivelMm']);
    setValue('humedadPct', newSeed.editable.humedadPct as DocEP['humedadPct']);
  }

  async function handleLock() {
    const values = getValues();
    const errs: string[] = [];
    if (!values.condicionesParaIniciar?.length) errs.push('Seleccionar al menos una condición para iniciar');
    if (values.requiereNivelacion && !values.metodoNivelacion) errs.push('Método de nivelación requerido');
    if (values.tratamientoHumedad && !values.barreraVapor) errs.push('Barrera de vapor requerida');
    if (values.requiereImprimacion && !values.productoImprimacion) errs.push('Producto de imprimación requerido');
    const seqErr = sequencingError('EP', 'completo', project.docStatus, upstream);
    if (seqErr) errs.push(seqErr);
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!await openConfirm('¿Marcar como completo? El documento quedará bloqueado.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      const snapshot = buildLockedSnapshot(project, upstream, { ...values, docType: 'EP' } as AnyDoc);
      await setDocStatus(projectCode, 'EP', 'completo', {
        ...values, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (ep?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'EP', 'completo', snapshot, (ep?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo bloquear el documento.']);
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#B8AEA3] mb-1.5';

  // Campos heredados readonly desde VT
  const roFields = seed.readonly;

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#B8AEA3] capitalize">{ep?.status ?? 'vacio'}</span>
        <SaveIndicator state={saveState} />
      </div>

      {isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Documento bloqueado · Solo lectura
        </div>
      )}

      <InheritedBanner drifts={drifts} onReimport={reimport} />

      {/* Heredados readonly */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Datos de VT · Solo lectura</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-xs text-[#B8AEA3]">Estado soporte</p><p className="font-medium capitalize">{String(roFields.estadoSoporte || '—')}</p></div>
          <div><p className="text-xs text-[#B8AEA3]">Material soporte</p><p className="font-medium capitalize">{String(roFields.materialSoporte || '—')}</p></div>
          <div><p className="text-xs text-[#B8AEA3]">Dictamen VT</p><p className="font-medium capitalize">{String(roFields.dictamen || '—').replace('_', ' ')}</p></div>
        </div>
      </div>

      {/* Editables heredados */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Mediciones</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="desnivelMm" className={labelCls}>Desnivel (mm)</label>
            <input id="desnivelMm" type="number" inputMode="decimal"
              value={watch('desnivelMm')?.value ?? 0}
              onChange={(e) => setValue('desnivelMm', { ...(watch('desnivelMm') as DocEP['desnivelMm']), value: Number(e.target.value), overridden: true })}
              className={inputCls} disabled={isLocked} />
          </div>
          <div>
            <label htmlFor="humedadPct" className={labelCls}>Humedad (%)</label>
            <input id="humedadPct" type="number" inputMode="decimal"
              value={watch('humedadPct')?.value ?? 0}
              onChange={(e) => setValue('humedadPct', { ...(watch('humedadPct') as DocEP['humedadPct']), value: Number(e.target.value), overridden: true })}
              className={inputCls} disabled={isLocked} />
          </div>
        </div>
      </div>

      {/* Nivelación */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Nivelación</p>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" {...register('requiereNivelacion')} disabled={isLocked} />
          Requiere nivelación
        </label>
        {watch('requiereNivelacion') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="metodoNivelacion" className={labelCls}>Método</label>
              <select id="metodoNivelacion" {...register('metodoNivelacion')} className={inputCls} disabled={isLocked}>
                <option value="">— —</option>
                <option value="autonivelante">Autonivelante</option>
                <option value="mortero">Mortero</option>
                <option value="lijado">Lijado</option>
              </select>
            </div>
            <div>
              <label htmlFor="espesorMm" className={labelCls}>Espesor (mm)</label>
              <input id="espesorMm" type="number" inputMode="decimal" {...register('espesorMm', { valueAsNumber: true })} className={inputCls} disabled={isLocked} />
            </div>
          </div>
        )}
      </div>

      {/* Humedad */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Tratamiento de humedad</p>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" {...register('tratamientoHumedad')} disabled={isLocked} />
          Requiere tratamiento
        </label>
        {watch('tratamientoHumedad') && (
          <div>
            <label htmlFor="barreraVapor" className={labelCls}>Barrera de vapor</label>
            <select id="barreraVapor" {...register('barreraVapor')} className={inputCls} disabled={isLocked}>
              <option value="">— —</option>
              <option value="polietileno">Polietileno</option>
              <option value="imprimacion_epoxi">Imprimación epoxi</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        )}
      </div>

      {/* Imprimación */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Imprimación</p>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" {...register('requiereImprimacion')} disabled={isLocked} />
          Requiere imprimación
        </label>
        {watch('requiereImprimacion') && (
          <div>
            <label htmlFor="productoImprimacion" className={labelCls}>Producto</label>
            <input id="productoImprimacion" {...register('productoImprimacion')} className={inputCls} disabled={isLocked} />
          </div>
        )}
      </div>

      {/* Limpieza */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Limpieza del soporte</p>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {LIMPIEZA_SOPORTE.map((l) => (
            <label key={l} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={l} {...register('limpiezaSoporte')} disabled={isLocked} />
              {l.replace('_', ' ')}
            </label>
          ))}
        </div>
      </div>

      {/* Reparaciones previas */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Reparaciones previas</p>
        {reparaciones.map((field, i) => (
          <div key={field.id} className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor={`reparacion-${i}-zona`} className="text-xs text-[#B8AEA3] block mb-0.5">Zona</label>
              <input id={`reparacion-${i}-zona`} {...register(`reparacionesPrevias.${i}.zona`)} className={inputCls} disabled={isLocked} />
            </div>
            <div className="flex-1">
              <label htmlFor={`reparacion-${i}-accion`} className="text-xs text-[#B8AEA3] block mb-0.5">Acción</label>
              <input id={`reparacion-${i}-accion`} {...register(`reparacionesPrevias.${i}.accion`)} className={inputCls} disabled={isLocked} />
            </div>
            {!isLocked && (
              <button type="button" onClick={() => removeReparacion(i)} className="text-red-400 text-sm pb-3">✕</button>
            )}
          </div>
        ))}
        {!isLocked && (
          <button type="button" onClick={() => addReparacion({ zona: '', accion: '' })} className="text-sm text-[#C38A5A] font-semibold">
            + Agregar reparación
          </button>
        )}
      </div>

      {/* Condiciones para iniciar */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Condiciones para iniciar</p>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {CONDICIONES_INICIAR.map((c) => (
            <label key={c} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={c} {...register('condicionesParaIniciar')} disabled={isLocked} />
              {c.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="tiemposSecadoEstimados" className={labelCls}>Tiempos de secado estimados</label>
        <input id="tiemposSecadoEstimados" {...register('tiemposSecadoEstimados')} className={inputCls} disabled={isLocked} />
      </div>

      <div>
        <label htmlFor="epObservaciones" className={labelCls}>Observaciones</label>
        <textarea id="epObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
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
