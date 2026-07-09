'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useDoc, offlineLockError } from '@/hooks/useDoc';
import { setDocStatus, writeRevision, reopenDoc } from '@/lib/repo/projects';
import { sequencingError } from '@/lib/sequencing';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { enqueuePhoto, removePhotoFromDoc } from '@/lib/photos';
import PhotoThumb from '@/components/docs/PhotoThumb';
import { Section } from '@/components/docs/Section';
import { SectionNav } from '@/components/docs/SectionNav';
import { DocActionBar } from '@/components/docs/DocActionBar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
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
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const { docData: liveDoc, autosave, cancelAutosave } = useDoc(projectCode, 'RF');
  const seedDoc = docData as DocRF | null;
  const rf = (liveDoc as DocRF | null) ?? seedDoc;
  const isArchived = project.status === 'archivado';
  const isLocked = rf?.status === 'completo' || rf?.status === 'firmado' || isArchived;
  const [locking, setLocking] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const { confirmOpen, confirmMessage, confirmDanger, openConfirm, onConfirm, onCancel } = useConfirm();
  const [photoPreviews, setPhotoPreviews] = useState<Map<string, string>>(new Map());
  const [photoError, setPhotoError] = useState<string | null>(null);
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
  // Gatear en `name` — reset() (seed, #6) emite sin name; las ediciones del
  // usuario (inputs nativos, setValue y field arrays) siempre lo traen. Gatear
  // en type==='change' perdía los removes de filas del checklist.
  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (!name) return;
      if (isLocked) return;
      const { registroFotografico: _, ...rest } = values;
      autosave(rest as Partial<DocRF>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleLock() {
    const offline = offlineLockError();
    if (offline) { setLockErrors([offline]); return; }
    const values = getValues();
    const errs: string[] = [];
    if (!values.cumpleEP) errs.push('Cumplimiento EP requerido');
    if (!values.cumpleOT) errs.push('Cumplimiento OT requerido');
    if (!values.fechaRevision) errs.push('Fecha de revisión requerida');
    const seqErr = sequencingError('RF', 'firmado', project.docStatus, upstream);
    if (seqErr) errs.push(seqErr);
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    // Una revisión NO apta también se firma (documenta el resultado real); el
    // acta queda bloqueada por secuencia hasta corregir y reabrir la RF.
    const confirmMsg = values.aptoEntrega
      ? '¿Aprobar y firmar la revisión? El documento quedará bloqueado.'
      : '¿Firmar la revisión como NO apta para entrega? El acta no podrá firmarse hasta corregir la obra y reabrir la revisión. El documento quedará bloqueado.';
    if (!await openConfirm(confirmMsg, { danger: !values.aptoEntrega })) return;
    cancelAutosave();
    setLocking(true);
    try {
      const { registroFotografico: _, ...restValues } = values;
      const livePhotos = (liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? [];
      const fullValues = {
        ...restValues,
        revisadoPor: restValues.revisadoPor || (user?.uid ?? ''),
        registroFotografico: livePhotos,
      };
      const snapshot = buildLockedSnapshot(project, upstream, { ...fullValues, docType: 'RF' } as AnyDoc);
      await setDocStatus(projectCode, 'RF', 'firmado', {
        ...fullValues, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (rf?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'RF', 'firmado', snapshot, (rf?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo firmar la revisión.']);
    } finally { setLocking(false); }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoError(null);
    try {
      const { id, localBlob } = await enqueuePhoto(projectCode, 'RF', file, user.uid);
      setPhotoPreviews((prev) => new Map(prev).set(id, localBlob));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'No se pudo agregar la foto.');
    }
  }

  async function removePhoto(id: string) {
    if (!await openConfirm('¿Eliminar esta foto?', { danger: true })) return;
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

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-[14px] focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-60 pointer-events-none bg-[#F0EDE7] border-[rgba(43,45,47,0.12)] text-[#6B6155]' : 'bg-white border-[rgba(43,45,47,0.18)] text-[#2B2D2F]'}`;
  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';
  const ro = seed.readonly as Record<string, unknown>;

  async function handleReopen() {
    if (!await openConfirm('¿Reabrir este documento? Volverá a "en progreso" y quedará editable.', { danger: true })) return;
    setReopening(true);
    try {
      await reopenDoc(projectCode, 'RF', user?.uid ?? '');
      await writeRevision(projectCode, 'RF', 'en_progreso', (rf ?? {}) as Record<string, unknown>, (rf?.version ?? 0) + 1, user?.uid ?? '');
      showToast('Documento reabierto', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo reabrir el documento.', 'error');
    } finally {
      setReopening(false);
    }
  }

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      {!isArchived && isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span>Documento bloqueado · Solo lectura</span>
          {role === 'admin' && (
            <Button variant="danger" size="sm" onClick={handleReopen} disabled={reopening}>
              {reopening ? 'Reabriendo…' : 'Reabrir'}
            </Button>
          )}
        </div>
      )}

      <SectionNav sections={[
        { id: 'rf-ep', label: 'Cumplimiento EP', done: !!rf?.cumpleEP },
        { id: 'rf-ot', label: 'Cumplimiento OT', done: !!rf?.cumpleOT },
        { id: 'rf-checklist', label: 'Checklist', done: (rf?.checklistCalidad?.length ?? 0) > 0 },
        { id: 'rf-fotos', label: 'Fotos', done: (rf?.registroFotografico?.length ?? 0) > 0 },
        { id: 'rf-entrega', label: 'Apto entrega', done: !!rf?.fechaRevision },
      ]} />

      {/* Heredados */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Referencia OT · Solo lectura</p>
        <p className="text-sm"><span className="text-[#6B6155]">Alcance:</span> {String(ro.alcance || '—')}</p>
        {Array.isArray(ro.condicionesParaIniciar) && ro.condicionesParaIniciar.length > 0 && (
          <p className="text-sm"><span className="text-[#6B6155]">Condiciones EP:</span> {(ro.condicionesParaIniciar as string[]).join(', ').replace(/_/g, ' ')}</p>
        )}
      </div>

      {/* Cumplimiento EP */}
      <Section id="rf-ep" title="Cumplimiento EP">
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
      </Section>

      {/* Cumplimiento OT */}
      <Section id="rf-ot" title="Cumplimiento OT">
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
      </Section>

      {/* Checklist de calidad */}
      <Section id="rf-checklist" title="Checklist de calidad">
        {checklist.map((f, i) => (
          <div key={f.id} className="flex flex-wrap gap-2 items-center">
            <input placeholder="Ítem" {...register(`checklistCalidad.${i}.item`)} className={`${inputCls} flex-1 min-w-[8rem]`} disabled={isLocked} />
            <select {...register(`checklistCalidad.${i}.estado`)} className={`${inputCls} w-28`} disabled={isLocked}>
              <option value="">—</option>
              <option value="ok">OK</option>
              <option value="observado">Observado</option>
              <option value="rehacer">Rehacer</option>
            </select>
            {!isLocked && <button type="button" onClick={() => removeCheck(i)} aria-label="Eliminar ítem" className="p-1.5 -m-1.5 text-red-400 text-sm">✕</button>}
          </div>
        ))}
        {!isLocked && (
          <button type="button" onClick={() => addCheck({ item: '', estado: '' })} className="text-sm text-[#C38A5A] font-semibold">+ Agregar ítem</button>
        )}
      </Section>

      {/* Fotos */}
      <Section id="rf-fotos" title="Registro fotográfico">
        {!isLocked && (
          <label className="block">
            <span className="text-sm font-semibold text-[#C38A5A]">+ Agregar foto</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </label>
        )}
        {photoError && <p className="text-[12px] text-red-500">{photoError}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {((liveDoc as import('@/schemas').DocRF | null)?.registroFotografico ?? []).map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              localBlob={photoPreviews.get(p.id) ?? null}
              onRemove={isLocked ? undefined : () => removePhoto(p.id)}
            />
          ))}
        </div>
      </Section>

      {/* Apto entrega + datos */}
      <Section id="rf-entrega" title="Apto para entrega">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" {...register('aptoEntrega')} disabled={isLocked} />
          Apto para entrega
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="fechaRevision" className={labelCls}>Fecha revisión</label>
            <input id="fechaRevision" type="date" {...register('fechaRevision')} className={inputCls} disabled={isLocked} />
          </div>
        </div>
      </Section>

      <div>
        <label htmlFor="rfObservaciones" className={labelCls}>Observaciones</label>
        <textarea id="rfObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
      </div>

      {!isLocked && (
        <DocActionBar>
          {lockErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de firmar</p>
              {lockErrors.map((e, i) => <p key={i} className="text-[12px] text-red-500">· {e}</p>)}
            </div>
          )}
          <button type="button" onClick={handleLock} disabled={locking}
            className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 transition-colors" style={{ background: '#C38A5A' }}>
            {locking ? 'Firmando…' : watch('aptoEntrega') ? 'Aprobar y firmar revisión' : 'Firmar revisión'}
          </button>
        </DocActionBar>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} danger={confirmDanger} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
