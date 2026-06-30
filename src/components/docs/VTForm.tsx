'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { buildLockedSnapshot } from '@/lib/inheritance';
import { enqueuePhoto, removePhotoFromDoc } from '@/lib/photos';
import PhotoThumb from '@/components/docs/PhotoThumb';
import { useAuth } from '@/hooks/useAuth';
import type { Project, DocVT, AnyDoc, DocType } from '@/schemas';
import {
  ENCUENTROS_CRITICOS, CONDICIONES_ESPACIO,
} from '@/schemas';
import { useUsers } from '@/hooks/useUsers';
import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
import { templateSeedFor } from '@/lib/protocolDefaults';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

const EMPTY_VT: Partial<DocVT> = {
  fechaVisita: '',
  tecnico: '',
  ambientes: [],
  m2Total: 0,
  estadoSoporte: '',
  materialSoporte: '',
  humedad: { medicionPct: 0, metodo: '', apto: false },
  nivelacion: { desnivelMm: 0, apto: false },
  encuentrosCriticos: [],
  condicionesEspacio: [],
  registroFotografico: [],
  dictamen: '',
  dictamenDetalle: '',
  observaciones: '',
};

// Varillas de un ambiente: lista repetible (tipo + tamaño), arranca vacía y se
// suman con "+ agregar varilla" (pueden ser muchas por ambiente).
function AmbienteVarillas({ control, register, nestIndex, isLocked, inputCls }: {
  control: Control<DocVT>;
  register: UseFormRegister<DocVT>;
  nestIndex: number;
  isLocked: boolean;
  inputCls: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `ambientes.${nestIndex}.varillas`,
  });
  return (
    <div className="space-y-2">
      <p className="text-xs text-[#6B6155]">Varillas</p>
      {fields.map((f, j) => (
        <div key={f.id} className="flex gap-2 items-center">
          <input
            {...register(`ambientes.${nestIndex}.varillas.${j}.tipo`)}
            className={`${inputCls} flex-1`}
            placeholder="Tipo (de varilla)"
            disabled={isLocked}
          />
          <input
            {...register(`ambientes.${nestIndex}.varillas.${j}.tamano`)}
            className={`${inputCls} flex-1`}
            placeholder="Tamaño (de varilla)"
            disabled={isLocked}
          />
          {!isLocked && (
            <button type="button" onClick={() => remove(j)} className="text-red-400 text-sm shrink-0">✕</button>
          )}
        </div>
      ))}
      {!isLocked && (
        <button
          type="button"
          onClick={() => append({ tipo: '', tamano: '' })}
          className="text-xs text-[#C38A5A] font-semibold"
        >
          + Agregar varilla
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: {
  title: string; children: React.ReactNode;
}) {
  return (
    <div className="doc-section rounded-lg overflow-hidden border border-[rgba(43,45,47,0.10)]">
      <div className="px-4 py-2.5" style={{ background: '#7B4A28' }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
          | {title}
        </span>
      </div>
      <div className="px-4 pb-4 pt-3 space-y-3 bg-white border-t border-[rgba(43,45,47,0.06)]">
        {children}
      </div>
    </div>
  );
}

export default function VTForm({ projectCode, project, upstream, docData }: Props) {
  const { user } = useAuth();
  const users = useUsers();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'VT');
  const seedDoc = docData as DocVT | null;
  const vt = (liveDoc as DocVT | null) ?? seedDoc;
  const isLocked = vt?.status === 'completo' || vt?.status === 'firmado';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();
  const { template, loading: tplLoading } = useProtocolTemplate();
  const seededRef = useRef(false);
  // Preview local de fotos: Map<id, objectURL>. No se persiste en RHF ni Firestore.
  const [photoPreviews, setPhotoPreviews] = useState<Map<string, string>>(new Map());
  const [photoError, setPhotoError] = useState<string | null>(null);

  const { register, control, watch, getValues, setValue, reset } = useForm<DocVT>({
    defaultValues: { ...(EMPTY_VT as DocVT), ...vt },
  });

  const { fields: ambientes, append: addAmbiente, remove: removeAmbiente } = useFieldArray({
    control, name: 'ambientes',
  });

  // Seed de campos: una sola vez. Doc vacío espera el template antes de sembrar.
  useEffect(() => {
    if (!seedDoc || seededRef.current) return;
    const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
    if (isEmpty && tplLoading) return;
    reset({
      ...(EMPTY_VT as DocVT),
      ...(isEmpty ? templateSeedFor('VT', template) : {}),
      ...seedDoc,
    });
    seededRef.current = true;
  }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line

  // Revocar blob local cuando la foto pasa de pending→subida en Firestore.
  useEffect(() => {
    const livePhotos = (liveDoc as import('@/schemas').DocVT | null)?.registroFotografico ?? [];
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
      autosave(rest as Partial<DocVT>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  // Recalcular m2Total al cambiar ambientes.
  useEffect(() => {
    const sub = watch((values, { name, type }) => {
      if (type !== 'change') return;
      if (name?.startsWith('ambientes')) {
        const total = (values.ambientes ?? []).reduce((s, a) => s + (Number(a?.m2) || 0), 0);
        setValue('m2Total', total);
      }
    });
    return () => sub.unsubscribe();
  }, [watch, setValue]);

  async function handleLock() {
    const values = getValues();
    const errs: string[] = [];
    if (!values.fechaVisita) errs.push('Fecha de visita requerida');
    if (!values.tecnico) errs.push('Técnico responsable requerido');
    if (!values.estadoSoporte) errs.push('Estado del soporte requerido');
    if (!values.materialSoporte) errs.push('Material del soporte requerido');
    if (!values.dictamen) errs.push('Dictamen requerido');
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!await openConfirm('¿Marcar como completo? El documento quedará bloqueado.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      const { registroFotografico: _, ...restValues } = values;
      const livePhotos = (liveDoc as import('@/schemas').DocVT | null)?.registroFotografico ?? [];
      const fullValues = { ...restValues, registroFotografico: livePhotos };
      const snapshot = buildLockedSnapshot(project, upstream, { ...fullValues, docType: 'VT' } as AnyDoc);
      await setDocStatus(projectCode, 'VT', 'completo', {
        ...fullValues,
        lockedSnapshot: snapshot,
        lockedAt: Date.now(),
        lockedBy: user?.uid ?? '',
        version: (vt?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'VT', 'completo', snapshot, (vt?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo bloquear el documento.']);
    } finally {
      setLocking(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoError(null);
    try {
      // lib/photos.ts escribe en Firestore; guardamos solo el blob para preview local.
      const { id, localBlob } = await enqueuePhoto(projectCode, 'VT', file, user.uid);
      setPhotoPreviews((prev) => new Map(prev).set(id, localBlob));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'No se pudo agregar la foto.');
    }
  }

  async function removePhoto(id: string) {
    if (!await openConfirm('¿Eliminar esta foto?')) return;
    const livePhotos = (liveDoc as import('@/schemas').DocVT | null)?.registroFotografico ?? [];
    const photo = livePhotos.find((p) => p.id === id);
    if (!photo) return;
    await removePhotoFromDoc(projectCode, 'VT', photo);
    setPhotoPreviews((prev) => {
      const blob = prev.get(id);
      if (blob) URL.revokeObjectURL(blob);
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] mb-1.5';

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#6B6155] capitalize">
          {vt?.status ?? 'vacio'}
        </span>
        <SaveIndicator state={saveState} />
      </div>

      {isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Documento bloqueado · Solo lectura
        </div>
      )}

      {/* Datos básicos */}
      <Section title="Datos de la visita y soporte">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fechaVisita" className={labelCls}>Fecha de visita *</label>
            <input id="fechaVisita" type="date" {...register('fechaVisita')} className={inputCls} disabled={isLocked} />
          </div>
          <div>
            <label htmlFor="tecnico" className={labelCls}>Técnico *</label>
            <select id="tecnico" {...register('tecnico')} className={inputCls} disabled={isLocked}>
              <option value="">— Seleccionar —</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="estadoSoporte" className={labelCls}>Estado del soporte *</label>
            <select id="estadoSoporte" {...register('estadoSoporte')} className={inputCls} disabled={isLocked}>
              <option value="">— Seleccionar —</option>
              <option value="bueno">Bueno</option>
              <option value="regular">Regular</option>
              <option value="malo">Malo</option>
            </select>
          </div>
          <div>
            <label htmlFor="materialSoporte" className={labelCls}>Material del soporte *</label>
            <select id="materialSoporte" {...register('materialSoporte')} className={inputCls} disabled={isLocked}>
              <option value="">— Seleccionar —</option>
              <option value="carpeta">Carpeta</option>
              <option value="contrapiso">Contrapiso</option>
              <option value="ceramico">Cerámico</option>
              <option value="madera">Madera</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Ambientes */}
      <Section title="Ambientes">
        <div className="space-y-3">
          {ambientes.map((field, i) => (
            <div key={field.id} className="rounded-md border border-[rgba(43,45,47,0.12)] p-3 space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label htmlFor={`ambientes-${i}-nombre`} className="text-xs text-[#6B6155] mb-0.5 block">Nombre</label>
                  <input id={`ambientes-${i}-nombre`} {...register(`ambientes.${i}.nombre`)} className={inputCls} placeholder="Ej: Living" disabled={isLocked} />
                </div>
                <div className="w-20">
                  <label htmlFor={`ambientes-${i}-m2`} className="text-xs text-[#6B6155] mb-0.5 block">m²</label>
                  <input id={`ambientes-${i}-m2`} type="number" inputMode="decimal" {...register(`ambientes.${i}.m2`, { valueAsNumber: true })} className={inputCls} disabled={isLocked} />
                </div>
                <div className="w-24">
                  <label htmlFor={`ambientes-${i}-zocalo`} className="text-xs text-[#6B6155] mb-0.5 block">Zócalo (ml)</label>
                  <input id={`ambientes-${i}-zocalo`} type="number" inputMode="decimal" {...register(`ambientes.${i}.zocaloMl`, { valueAsNumber: true })} className={inputCls} disabled={isLocked} />
                </div>
                {!isLocked && (
                  <button type="button" onClick={() => removeAmbiente(i)} className="text-red-400 text-sm pb-3 shrink-0">✕</button>
                )}
              </div>
              <AmbienteVarillas control={control} register={register} nestIndex={i} isLocked={isLocked} inputCls={inputCls} />
            </div>
          ))}
          {!isLocked && (
            <button type="button" onClick={() => addAmbiente({ nombre: '', m2: 0, zocaloMl: 0, varillas: [] })} className="text-sm text-[#C38A5A] font-semibold">
              + Agregar ambiente
            </button>
          )}
          <p className="text-xs text-[#6B6155] font-mono">Total: {watch('m2Total') ?? 0} m²</p>
        </div>
      </Section>

      {/* Humedad */}
      <Section title="Humedad">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="humedad-medicionPct" className={labelCls}>Medición %</label>
            <input id="humedad-medicionPct" type="number" inputMode="decimal" {...register('humedad.medicionPct', { valueAsNumber: true })} className={inputCls} disabled={isLocked} />
          </div>
          <div>
            <label htmlFor="humedad-metodo" className={labelCls}>Método</label>
            <select id="humedad-metodo" {...register('humedad.metodo')} className={inputCls} disabled={isLocked}>
              <option value="">— —</option>
              <option value="higrometro">Higrómetro</option>
              <option value="film">Film</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <input type="checkbox" id="humedadApto" {...register('humedad.apto')} disabled={isLocked} />
          <label htmlFor="humedadApto" className="text-sm">Apto para instalación</label>
        </div>
      </Section>

      {/* Nivelación */}
      <Section title="Nivelación">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nivelacion-desnivelMm" className={labelCls}>Desnivel máximo (mm)</label>
            <input id="nivelacion-desnivelMm" type="number" inputMode="decimal" {...register('nivelacion.desnivelMm', { valueAsNumber: true })} className={inputCls} disabled={isLocked} />
          </div>
          <div className="flex items-end pb-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="nivelApto" {...register('nivelacion.apto')} disabled={isLocked} />
              <label htmlFor="nivelApto" className="text-sm">Apto</label>
            </div>
          </div>
        </div>
      </Section>

      {/* Encuentros críticos */}
      <Section title="Encuentros críticos">
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {ENCUENTROS_CRITICOS.map((ec) => (
            <label key={ec} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={ec} {...register('encuentrosCriticos')} disabled={isLocked} />
              {ec.replace('_', ' ')}
            </label>
          ))}
        </div>
      </Section>

      {/* Condiciones del espacio */}
      <Section title="Condiciones del espacio">
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {CONDICIONES_ESPACIO.map((ce) => (
            <label key={ce} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={ce} {...register('condicionesEspacio')} disabled={isLocked} />
              {ce.replace('_', ' ')}
            </label>
          ))}
        </div>
      </Section>

      {/* Fotos */}
      <Section title="Registro fotográfico">
        {!isLocked && (
          <label className="block">
            <span className="text-sm font-semibold text-[#C38A5A]">+ Agregar foto</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhoto}
            />
          </label>
        )}
        {photoError && <p className="text-[12px] text-red-500 mt-1">{photoError}</p>}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {((liveDoc as import('@/schemas').DocVT | null)?.registroFotografico ?? []).map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              localBlob={photoPreviews.get(p.id) ?? null}
              onRemove={isLocked ? undefined : () => removePhoto(p.id)}
            />
          ))}
        </div>
      </Section>

      {/* Dictamen */}
      <Section title="Dictamen">
        <div className="space-y-2">
          {(['apto', 'apto_con_preparacion', 'no_apto'] as const).map((v) => (
            <label key={v} className="flex items-center gap-3 text-sm">
              <input type="radio" value={v} {...register('dictamen')} disabled={isLocked} />
              <span className="capitalize">{v.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <label htmlFor="dictamenDetalle" className={labelCls}>Detalle del dictamen</label>
          <textarea id="dictamenDetalle" rows={3} {...register('dictamenDetalle')} className={inputCls} disabled={isLocked} />
        </div>
        <div>
          <label htmlFor="observaciones" className={labelCls}>Observaciones generales</label>
          <textarea id="observaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
        </div>
      </Section>

      {/* Errores de validación pre-bloqueo */}
      {lockErrors.length > 0 && (
        <div className="border border-red-300/50 bg-red-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de bloquear</p>
          {lockErrors.map((e, i) => <p key={i} className="text-[13px] text-red-500">· {e}</p>)}
        </div>
      )}

      {/* Acción de bloqueo */}
      {!isLocked && (
        <button
          type="button"
          onClick={handleLock}
          disabled={locking}
          className="w-full font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 no-print transition-colors text-white"
          style={{ background: '#C38A5A' }}
        >
          {locking ? 'Bloqueando…' : 'Marcar como completo'}
        </button>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
