'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import SaveIndicator from '@/components/SaveIndicator';
import { useDoc } from '@/hooks/useDoc';
import { setDocStatus, saveDoc, writeRevision } from '@/lib/repo/projects';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { enqueueSignature, cancelQueuedSignature } from '@/lib/photos';
import { sequencingError } from '@/lib/sequencing';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  const [signError, setSignError] = useState<string | null>(null);
  // #22 — Una vez que el cliente firma, el contenido del acta queda congelado:
  // no admite edición hasta la firma final (o hasta descartar la firma). Si la
  // página se recarga con una firma de cliente ya persistida, se reconstruye.
  const [frozen, setFrozen] = useState(false);
  const frozenValuesRef = useRef<DocAC | null>(null);
  const liveAC = liveDoc as DocAC | null;
  const clienteYaFirmo = !!liveAC?.firmaCliente?.firma;
  const actaCongelada = !isSigned && (frozen || clienteYaFirmo);
  const contentLocked = isLocked || actaCongelada;
  const { confirmOpen, confirmMessage, openConfirm, onConfirm, onCancel } = useConfirm();
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
      if (contentLocked) return;
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
  }, [watch, contentLocked, autosave, project.status]);

  // #22 — Persiste exactamente el contenido que el cliente firmó, para que lo
  // guardado en Firestore coincida con lo firmado aunque falte el bloqueo final.
  async function persistFrozenContent(v: DocAC) {
    await saveDoc(projectCode, 'AC', {
      fechaActa: v.fechaActa ?? '',
      conformidad: v.conformidad ?? '',
      observacionesCliente: v.observacionesCliente ?? '',
      firmaCliente: {
        nombreAclaratorio: v.firmaCliente?.nombreAclaratorio ?? '',
        dni: v.firmaCliente?.dni ?? '',
      },
    } as Partial<DocAC>);
  }

  async function handleFirmaCliente(file: File) {
    if (!user) return;
    setSignError(null);
    try {
      // enqueueSignature escribe el cleanRef en Firestore; no llega a autosave.
      const { cleanRef, localBlob } = await enqueueSignature(projectCode, 'firmaCliente.firma', file, user.uid);
      setValue('firmaCliente.firma', cleanRef); // solo para validación en handleSign
      setFirmaClienteBlob(localBlob);
      // #22 — Congelar el contenido en el momento de la firma del cliente.
      cancelAutosave();
      const snapshotValues = getValues();
      frozenValuesRef.current = snapshotValues;
      await persistFrozenContent(snapshotValues);
      setFrozen(true);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'No se pudo capturar la firma del cliente.');
    }
  }

  async function handleFirmaCotaCero(file: File) {
    if (!user) return;
    setSignError(null);
    try {
      const { cleanRef, localBlob } = await enqueueSignature(projectCode, 'firmaCotaCero.firma', file, user.uid);
      setValue('firmaCotaCero', { uid: user.uid, firma: cleanRef });
      setFirmaCotaCeroBlob(localBlob);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'No se pudo capturar la firma de COTA CERO.');
    }
  }

  // #22 — Descarta la firma del cliente y reabre la edición del acta. Cancela la
  // firma encolada para que un flush posterior no la resucite.
  async function handleDiscardFirma() {
    if (!await openConfirm('¿Descartar la firma del cliente y volver a editar el acta?')) return;
    try {
      await cancelQueuedSignature(projectCode, 'AC', 'firmaCliente.firma');
      await saveDoc(projectCode, 'AC', {
        firmaCliente: {
          nombreAclaratorio: liveAC?.firmaCliente?.nombreAclaratorio ?? '',
          dni: liveAC?.firmaCliente?.dni ?? '',
          firma: null,
        },
      } as Partial<DocAC>);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'No se pudo descartar la firma.');
      return;
    }
    setValue('firmaCliente.firma', null);
    if (firmaClienteBlob) URL.revokeObjectURL(firmaClienteBlob);
    setFirmaClienteBlob(null);
    frozenValuesRef.current = null;
    setFrozen(false);
    setSignError(null);
  }

  async function handleSign() {
    // #22 — Firmar sobre el contenido congelado en la firma del cliente (no un
    // getValues() fresco que pudiera haber drifteado). Si no hay congelado en
    // esta sesión, el contenido del form ya está bloqueado y coincide con el doc.
    const base = frozenValuesRef.current ?? getValues();
    const errs: string[] = [];
    if (!base.fechaActa) errs.push('Fecha del acta requerida');
    if (!base.conformidad) errs.push('Conformidad del cliente requerida');
    if (!base.firmaCliente?.nombreAclaratorio?.trim()) errs.push('Nombre aclaratorio del cliente requerido');
    if (!base.firmaCliente?.dni?.trim()) errs.push('DNI del cliente requerido');
    // Validar contra Firestore (fuente de verdad) además del estado RHF
    const firmaClienteRef = liveAC?.firmaCliente?.firma ?? base.firmaCliente?.firma;
    if (!firmaClienteRef) errs.push('Fotografiar firma del cliente');
    // #21 — el acta no se firma fuera de secuencia ni sobre una RF no apta.
    const seqErr = sequencingError('AC', 'firmado', project.docStatus, upstream);
    if (seqErr) errs.push(seqErr);
    if (errs.length) { setLockErrors(errs); return; }
    setLockErrors([]);
    if (!await openConfirm('¿Firmar el acta de conformidad? Esta acción es definitiva.')) return;
    cancelAutosave();
    setLocking(true);
    try {
      // Usar firmas de Firestore (ya sin localBlob) para el snapshot y lock.
      const fullValues: DocAC = {
        ...base,
        firmaCliente: {
          nombreAclaratorio: base.firmaCliente?.nombreAclaratorio ?? '',
          dni: base.firmaCliente?.dni ?? '',
          firma: liveAC?.firmaCliente?.firma ?? base.firmaCliente?.firma ?? null,
        },
        firmaCotaCero: liveAC?.firmaCotaCero ?? base.firmaCotaCero,
      };
      const snapshot = buildLockedSnapshot(project, upstream, { ...fullValues, docType: 'AC' } as AnyDoc);
      await setDocStatus(projectCode, 'AC', 'firmado', {
        ...fullValues, lockedSnapshot: snapshot, lockedAt: Date.now(), lockedBy: user?.uid ?? '',
        version: (ac?.version ?? 0) + 1,
      } as Partial<AnyDoc>, project.status, { docStatus: project.docStatus, upstream });
      await writeRevision(projectCode, 'AC', 'firmado', snapshot, (ac?.version ?? 0) + 1, user?.uid ?? '');
    } catch (e) {
      setLockErrors([e instanceof Error ? e.message : 'No se pudo firmar el acta.']);
    } finally { setLocking(false); }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors ${contentLocked ? 'opacity-50 pointer-events-none bg-[#111] border-[#333] text-[#B8AEA3]' : 'bg-[#111] border-[#2A2A2A] text-[#F5F2ED]'}`;
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] mb-1.5';

  const clienteData = ro.cliente as { nombre?: string } | undefined;
  const domicilio = ro.domicilioObra as typeof project.domicilioObra | undefined;

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#6B6155] capitalize">{ac?.status ?? 'vacio'}</span>
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

      {/* #22 — Acta congelada por la firma del cliente, a la espera de la firma final */}
      {role === 'admin' && actaCongelada && (
        <div className="bg-[#C38A5A]/12 border border-[#C38A5A]/35 rounded-lg px-4 py-3 text-sm space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#C38A5A]">Contenido congelado</p>
          <p className="text-[#2B2D2F]">El cliente firmó: el contenido del acta quedó fijo. Falta la firma de COTA CERO y confirmar la firma del acta.</p>
          <button type="button" onClick={handleDiscardFirma}
            className="text-[12px] font-bold uppercase tracking-[0.18em] text-red-500 hover:text-red-600 transition-colors">
            Descartar firma del cliente y editar
          </button>
        </div>
      )}

      {/* Datos heredados */}
      <div className="bg-[#F5F2ED] border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3 space-y-2">
        <p className="eyebrow">Datos heredados · Solo lectura</p>
        <div className="text-sm space-y-1">
          <p><span className="text-[#6B6155]">Cliente:</span> {clienteData?.nombre ?? '—'}</p>
          <p><span className="text-[#6B6155]">Domicilio:</span> {domicilio ? `${domicilio.calle} ${domicilio.numero}, ${domicilio.localidad}` : '—'}</p>
          <p><span className="text-[#6B6155]">Obra ejecutada:</span> {String(ro.obraEjecutada || '—')}</p>
        </div>
      </div>

      {/* Fecha y conformidad */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <div>
          <label htmlFor="fechaActa" className={labelCls}>Fecha del acta</label>
          <input id="fechaActa" type="date" {...register('fechaActa')} className={inputCls} disabled={contentLocked} />
        </div>
        <div>
          <label className={labelCls}>Conformidad del cliente *</label>
          {(['conforme', 'conforme_con_observaciones', 'no_conforme'] as const).map((v) => (
            <label key={v} className="flex items-center gap-3 text-sm mt-2 capitalize">
              <input type="radio" value={v} {...register('conformidad')} disabled={contentLocked} />
              {v.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="observacionesCliente" className={labelCls}>Observaciones del cliente</label>
          <textarea id="observacionesCliente" rows={3} {...register('observacionesCliente')} className={inputCls} disabled={contentLocked} />
        </div>
      </div>

      {/* Firma cliente */}
      <div className="doc-section bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-3 space-y-3">
        <p className="section-head">Firma del cliente</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firmaClienteNombre" className={labelCls}>Nombre aclaratorio</label>
            <input id="firmaClienteNombre" {...register('firmaCliente.nombreAclaratorio')} className={inputCls} disabled={contentLocked} />
          </div>
          <div>
            <label htmlFor="firmaClienteDni" className={labelCls}>DNI</label>
            <input id="firmaClienteDni" {...register('firmaCliente.dni')} className={inputCls} disabled={contentLocked} />
          </div>
        </div>
        {!contentLocked && (
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
          {!isSigned && (
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

      {signError && (
        <div className="border border-red-300/50 bg-red-50 rounded-lg px-4 py-3 text-[13px] text-red-500">{signError}</div>
      )}

      {!isSigned && role === 'admin' && (
        <button type="button" onClick={handleSign} disabled={locking}
          className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 no-print transition-colors" style={{ background: '#C38A5A' }}>
          {locking ? 'Firmando…' : 'Firmar acta de conformidad'}
        </button>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
