'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { useAuth } from '@/hooks/useAuth';
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
  const { user } = useAuth();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'FM');
  const seedDoc = docData as DocFM | null;
  const fm = (liveDoc as DocFM | null) ?? seedDoc;
  const isLocked = fm?.status === 'completo' || fm?.status === 'firmado';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
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

  // Autosave: gatear en type==='change' para evitar autosave fantasma al hacer reset() (#6).
  useEffect(() => {
    const sub = watch((values, { type }) => {
      if (type !== 'change') return;
      if (isLocked) return;
      autosave(values as Partial<DocFM>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleLock() {
    const rawValues = getValues();
    const errs: string[] = [];
    if (!rawValues.usoRecomendado?.length) errs.push('Seleccionar al menos un uso recomendado');
    if (!rawValues.frecuenciaLimpieza) errs.push('Frecuencia de limpieza requerida');
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!window.confirm('¿Marcar como completo? El documento quedará bloqueado.')) return;
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
      } as Partial<AnyDoc>, project.status);
      await writeRevision(projectCode, 'FM', 'completo', snapshot, (fm?.version ?? 0) + 1, user?.uid ?? '');
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#B8AEA3] mb-1.5';
  const materialInstalado = ro.materialInstalado as typeof project.materialInstalado | undefined;

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#B8AEA3] capitalize">{fm?.status ?? 'vacio'}</span>
        <SaveIndicator state={saveState} />
      </div>

      {isLocked && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Documento bloqueado · Solo lectura
        </div>
      )}

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
          <p><span className="text-[#B8AEA3]">Tipo:</span> {materialInstalado?.tipo ?? '—'}</p>
          <p><span className="text-[#B8AEA3]">Descripción:</span> {materialInstalado?.descripcion ?? '—'}</p>
          <p><span className="text-[#B8AEA3]">Espacio:</span> {String(ro.tipoEspacio ?? '—').replace('_', ' ')}</p>
        </div>
      </div>

      {/* Uso recomendado */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Uso recomendado</p>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {USO_RECOMENDADO.map((u) => (
            <label key={u} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={u} {...register('usoRecomendado')} disabled={isLocked} />
              {u.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </div>

      {/* Frecuencia de limpieza */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Limpieza y mantenimiento</p>
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
      </div>

      {/* Precauciones */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Precauciones</p>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {PRECAUCIONES_FM.map((p) => (
            <label key={p} className="flex items-center gap-3 text-sm capitalize">
              <input type="checkbox" value={p} {...register('precauciones')} disabled={isLocked} />
              {p.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      </div>

      {/* Recomendaciones (pre-pobladas por tipo, editables) */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Cuidados y recomendaciones</p>
        <textarea
          id="fmRecomendaciones"
          rows={5}
          {...register('recomendaciones')}
          className={inputCls}
          disabled={isLocked}
          placeholder="Recomendaciones específicas para este tipo de material…"
        />
      </div>

      <div>
        <label htmlFor="fmObservaciones" className={labelCls}>Observaciones del técnico</label>
        <textarea id="fmObservaciones" rows={3} {...register('observaciones')} className={inputCls} disabled={isLocked} />
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
  );
}
