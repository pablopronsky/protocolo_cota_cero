'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useDoc, offlineLockError } from '@/hooks/useDoc';
import { setDocStatus, writeRevision, reopenDoc } from '@/lib/repo/projects';
import { sequencingError } from '@/lib/sequencing';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { Section } from '@/components/docs/Section';
import { SectionNav } from '@/components/docs/SectionNav';
import { DocActionBar } from '@/components/docs/DocActionBar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import type { Project, DocFM, AnyDoc, DocType } from '@/schemas';
import { USO_RECOMENDADO, PRECAUCIONES_FM, FM_DEFAULTS_BY_TIPO } from '@/schemas';
import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
import { templateSeedFor } from '@/lib/protocolDefaults';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

// Conserva las líneas mientras se escribe (incluida la vacía al final, para que
// Enter funcione); el filtrado de vacías se hace al guardar/bloquear.
const splitLines = (v: string): string[] => v.split('\n');
const cleanLines = (xs: string[] = []): string[] => xs.map((s) => s.trim()).filter(Boolean);

const EMPTY_FM: Partial<DocFM> = {
  usoRecomendado: [], productosAptos: [], productosNoAptos: [],
  frecuenciaLimpieza: '', precauciones: [], recomendaciones: '', observaciones: '',
};

export default function FMForm({ projectCode, project, upstream, docData }: Props) {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const { docData: liveDoc, autosave, cancelAutosave } = useDoc(projectCode, 'FM');
  const seedDoc = docData as DocFM | null;
  const fm = (liveDoc as DocFM | null) ?? seedDoc;
  const isArchived = project.status === 'archivado';
  const isLockedByStatus = fm?.status === 'completo' || fm?.status === 'firmado';
  // Técnicos ven el form en solo lectura: las reglas Firestore restringen la
  // escritura de FM (igual que AC) al admin. Sin este guard, el técnico editaba
  // en la UI y cada autosave fallaba con permission-denied.
  const isLocked = isLockedByStatus || role !== 'admin' || isArchived;
  const [locking, setLocking] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();
  const { template, loading: tplLoading } = useProtocolTemplate();
  const seededRef = useRef(false);

  const seed = deriveInherited(project, upstream, 'FM');
  const ro = seed.readonly as Record<string, unknown>;

  const { register, watch, getValues, setValue, reset } = useForm<DocFM>({
    defaultValues: fm ?? (EMPTY_FM as DocFM),
  });

  // Seed de campos: una sola vez. Doc vacío espera el template antes de sembrar.
  useEffect(() => {
    if (!seedDoc || seededRef.current) return;
    const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
    if (isEmpty && tplLoading) return;
    const tipo = (project.materialInstalado?.tipo ?? 'otro') as keyof typeof FM_DEFAULTS_BY_TIPO;
    const typeDefaults = isEmpty ? (FM_DEFAULTS_BY_TIPO[tipo] ?? FM_DEFAULTS_BY_TIPO.otro) : {};
    reset({
      ...(EMPTY_FM as DocFM),
      ...typeDefaults,
      ...(isEmpty ? templateSeedFor('FM', template) : {}),
      ...seedDoc,
    });
    seededRef.current = true;
  }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line

  // Autosave: gatear en `name` — reset() (seed, #6) emite sin name; las ediciones
  // del usuario (inputs nativos y setValue —los textareas de productos—) siempre
  // lo traen. Gatear en type==='change' perdía lo tipeado en productos aptos/no aptos.
  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (!name) return;
      if (isLocked) return;
      autosave(values as Partial<DocFM>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleLock() {
    const offline = offlineLockError();
    if (offline) { setLockErrors([offline]); return; }
    const rawValues = getValues();
    const errs: string[] = [];
    if (!rawValues.usoRecomendado?.length) errs.push('Seleccionar al menos un uso recomendado');
    if (!rawValues.frecuenciaLimpieza) errs.push('Frecuencia de limpieza requerida');
    const seqErr = sequencingError('FM', 'completo', project.docStatus, upstream);
    if (seqErr) errs.push(seqErr);
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!await openConfirm('¿Marcar como completo? El documento quedará bloqueado.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      const values = {
        ...getValues(),
        productosAptos: cleanLines(getValues('productosAptos')),
        productosNoAptos: cleanLines(getValues('productosNoAptos')),
      };
      const snapshot = buildLockedSnapshot(project, upstream, { ...values, docType: 'FM' } as AnyDoc);
      await setDocStatus(projectCode, 'FM', 'completo', {
        ...values, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (fm?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'FM', 'completo', snapshot, (fm?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo bloquear el documento.']);
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-[14px] focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-60 pointer-events-none bg-[#F0EDE7] border-[rgba(43,45,47,0.12)] text-[#6B6155]' : 'bg-white border-[rgba(43,45,47,0.18)] text-[#2B2D2F]'}`;
  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';
  const materialInstalado = ro.materialInstalado as typeof project.materialInstalado | undefined;

  async function handleReopen() {
    if (!await openConfirm('¿Reabrir este documento? Volverá a "en progreso" y quedará editable.', { danger: true })) return;
    setReopening(true);
    try {
      await reopenDoc(projectCode, 'FM', user?.uid ?? '');
      await writeRevision(projectCode, 'FM', 'en_progreso', (fm ?? {}) as Record<string, unknown>, (fm?.version ?? 0) + 1, user?.uid ?? '');
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
      {!isArchived && isLockedByStatus && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span>Documento bloqueado · Solo lectura</span>
          {role === 'admin' && (
            <Button variant="danger" size="sm" onClick={handleReopen} disabled={reopening}>
              {reopening ? 'Reabriendo…' : 'Reabrir'}
            </Button>
          )}
        </div>
      )}

      {!isLockedByStatus && role !== 'admin' && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Solo lectura · La ficha de mantenimiento es completada por el administrador
        </div>
      )}

      <SectionNav sections={[
        { id: 'fm-uso', label: 'Uso recomendado', done: (fm?.usoRecomendado?.length ?? 0) > 0 },
        { id: 'fm-limpieza', label: 'Limpieza', done: !!fm?.frecuenciaLimpieza },
        { id: 'fm-precauciones', label: 'Precauciones', done: (fm?.precauciones?.length ?? 0) > 0 },
        { id: 'fm-recomendaciones', label: 'Recomendaciones', done: !!fm?.recomendaciones?.trim() },
      ]} />

      {/* Heredados */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Material instalado · Solo lectura</p>
          {materialInstalado?.tipo && (
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] bg-[#C38A5A]/15 text-[#C38A5A] rounded px-2 py-0.5">
              Defaults auto-detectados
            </span>
          )}
        </div>
        <div className="text-sm space-y-1">
          <p><span className="text-[#6B6155]">Tipo:</span> {materialInstalado?.tipo ?? '—'}</p>
          <p><span className="text-[#6B6155]">Descripción:</span> {materialInstalado?.descripcion ?? '—'}</p>
          <p><span className="text-[#6B6155]">Espacio:</span> {String(ro.tipoEspacio ?? '—').replace('_', ' ')}</p>
        </div>
      </div>

      {/* Uso recomendado */}
      <Section id="fm-uso" title="Uso recomendado">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
          {USO_RECOMENDADO.map((u) => (
            <label key={u} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={u} {...register('usoRecomendado')} disabled={isLocked} />
              {u.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </Section>

      {/* Frecuencia de limpieza */}
      <Section id="fm-limpieza" title="Limpieza y mantenimiento">
        <div>
          <label htmlFor="frecuenciaLimpieza" className={labelCls}>Frecuencia de limpieza</label>
          <select id="frecuenciaLimpieza" {...register('frecuenciaLimpieza')} className={inputCls} disabled={isLocked}>
            <option value="">— Seleccionar —</option>
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="segun_uso">Según uso</option>
          </select>
        </div>
        <div>
          <label htmlFor="productosAptos" className={labelCls}>Productos aptos (uno por línea)</label>
          <textarea
            id="productosAptos"
            rows={3}
            className={inputCls}
            disabled={isLocked}
            value={(watch('productosAptos') ?? []).join('\n')}
            onChange={(e) => setValue('productosAptos', splitLines(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="productosNoAptos" className={labelCls}>Productos NO aptos (uno por línea)</label>
          <textarea
            id="productosNoAptos"
            rows={3}
            className={inputCls}
            disabled={isLocked}
            value={(watch('productosNoAptos') ?? []).join('\n')}
            onChange={(e) => setValue('productosNoAptos', splitLines(e.target.value))}
          />
        </div>
      </Section>

      {/* Precauciones */}
      <Section id="fm-precauciones" title="Precauciones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
          {PRECAUCIONES_FM.map((p) => (
            <label key={p} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={p} {...register('precauciones')} disabled={isLocked} />
              {p.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </Section>

      {/* Recomendaciones (pre-pobladas por tipo, editables) */}
      <Section id="fm-recomendaciones" title="Cuidados y recomendaciones">
        <textarea
          id="fmRecomendaciones"
          rows={5}
          {...register('recomendaciones')}
          className={inputCls}
          disabled={isLocked}
          placeholder="Recomendaciones específicas para este tipo de material…"
        />
      </Section>

      <div>
        <label htmlFor="fmObservaciones" className={labelCls}>Observaciones del técnico</label>
        <textarea id="fmObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
      </div>

      {!isLocked && (
        <DocActionBar>
          {lockErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de bloquear</p>
              {lockErrors.map((e, i) => <p key={i} className="text-[12px] text-red-500">· {e}</p>)}
            </div>
          )}
          <button type="button" onClick={handleLock} disabled={locking}
            className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 transition-colors" style={{ background: '#C38A5A' }}>
            {locking ? 'Bloqueando…' : 'Marcar como completo'}
          </button>
        </DocActionBar>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
