'use client';

import { use, useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import SignaturePad from '@/components/SignaturePad';
import { formatMaterialForClient } from '@/lib/material';

// Página PÚBLICA de firma remota del acta de conformidad. El cliente llega por
// un link con token (sin cuenta ni login): confirma su conformidad, deja sus
// datos y firma con el dedo. Todo pasa por /api/sign/[token] (Admin SDK).

interface ObraInfo {
  projectCode: string;
  clienteNombre: string;
  domicilio: string;
  obraEjecutada: string;
  materialTipo: string;
  materialDescripcion: string;
}

type Conformidad = 'conforme' | 'conforme_con_observaciones' | 'no_conforme';

const CONFORMIDAD_OPTS: Array<{ value: Conformidad; label: string; detail: string }> = [
  { value: 'conforme', label: 'Conforme', detail: 'La obra fue realizada según lo acordado.' },
  { value: 'conforme_con_observaciones', label: 'Conforme con observaciones', detail: 'La obra está conforme y quiero dejar un comentario.' },
  { value: 'no_conforme', label: 'No conforme', detail: 'Necesito informar algo que requiere revisión.' },
];

function SectionTitle({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2B2D2F] font-mono text-[10px] font-bold tracking-wider text-[#F5F2ED]">
        {number}
      </span>
      <div>
        <h2 className="text-[17px] font-bold leading-tight text-[#2B2D2F]">{title}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6B6155]">{detail}</p>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [obra, setObra] = useState<ObraInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [conformidad, setConformidad] = useState<Conformidad | ''>('');
  const [observaciones, setObservaciones] = useState('');
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [firmaFile, setFirmaFile] = useState<File | null>(null);

  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLoadError(data.error ?? 'Link inválido');
        } else {
          setObra(data as ObraInfo);
        }
      })
      .catch(() => setLoadError('No se pudo cargar. Revisá tu conexión y volvé a intentar.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    setFormError(null);
    const errs: string[] = [];
    if (!conformidad) errs.push('Elegí si estás conforme con la obra.');
    if (conformidad === 'no_conforme' && !observaciones.trim()) errs.push('Contanos qué observaste.');
    if (!nombre.trim()) errs.push('Completá tu nombre y apellido.');
    if (!dni.trim()) errs.push('Completá tu DNI.');
    if (!firmaFile) errs.push('Dibujá tu firma y tocá "Guardar firma".');
    if (errs.length) { setFormError(errs.join(' ')); return; }

    setSending(true);
    try {
      const firmaDataUrl = await fileToDataUrl(firmaFile!);
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreAclaratorio: nombre.trim(),
          dni: dni.trim(),
          conformidad,
          observacionesCliente: observaciones.trim(),
          firmaDataUrl,
        }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? 'No se pudo enviar la firma. Volvé a intentar.');
      }
    } catch {
      setFormError('No se pudo enviar. Revisá tu conexión y volvé a intentar.');
    } finally {
      setSending(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-[rgba(43,45,47,0.16)] bg-white px-3.5 py-3 text-[16px] text-[#2B2D2F] shadow-[0_1px_2px_rgba(43,45,47,0.03)] transition-all placeholder:text-[#B8AEA3] focus:border-[#C38A5A] focus:outline-none focus:ring-2 focus:ring-[#C38A5A]/10';
  const labelCls = 'block text-[12px] font-bold text-[#514A43] mb-1.5';

  return (
    <div className="min-h-dvh bg-[#EDE8E0] text-[#2B2D2F]">
      <header className="relative overflow-hidden bg-[#202123] text-[#F5F2ED]">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(245,242,237,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(245,242,237,0.035) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        <div className="relative mx-auto max-w-xl px-5 pb-20 pt-7 sm:pb-24 sm:pt-9">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#F5F2ED]"><Logo size="md" /></span>
            <span className="rounded-full border border-white/15 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B8AEA3]">
              Documento privado
            </span>
          </div>
          <div className="mt-12 max-w-md sm:mt-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#C38A5A]">Cierre de obra</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[42px]">
              Acta de conformidad
            </h1>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[#D5CEC5]">
              Revisá el trabajo realizado, indicá tu conformidad y firmá desde este dispositivo.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
            {['Revisar', 'Confirmar', 'Firmar'].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold text-[#C38A5A]">0{index + 1}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#D5CEC5]">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="relative mx-auto -mt-11 max-w-xl px-4 pb-12 sm:-mt-14 sm:px-5">

        {loading && (
          <div className="rounded-xl border border-black/5 bg-white px-5 py-16 text-center shadow-[0_14px_36px_rgba(43,45,47,0.10)]">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#C38A5A]/25 border-t-[#C38A5A]" />
            <p className="mt-3 text-sm text-[#6B6155]">Preparando el acta…</p>
          </div>
        )}

        {/* Link inválido / vencido / ya firmado */}
        {!loading && loadError && (
          <div className="space-y-3 rounded-xl border border-black/5 bg-white px-6 py-10 text-center shadow-[0_14px_36px_rgba(43,45,47,0.10)]">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#F5F2ED] text-lg text-[#8F5B33]">!</span>
            <p className="text-[16px] font-bold">{loadError}</p>
            <p className="text-[13px] text-[#6B6155]">
              Si necesitás firmar el acta, contactate con COTA CERO.
            </p>
          </div>
        )}

        {/* Confirmación */}
        {!loading && done && (
          <div className="space-y-4 rounded-xl border border-black/5 bg-white px-6 py-12 text-center shadow-[0_14px_36px_rgba(43,45,47,0.10)]">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#315E50] text-2xl text-white">✓</span>
            <p className="text-[20px] font-bold">¡Listo! Tu conformidad quedó registrada.</p>
            <p className="text-[13px] text-[#6B6155]">
              Gracias por confiar en COTA CERO. Ya podés cerrar esta página.
            </p>
          </div>
        )}

        {/* Formulario */}
        {!loading && !loadError && !done && obra && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_14px_36px_rgba(43,45,47,0.10)]">
              <div className="border-b border-[#E8E1D8] px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8F5B33]">Obra verificada</p>
                  <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#8B8177]">{obra.projectCode}</p>
                </div>
                <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.02em]">{obra.clienteNombre}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B6155]">{obra.domicilio}</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#F2E9DF] px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C38A5A]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7B4A28]">{obra.materialTipo}</span>
                  <span className="text-[11px] text-[#6B6155]">{formatMaterialForClient(obra.materialDescripcion)}</span>
                </div>
              </div>
              {obra.obraEjecutada && (
                <div className="bg-[#FBF9F6] px-5 py-4 sm:px-6 sm:py-5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8B8177]">Trabajo realizado</p>
                  <p className="text-[13px] leading-[1.65] text-[#514A43]">{obra.obraEjecutada}</p>
                </div>
              )}
            </section>

            {/* Conformidad */}
            <section className="space-y-5 rounded-xl border border-black/5 bg-[#F8F5F0] px-4 py-5 sm:px-6 sm:py-6">
              <SectionTitle number="01" title="Confirmá el resultado" detail="Elegí la opción que mejor represente tu experiencia con la obra." />
              <div className="space-y-2.5">
                {CONFORMIDAD_OPTS.map((opt) => {
                  const selected = conformidad === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#C38A5A]/20 ${
                        selected
                          ? 'border-[#C38A5A] bg-white shadow-[0_5px_16px_rgba(195,138,90,0.12)]'
                          : 'border-[rgba(43,45,47,0.10)] bg-white/80 hover:border-[#C38A5A]/45'
                      }`}
                    >
                      <input
                        type="radio"
                        name="conformidad"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setConformidad(opt.value)}
                        className="sr-only"
                      />
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${selected ? 'border-[#C38A5A] bg-[#C38A5A] text-white' : 'border-[#B8AEA3] bg-white text-transparent'}`}>✓</span>
                      <span>
                        <span className="block text-[14px] font-bold text-[#2B2D2F]">{opt.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-[#6B6155]">{opt.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {conformidad && conformidad !== 'conforme' && (
                <div>
                  <label htmlFor="observaciones" className={labelCls}>
                    Observaciones {conformidad === 'no_conforme' ? '*' : '(opcional)'}
                  </label>
                  <textarea
                    id="observaciones"
                    rows={4}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    className={inputCls}
                    placeholder="Contanos el detalle para que podamos revisarlo…"
                  />
                </div>
              )}
            </section>

            {/* Datos */}
            <section className="space-y-5 rounded-xl border border-black/5 bg-[#F8F5F0] px-4 py-5 sm:px-6 sm:py-6">
              <SectionTitle number="02" title="Completá tus datos" detail="Se incorporan al acta para identificar la conformidad." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="nombre" className={labelCls}>Nombre y apellido *</label>
                  <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} autoComplete="name" placeholder="Nombre completo" />
                </div>
                <div>
                  <label htmlFor="dni" className={labelCls}>DNI *</label>
                  <input id="dni" value={dni} onChange={(e) => setDni(e.target.value)} className={inputCls} inputMode="numeric" placeholder="Sin puntos" />
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-[#315E50]/10 bg-[#315E50]/[0.055] px-3 py-2.5">
                <span className="mt-px text-[12px] text-[#315E50]">●</span>
                <p className="text-[11px] leading-relaxed text-[#4E685F]">Tus datos se usan únicamente para registrar esta acta de conformidad.</p>
              </div>
            </section>

            {/* Firma */}
            <section className="space-y-5 rounded-xl border border-black/5 bg-[#F8F5F0] px-4 py-5 sm:px-6 sm:py-6">
              <SectionTitle number="03" title="Firmá el acta" detail="Dibujá tu firma dentro del recuadro y guardala antes de enviar." />
              <div className="rounded-xl border border-[rgba(43,45,47,0.10)] bg-white p-3 shadow-[0_2px_8px_rgba(43,45,47,0.04)]">
                <SignaturePad onSave={setFirmaFile} saved={!!firmaFile} />
              </div>
            </section>

            {formError && (
              <div className="rounded-lg border border-red-300/50 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                {formError}
              </div>
            )}

            <div className="rounded-xl bg-[#202123] p-3 shadow-[0_12px_28px_rgba(32,33,35,0.18)]">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending}
                className="w-full rounded-lg bg-[#C38A5A] py-4 text-[12px] font-bold uppercase tracking-[0.24em] text-white transition-colors hover:bg-[#B77B4E] disabled:opacity-50"
              >
                {sending ? 'Enviando…' : 'Confirmar y firmar acta'}
              </button>
              <p className="px-2 pb-1 pt-3 text-center text-[10px] leading-relaxed text-[#B8AEA3]">
                Al enviar, la conformidad queda registrada con la fecha de hoy.
              </p>
            </div>

            <footer className="pb-2 pt-5 text-center">
              <span className="text-[#6B6155]"><Logo size="xs" /></span>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#8B8177]">Superficies y terminaciones</p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
