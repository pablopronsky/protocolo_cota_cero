'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, writeRevision } from '@/lib/repo/projects';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { enqueueSignature } from '@/lib/photos';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/hooks/useAuth';
import type { Project, DocAC, AnyDoc, DocType } from '@/schemas';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

export default function ACForm({ projectCode, project, upstream, docData }: Props) {
  const { user, role } = useAuth();
  const { docData: liveDoc, saveState, autosave, cancelAutosave } = useDoc(projectCode, 'AC');
  const seedDoc = docData as DocAC | null;
  const ac = (liveDoc as DocAC | null) ?? seedDoc;
  const isSigned = ac?.status === 'firmado';
  // Técnicos ven el form en solo lectura: las reglas Firestore no permiten escritura AC a no-admin.
  const isLocked = isSigned || role !== 'admin';
  const [locking, setLocking] = useState(false);
  const [lockErrors, setLockErrors] = useState<string[]>([]);
  // Blobs locales para preview de firmas; no se persisten en RHF ni Firestore.
  const [firmaClienteBlob, setFirmaClienteBlob] = useState<string | null>(null);
  const [firmaCotaCeroBlob, setFirmaCotaCeroBlob] = useState<string | null>(null);

  const seed = deriveInherited(project, upstream, 'AC');
  const ro = seed.readonly as Record<string, unknown>;

  const { register, watch, getValues, setValue, reset } = useForm<DocAC>({
    defaultValues: ac ?? {
      fechaActa: '', conformidad: '', observacionesCliente: '',
      firmaCliente: { nombreAclaratorio: '', dni: '', firma: null },
      firmaCotaCero: { uid: '', firma: null },
    },
  });

  // Seed de campos: una sola vez, desde el snapshot estable de la página.
  useEffect(() => { if (seedDoc) reset(seedDoc); }, [seedDoc?.updatedAt]); // eslint-disable-line

  // Autosave: excluir firmaCliente/firmaCotaCero — lib/photos.ts es el único escritor.
  // Gatear en type==='change' para evitar autosave fantasma al hacer reset() (#6).
  useEffect(() => {
    const sub = watch((values, { type }) => {
      if (type !== 'change') return;
      if (isLocked) return;
      const { firmaCliente, firmaCotaCero: _fc, ...rest } = values;
      autosave({
        ...rest,
        ...(firmaCliente && {
          firmaCliente: {
            nombreAclaratorio: firmaCliente.nombreAclaratorio ?? '',
            dni: firmaCliente.dni ?? '',
          },
        }),
      } as Partial<DocAC>, project.status);
    });
    return () => sub.unsubscribe();
  }, [watch, isLocked, autosave, project.status]);

  async function handleFirmaCliente(file: File) {
    if (!user) return;
    // enqueueSignature escribe el cleanRef en Firestore; no llega a autosave.
    const { cleanRef, localBlob } = await enqueueSignature(projectCode, 'firmaCliente.firma', file, user.uid);
    setValue('firmaCliente.firma', cleanRef); // solo para validación en handleSign
    setFirmaClienteBlob(localBlob);
  }

  async function handleFirmaCotaCero(file: File) {
    if (!user) return;
    const { cleanRef, localBlob } = await enqueueSignature(projectCode, 'firmaCotaCero.firma', file, user.uid);
    setValue('firmaCotaCero', { uid: user.uid, firma: cleanRef });
    setFirmaCotaCeroBlob(localBlob);
  }

  async function handleSign() {
    const values = getValues();
    const liveAC = liveDoc as import('@/schemas').DocAC | null;
    const errs: string[] = [];
    if (!values.fechaActa) errs.push('Fecha del acta requerida');
    if (!values.conformidad) errs.push('Conformidad del cliente requerida');
    if (!values.firmaCliente?.nombreAclaratorio?.trim()) errs.push('Nombre aclaratorio del cliente requerido');
    if (!values.firmaCliente?.dni?.trim()) errs.push('DNI del cliente requerido');
    // Validar contra Firestore (fuente de verdad) además del estado RHF
    const firmaClienteRef = liveAC?.firmaCliente?.firma ?? values.firmaCliente?.firma;
    if (!firmaClienteRef) errs.push('Fotografiar firma del cliente');
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!window.confirm('¿Firmar el acta de conformidad? Esta acción es definitiva.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      // Usar firmas de Firestore (ya sin localBlob) para el snapshot y lock.
      const fullValues: typeof values = {
        ...values,
        firmaCliente: {
          nombreAclaratorio: values.firmaCliente?.nombreAclaratorio ?? '',
          dni: values.firmaCliente?.dni ?? '',
          firma: liveAC?.firmaCliente?.firma ?? values.firmaCliente?.firma ?? null,
        },
        firmaCotaCero: liveAC?.firmaCotaCero ?? values.firmaCotaCero,
      };
      const snapshot = buildLockedSnapshot(project, upstream, { ...fullValues, docType: 'AC' } as AnyDoc);
      await setDocStatus(projectCode, 'AC', 'firmado', {
        ...fullValues, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (ac?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status);
      await writeRevision(projectCode, 'AC', 'firmado', snapshot, (ac?.version ?? 0) + 1, user?.uid ?? '');
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${isLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#B8AEA3] mb-1.5';

  const clienteData = ro.cliente as typeof project.cliente | undefined;
  const domicilio = ro.domicilioObra as typeof project.domicilioObra | undefined;

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#B8AEA3] capitalize">{ac?.status ?? 'vacio'}</span>
        <SaveIndicator state={saveState} />
      </div>

      {isSigned && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-[15px] font-bold uppercase tracking-[0.14em]">
          Acta firmada · Documento definitivo
        </div>
      )}

      {!isSigned && role !== 'admin' && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Solo lectura · El acta de conformidad es completada por el administrador
        </div>
      )}

      {/* Datos heredados */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Datos heredados · Solo lectura</p>
        <div className="text-sm space-y-1">
          <p><span className="text-[#B8AEA3]">Cliente:</span> {clienteData?.nombre ?? '—'}</p>
          <p><span className="text-[#B8AEA3]">Domicilio:</span> {domicilio ? `${domicilio.calle} ${domicilio.numero}, ${domicilio.localidad}` : '—'}</p>
          <p><span className="text-[#B8AEA3]">Obra ejecutada:</span> {String(ro.obraEjecutada || '—')}</p>
        </div>
      </div>

      {/* Fecha y conformidad */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <div>
          <label htmlFor="fechaActa" className={labelCls}>Fecha del acta</label>
          <input id="fechaActa" type="date" {...register('fechaActa')} className={inputCls} disabled={isLocked} />
        </div>
        <div>
          <label className={labelCls}>Conformidad del cliente *</label>
          {(['conforme', 'conforme_con_observaciones', 'no_conforme'] as const).map((v) => (
            <label key={v} className="flex items-center gap-3 text-sm mt-2 capitalize">
              <input type="radio" value={v} {...register('conformidad')} disabled={isLocked} />
              {v.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="observacionesCliente" className={labelCls}>Observaciones del cliente</label>
          <textarea id="observacionesCliente" rows={3} {...register('observacionesCliente')} className={inputCls} disabled={isLocked} />
        </div>
      </div>

      {/* Firma cliente */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Firma del cliente</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firmaClienteNombre" className={labelCls}>Nombre aclaratorio</label>
            <input id="firmaClienteNombre" {...register('firmaCliente.nombreAclaratorio')} className={inputCls} disabled={isLocked} />
          </div>
          <div>
            <label htmlFor="firmaClienteDni" className={labelCls}>DNI</label>
            <input id="firmaClienteDni" {...register('firmaCliente.dni')} className={inputCls} disabled={isLocked} />
          </div>
        </div>
        {!isLocked && (
          <SignaturePad onSave={handleFirmaCliente} saved={!!watch('firmaCliente.firma')} />
        )}
        {(watch('firmaCliente.firma') || firmaClienteBlob) && (
          <div className="w-48 h-24 rounded border border-[#B8AEA3]/40 overflow-hidden bg-[#B8AEA3]/10">
            {firmaClienteBlob && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firmaClienteBlob} alt="Firma cliente" className="w-full h-full object-contain" />
            )}
          </div>
        )}
      </div>

      {/* Firma COTA CERO */}
      {role === 'admin' && (
        <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
          <p className="section-head">Firma COTA CERO</p>
          {!isLocked && (
            <SignaturePad onSave={handleFirmaCotaCero} saved={!!watch('firmaCotaCero.firma')} />
          )}
          {(watch('firmaCotaCero.firma') || firmaCotaCeroBlob) && (
            <div className="w-48 h-24 rounded border border-[#B8AEA3]/40 overflow-hidden bg-[#B8AEA3]/10">
              {firmaCotaCeroBlob && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firmaCotaCeroBlob} alt="Firma COTA CERO" className="w-full h-full object-contain" />
              )}
            </div>
          )}
        </div>
      )}

      {lockErrors.length > 0 && (
        <div className="border border-red-300/50 bg-red-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de firmar</p>
          {lockErrors.map((e, i) => <p key={i} className="text-[13px] text-red-500">· {e}</p>)}
        </div>
      )}

      {!isLocked && role === 'admin' && (
        <button type="button" onClick={handleSign} disabled={locking}
          className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 no-print transition-colors" style={{ background: '#C38A5A' }}>
          {locking ? 'Firmando…' : 'Firmar acta de conformidad'}
        </button>
      )}
    </form>
  );
}
