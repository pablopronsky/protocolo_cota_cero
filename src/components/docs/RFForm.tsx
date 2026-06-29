'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { enqueuePhoto, removePhotoFromDoc } from '@/lib/photos';
import PhotoThumb from '@/components/docs/PhotoThumb';
import { useAuth } from '@/hooks/useAuth';
import type { Project, DocRF, AnyDoc, DocType } from '@/schemas';
import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
import { templateSeedFor } from '@/lib/protocolDefaults';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

const EMPTY_RF: Partial<DocRF> = {
  cumpleEP: '', cumpleOT: '', checklistCalidad: [],
  registroFotografico: [], observaciones: '',
  aptoEntrega: false, revisadoPor: '', fechaRevision: '',
};

export default function RFForm({ projectCode, project, upstream, docData }: Props) {
  const { user } = useAuth();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'RF');
  const seedDoc = docData as DocRF | null;
  const rf = (liveDoc as DocRF | null) ?? seedDoc;
  const isLocked = rf?.status === 'completo' || rf?.status === 'firmado';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<Map<string, string>>(new Map());
  const { template, loading: tplLoading } = useProtocolTemplate();
  const seededRef = useRef(false);

  const seed = deriveInherited(project, upstream, 'RF');

  const { register, control, watch, getValues, setValue, reset } = useForm<DocRF>({
    defaultValues: rf ?? (EMPTY_RF as DocRF),
  });

  const { fields: checklist, append: addCheck, remove: removeCheck } = useFieldArray({ control, name: 'checklistCalidad' });

  // Seed de campos: una sola vez. Doc vacío espera el template antes de sembrar.
  useEffect(() => {
    if (!seedDoc || seededRef.current) return;
    const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
    if (isEmpty && tplLoading) return;
    reset({
      ...(EMPTY_RF as DocRF),
      ...(isEmpty ? templateSeedFor('RF', template) : {}),
      ...seedDoc,
    });
    seededRef.current = true;
  }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line

  // Revocar blob local cuando la foto pasa de pending→subida en Firestore.
  useEffect(() => {
    const livePhotos = (liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? [];
    setPhotoPreviews((prev) => {
      const next = new Map(prev);
      for (const p of livePhotos) {
        if (!p.pending && next.has(p.id)) {
          URL.revokeObjectURL(next.get(p.id)!);
          next.delete(p.id);
        }
      }
      return next;
    });
  }, [liveDoc]);

  // Autosave: excluir registroFotografico — lib/photos.ts es el único escritor.
  // Gatear en type==='change' para evitar autosave fantasma al hacer reset() (#6).
  useEffect(() => {
    const sub = watch((values, { type }) => {
      if (type !== 'change') return;
      if (isLocked) return;
      const { registroFotografico: _, ...rest } = values;
      autosave(rest as Partial<DocRF>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleLock() {
    const values = getValues();
    const errs: string[] = [];
    if (!values.cumpleEP) errs.push('Cumplimiento EP requerido');
    if (!values.cumpleOT) errs.push('Cumplimiento OT requerido');
    if (!values.fechaRevision) errs.push('Fecha de revisión requerida');
    if (!values.aptoEntrega) errs.push('Marcar como apto para entrega antes de firmar');
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!window.confirm('¿Aprobar y firmar la revisión? El documento quedará bloqueado.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      const { registroFotografico: _, ...restValues } = values;
      const livePhotos = (liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? [];
      const fullValues = { ...restValues, registroFotografico: livePhotos };
      const snapshot = buildLockedSnapshot(project, upstream, { ...fullValues, docType: 'RF' } as AnyDoc);
      await setDocStatus(projectCode, 'RF', 'firmado', {
        ...fullValues, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (rf?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status);
      await writeRevision(projectCode, 'RF', 'firmado', snapshot, (rf?.version ?? 0) + 1, user?.uid ?? '');
    } finally { setLocking(false); }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const { id, localBlob } = await enqueuePhoto(projectCode, 'RF', file, user.uid);
    setPhotoPreviews((prev) => new Map(prev).set(id, localBlob));
  }

  async function removePhoto(id: string) {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    const livePhotos = (liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? [];
    const photo = livePhotos.find((p) => p.id === id);
    if (!photo) return;
    await removePhotoFromDoc(projectCode, 'RF', photo);
    setPhotoPreviews((prev) => {
      const blob = prev.get(id);
      if (blob) URL.revokeObjectURL(blob);
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#B8AEA3] mb-1.5';
  const ro = seed.readonly as Record<string, unknown>;

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#B8AEA3] capitalize">{rf?.status ?? 'vacio'}</span>
        <SaveIndicator state={saveState} />
      </div>

      {isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Documento bloqueado · Solo lectura
        </div>
      )}

      {/* Heredados */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Referencia OT · Solo lectura</p>
        <p className="text-sm"><span className="text-[#B8AEA3]">Alcance:</span> {String(ro.alcance || '—')}</p>
        {Array.isArray(ro.condicionesParaIniciar) && ro.condicionesParaIniciar.length > 0 && (
          <p className="text-sm"><span className="text-[#B8AEA3]">Condiciones EP:</span> {(ro.condicionesParaIniciar as string[]).join(', ').replace(/_/g, ' ')}</p>
        )}
      </div>

      {/* Cumplimiento EP */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Cumplimiento EP</p>
        {(['si', 'no', 'parcial'] as const).map((v) => (
          <label key={v} className="flex items-center gap-3 text-sm capitalize">
            <input type="radio" value={v} {...register('cumpleEP')} disabled={isLocked} />
            {v}
          </label>
        ))}
        {watch('cumpleEP') !== 'si' && (
          <div>
            <label htmlFor="desviosEP" className={labelCls}>Desvíos EP</label>
            <textarea id="desviosEP" rows={2} {...register('desviosEP')} className={inputCls} disabled={isLocked} />
          </div>
        )}
      </div>

      {/* Cumplimiento OT */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Cumplimiento OT</p>
        {(['si', 'no', 'parcial'] as const).map((v) => (
          <label key={v} className="flex items-center gap-3 text-sm capitalize">
            <input type="radio" value={v} {...register('cumpleOT')} disabled={isLocked} />
            {v}
          </label>
        ))}
        {watch('cumpleOT') !== 'si' && (
          <div>
            <label htmlFor="desviosOT" className={labelCls}>Desvíos OT</label>
            <textarea id="desviosOT" rows={2} {...register('desviosOT')} className={inputCls} disabled={isLocked} />
          </div>
        )}
      </div>

      {/* Checklist de calidad */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Checklist de calidad</p>
        {checklist.map((f, i) => (
          <div key={f.id} className="flex gap-2 items-center">
            <input placeholder="Ítem" {...register(`checklistCalidad.${i}.item`)} className={`${inputCls} flex-1`} disabled={isLocked} />
            <select {...register(`checklistCalidad.${i}.estado`)} className={`${inputCls} w-28`} disabled={isLocked}>
              <option value="">—</option>
              <option value="ok">OK</option>
              <option value="observado">Observado</option>
              <option value="rehacer">Rehacer</option>
            </select>
            {!isLocked && <button type="button" onClick={() => removeCheck(i)} className="text-red-400 text-sm">✕</button>}
          </div>
        ))}
        {!isLocked && (
          <button type="button" onClick={() => addCheck({ item: '', estado: '' })} className="text-sm text-[#C38A5A] font-semibold">+ Agregar ítem</button>
        )}
      </div>

      {/* Fotos */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Registro fotográfico</p>
        {!isLocked && (
          <label className="block">
            <span className="text-sm font-semibold text-[#C38A5A]">+ Agregar foto</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </label>
        )}
        <div className="grid grid-cols-3 gap-2">
          {((liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? []).map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              localBlob={photoPreviews.get(p.id) ?? null}
              onRemove={isLocked ? undefined : () => removePhoto(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Apto entrega + datos */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" {...register('aptoEntrega')} disabled={isLocked} />
          Apto para entrega
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fechaRevision" className={labelCls}>Fecha revisión</label>
            <input id="fechaRevision" type="date" {...register('fechaRevision')} className={inputCls} disabled={isLocked} />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="rfObservaciones" className={labelCls}>Observaciones</label>
        <textarea id="rfObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
      </div>

      {lockErrors.length > 0 && (
        <div className="border border-red-300/50 bg-red-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de firmar</p>
          {lockErrors.map((e, i) => <p key={i} className="text-[13px] text-red-500">· {e}</p>)}
        </div>
      )}

      {!isLocked && (
        <button type="button" onClick={handleLock} disabled={locking}
          className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 no-print transition-colors" style={{ background: '#C38A5A' }}>
          {locking ? 'Firmando…' : 'Aprobar y firmar revisión'}
        </button>
      )}
    </form>
  );
}
