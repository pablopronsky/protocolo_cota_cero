'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDoc, offlineLockError } from '@/hooks/useDoc';
import { setDocStatus, saveDoc, writeRevision, reopenDoc } from '@/lib/repo/projects';
import { buildLockedSnapshot, deriveInherited } from '@/lib/inheritance';
import { enqueueSignature, cancelQueuedSignature, getPhotoUrl } from '@/lib/photos';
import { sequencingError } from '@/lib/sequencing';
import SignaturePad from '@/components/SignaturePad';
import { Section } from '@/components/docs/Section';
import { SectionNav } from '@/components/docs/SectionNav';
import { DocActionBar } from '@/components/docs/DocActionBar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import type { Project, DocAC, AnyDoc, DocType } from '@/schemas';

interface Props {
  projectCode: string;
  project: Project;
  upstream: Partial<Record<DocType, AnyDoc>>;
  docData: AnyDoc | null;
}

export default function ACForm({ projectCode, project, upstream, docData }: Props) {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const { docData: liveDoc, autosave, cancelAutosave } = useDoc(projectCode, 'AC');
  const seedDoc = docData as DocAC | null;
  const ac = (liveDoc as DocAC | null) ?? seedDoc;
  const isSigned = ac?.status === 'firmado';
  const isArchived = project.status === 'archivado';
  // Técnicos ven el form en solo lectura: las reglas Firestore no permiten escritura AC a no-admin.
  const isLocked = isSigned || role !== 'admin' || isArchived;
  const [locking, setLocking] = useState(false);
  const [reopening, setReopening] = useState(false);
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
  const { confirmOpen, confirmMessage, confirmDanger, openConfirm, onConfirm, onCancel } = useConfirm();
  // Blobs locales para preview de firmas; no se persisten en RHF ni Firestore.
  const [firmaClienteBlob, setFirmaClienteBlob] = useState<string | null>(null);
  const [firmaCotaCeroBlob, setFirmaCotaCeroBlob] = useState<string | null>(null);
  // URLs de Storage para firmas ya subidas: sin esto, tras recargar la página
  // la preview quedaba como caja vacía (el blob local solo vive en la sesión).
  const [firmaClienteUrl, setFirmaClienteUrl] = useState<string | null>(null);
  const [firmaCotaCeroUrl, setFirmaCotaCeroUrl] = useState<string | null>(null);

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

  const firmaClienteStored = liveAC?.firmaCliente?.firma ?? (seedDoc?.firmaCliente?.firma ?? null);
  const firmaCotaCeroStored = liveAC?.firmaCotaCero?.firma ?? (seedDoc?.firmaCotaCero?.firma ?? null);

  useEffect(() => {
    if (firmaClienteStored && !firmaClienteStored.pending && !firmaClienteBlob) {
      getPhotoUrl(firmaClienteStored.storagePath).then(setFirmaClienteUrl).catch(() => {});
    } else if (!firmaClienteStored) {
      setFirmaClienteUrl(null);
    }
  }, [firmaClienteStored?.id, firmaClienteStored?.pending, firmaClienteBlob]); // eslint-disable-line

  useEffect(() => {
    if (firmaCotaCeroStored && !firmaCotaCeroStored.pending && !firmaCotaCeroBlob) {
      getPhotoUrl(firmaCotaCeroStored.storagePath).then(setFirmaCotaCeroUrl).catch(() => {});
    } else if (!firmaCotaCeroStored) {
      setFirmaCotaCeroUrl(null);
    }
  }, [firmaCotaCeroStored?.id, firmaCotaCeroStored?.pending, firmaCotaCeroBlob]); // eslint-disable-line

  // Firma remota: si la firma del cliente llega por el link mientras el acta
  // está abierta, el contenido firmado (conformidad, datos, observaciones) lo
  // escribió el server. Sincroniza el form y fija el snapshot congelado para
  // que handleSign firme exactamente lo que el cliente vio.
  useEffect(() => {
    if (!clienteYaFirmo || isSigned) return;
    if (frozenValuesRef.current) return; // flujo presencial: ya congelado en esta sesión
    if (liveAC) {
      reset(liveAC);
      frozenValuesRef.current = liveAC;
      setFrozen(true);
    }
  }, [clienteYaFirmo, isSigned, liveAC?.updatedAt]); // eslint-disable-line

  // Autosave: excluir firmaCliente/firmaCotaCero — lib/photos.ts es el único escritor.
  // Gatear en `name` — reset() (seed, #6) emite sin name; las ediciones del
  // usuario (inputs nativos y setValue) siempre lo traen.
  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (!name) return;
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

  // ── Firma remota ────────────────────────────────────────
  // El server mantiene remoteSign en el doc AC: acá solo se dispara la API y
  // la suscripción en vivo refleja el estado (link activo / vencido / firmado).
  const remoteSign = liveAC?.remoteSign ?? seedDoc?.remoteSign ?? null;
  const remoteActive = !!remoteSign && remoteSign.expiresAt > Date.now();
  const remoteExpired = !!remoteSign && remoteSign.expiresAt <= Date.now();
  const [remoteBusy, setRemoteBusy] = useState(false);
  const signUrl = remoteSign && typeof window !== 'undefined'
    ? `${window.location.origin}/firmar/${remoteSign.token}`
    : null;
  const whatsappHref = signUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Hola ${project.clienteNombre}! Te enviamos el acta de conformidad de tu obra para que la firmes desde el celular (te lleva 2 minutos): ${signUrl} — COTA CERO`,
      )}`
    : undefined;

  async function remoteRequest(method: 'POST' | 'DELETE', okMsg: string, failMsg: string) {
    if (!user || remoteBusy) return;
    setRemoteBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/sign/request', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? failMsg);
      }
      showToast(okMsg, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : failMsg, 'error');
    } finally {
      setRemoteBusy(false);
    }
  }

  function handleCreateRemote() {
    void remoteRequest('POST', 'Link de firma generado', 'No se pudo generar el link');
  }

  async function handleCancelRemote() {
    if (!await openConfirm('¿Cancelar el link de firma? El cliente ya no va a poder usarlo.', { danger: true })) return;
    void remoteRequest('DELETE', 'Link cancelado', 'No se pudo cancelar el link');
  }

  async function handleCopyLink() {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      showToast('Link copiado', 'success');
    } catch {
      showToast('No se pudo copiar el link', 'error');
    }
  }

  // #22 — Descarta la firma del cliente y reabre la edición del acta. Cancela la
  // firma encolada para que un flush posterior no la resucite.
  async function handleDiscardFirma() {
    if (!await openConfirm('¿Descartar la firma del cliente y volver a editar el acta?', { danger: true })) return;
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
    const offline = offlineLockError();
    if (offline) { setLockErrors([offline]); return; }
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

  // #19 — Admin puede reabrir un acta ya firmada (deja auditoría en revisions).
  async function handleReopen() {
    if (!await openConfirm('¿Reabrir el acta firmada? Volverá a "en progreso" y quedará editable.', { danger: true })) return;
    setReopening(true);
    try {
      await reopenDoc(projectCode, 'AC', user?.uid ?? '');
      await writeRevision(projectCode, 'AC', 'en_progreso', (ac ?? {}) as Record<string, unknown>, (ac?.version ?? 0) + 1, user?.uid ?? '');
      showToast('Acta reabierta', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo reabrir el acta.', 'error');
    } finally {
      setReopening(false);
    }
  }

  const inputCls = `w-full border rounded-md px-3 py-2.5 text-[14px] focus:border-[#C38A5A] focus:outline-none transition-colors ${contentLocked ? 'opacity-60 pointer-events-none bg-[#F0EDE7] border-[rgba(43,45,47,0.12)] text-[#6B6155]' : 'bg-white border-[rgba(43,45,47,0.18)] text-[#2B2D2F]'}`;
  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';

  const clienteData = ro.cliente as { nombre?: string } | undefined;
  const domicilio = ro.domicilioObra as typeof project.domicilioObra | undefined;

  return (
    <>
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      {isSigned && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-[15px] font-bold uppercase tracking-[0.14em] flex items-center justify-between gap-3 flex-wrap">
          <span>Acta firmada · Documento definitivo</span>
          {role === 'admin' && (
            <Button variant="danger" size="sm" onClick={handleReopen} disabled={reopening}>
              {reopening ? 'Reabriendo…' : 'Reabrir'}
            </Button>
          )}
        </div>
      )}

      {!isSigned && role !== 'admin' && (
        <div className="bg-[#2B2D2F] text-[#F5F2ED] rounded-lg px-4 py-3 text-sm">
          Solo lectura · El acta de conformidad es completada por el administrador
        </div>
      )}

      {role === 'admin' && (
        <SectionNav sections={[
          { id: 'ac-fecha', label: 'Fecha y conformidad', done: !!ac?.fechaActa && !!ac?.conformidad },
          { id: 'ac-firma-cliente', label: 'Firma cliente', done: !!ac?.firmaCliente?.firma },
          { id: 'ac-firma-cc', label: 'Firma COTA CERO', done: !!ac?.firmaCotaCero?.firma },
        ]} />
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
      <Section id="ac-fecha" title="Fecha y conformidad">
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
      </Section>

      {/* Firma cliente */}
      <Section id="ac-firma-cliente" title="Firma del cliente">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="border border-[#C38A5A]/30 bg-[#C38A5A]/[0.06] rounded-lg px-4 py-3 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C38A5A]">Firma remota</p>
            {remoteActive ? (
              <>
                <p className="text-[13px]">
                  Link activo · vence el {new Date(remoteSign!.expiresAt).toLocaleDateString('es-AR')}.
                  Cuando el cliente firme, el acta se actualiza sola.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-[11px] font-bold uppercase tracking-[0.16em] border border-[rgba(43,45,47,0.15)] rounded px-3 py-2 text-[#2B2D2F]/70 hover:border-[#C38A5A]/40 hover:text-[#C38A5A] transition-colors"
                  >
                    Copiar link
                  </button>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold uppercase tracking-[0.16em] rounded px-3 py-2 text-white transition-colors"
                    style={{ background: '#C38A5A' }}
                  >
                    Enviar por WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={handleCancelRemote}
                    disabled={remoteBusy}
                    className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-500 hover:text-red-600 px-1 py-2 transition-colors disabled:opacity-50"
                  >
                    Cancelar link
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] text-[#6B6155]">
                  {remoteExpired
                    ? 'El link anterior venció. Generá uno nuevo y reenviáselo al cliente.'
                    : 'El cliente firma desde su celular, sin visita: generá un link y envíaselo por WhatsApp.'}
                </p>
                <button
                  type="button"
                  onClick={handleCreateRemote}
                  disabled={remoteBusy}
                  className="text-[11px] font-bold uppercase tracking-[0.16em] rounded px-3 py-2 text-white transition-colors disabled:opacity-50"
                  style={{ background: '#C38A5A' }}
                >
                  {remoteBusy ? 'Generando…' : 'Generar link de firma'}
                </button>
              </>
            )}
          </div>
        )}

        {!contentLocked && (
          <SignaturePad onSave={handleFirmaCliente} saved={!!watch('firmaCliente.firma')} />
        )}
        {(watch('firmaCliente.firma') || firmaClienteBlob) && (
          <div className="w-48 h-24 rounded border border-[#B8AEA3]/40 overflow-hidden bg-[#B8AEA3]/10">
            {(firmaClienteBlob || firmaClienteUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firmaClienteBlob ?? firmaClienteUrl ?? undefined} alt="Firma cliente" className="w-full h-full object-contain" />
            ) : (
              <span className="flex items-center justify-center h-full text-[11px] text-[#6B6155]">Firma pendiente de subida</span>
            )}
          </div>
        )}
      </Section>

      {/* Firma COTA CERO */}
      {role === 'admin' && (
        <Section id="ac-firma-cc" title="Firma COTA CERO">
          {!isSigned && (
            <SignaturePad onSave={handleFirmaCotaCero} saved={!!watch('firmaCotaCero.firma')} />
          )}
          {(watch('firmaCotaCero.firma') || firmaCotaCeroBlob) && (
            <div className="w-48 h-24 rounded border border-[#B8AEA3]/40 overflow-hidden bg-[#B8AEA3]/10">
              {(firmaCotaCeroBlob || firmaCotaCeroUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firmaCotaCeroBlob ?? firmaCotaCeroUrl ?? undefined} alt="Firma COTA CERO" className="w-full h-full object-contain" />
              ) : (
                <span className="flex items-center justify-center h-full text-[11px] text-[#6B6155]">Firma pendiente de subida</span>
              )}
            </div>
          )}
        </Section>
      )}

      {!isSigned && role === 'admin' && (
        <DocActionBar>
          {lockErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-red-500">Completar antes de firmar</p>
              {lockErrors.map((e, i) => <p key={i} className="text-[12px] text-red-500">· {e}</p>)}
            </div>
          )}
          {signError && (
            <p className="text-[12px] text-red-500">{signError}</p>
          )}
          <button type="button" onClick={handleSign} disabled={locking}
            className="w-full text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md py-3.5 disabled:opacity-50 transition-colors" style={{ background: '#C38A5A' }}>
            {locking ? 'Firmando…' : 'Firmar acta de conformidad'}
          </button>
        </DocActionBar>
      )}
    </form>
      <ConfirmDialog open={confirmOpen} message={confirmMessage} danger={confirmDanger} onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}
