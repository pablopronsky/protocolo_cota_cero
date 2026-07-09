'use client';

import { use, useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import SignaturePad from '@/components/SignaturePad';

// Página PÚBLICA de firma remota del acta de conformidad. El cliente llega por
// un link con token (sin cuenta ni login): confirma su conformidad, deja sus
// datos y firma con el dedo. Todo pasa por /api/sign/[token] (Admin SDK).

interface ObraInfo {
  clienteNombre: string;
  domicilio: string;
  obraEjecutada: string;
}

type Conformidad = 'conforme' | 'conforme_con_observaciones' | 'no_conforme';

const CONFORMIDAD_OPTS: Array<{ value: Conformidad; label: string; detail: string }> = [
  { value: 'conforme', label: 'Conforme', detail: 'La obra está bien terminada.' },
  { value: 'conforme_con_observaciones', label: 'Conforme con observaciones', detail: 'Estoy conforme, pero quiero dejar una observación.' },
  { value: 'no_conforme', label: 'No conforme', detail: 'Hay algo que no está bien.' },
];

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

  const inputCls = 'w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-3 text-[16px] bg-white text-[#2B2D2F] focus:border-[#C38A5A] focus:outline-none transition-colors';
  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';

  return (
    <div className="min-h-dvh bg-[#F5F2ED] text-[#2B2D2F]">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <span className="text-[#2B2D2F]"><Logo size="md" /></span>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#C38A5A]">
            Conformidad de obra
          </p>
        </div>

        {loading && (
          <p className="text-center text-sm text-[#6B6155] py-16">Cargando…</p>
        )}

        {/* Link inválido / vencido / ya firmado */}
        {!loading && loadError && (
          <div className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-5 py-8 text-center space-y-2">
            <p className="text-[15px] font-semibold">{loadError}</p>
            <p className="text-[13px] text-[#6B6155]">
              Si necesitás firmar el acta, contactate con COTA CERO.
            </p>
          </div>
        )}

        {/* Confirmación */}
        {!loading && done && (
          <div className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-5 py-10 text-center space-y-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full text-white text-xl" style={{ background: '#C38A5A' }}>✓</span>
            <p className="text-[17px] font-bold">¡Listo! Tu conformidad quedó registrada.</p>
            <p className="text-[13px] text-[#6B6155]">
              Gracias por confiar en COTA CERO. Ya podés cerrar esta página.
            </p>
          </div>
        )}

        {/* Formulario */}
        {!loading && !loadError && !done && obra && (
          <div className="space-y-5">
            <div className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-2">
              <p className="text-[15px]">
                Hola <strong>{obra.clienteNombre}</strong> 👋
              </p>
              <p className="text-[13px] text-[#6B6155] leading-relaxed">
                COTA CERO te pide confirmar tu conformidad por la obra realizada en{' '}
                <strong className="text-[#2B2D2F]">{obra.domicilio}</strong>.
              </p>
              {obra.obraEjecutada && (
                <div className="pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] mb-1">Obra ejecutada</p>
                  <p className="text-[13px] leading-relaxed">{obra.obraEjecutada}</p>
                </div>
              )}
            </div>

            {/* Conformidad */}
            <div className="space-y-2">
              <p className={labelCls}>¿Estás conforme con la obra? *</p>
              {CONFORMIDAD_OPTS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 border rounded-lg px-4 py-3.5 cursor-pointer transition-colors bg-white ${
                    conformidad === opt.value
                      ? 'border-[#C38A5A] shadow-[0_1px_8px_rgba(195,138,90,0.12)]'
                      : 'border-[rgba(43,45,47,0.12)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="conformidad"
                    value={opt.value}
                    checked={conformidad === opt.value}
                    onChange={() => setConformidad(opt.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold">{opt.label}</span>
                    <span className="block text-[12px] text-[#6B6155]">{opt.detail}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Observaciones */}
            {conformidad && conformidad !== 'conforme' && (
              <div>
                <label htmlFor="observaciones" className={labelCls}>
                  Contanos qué observaste {conformidad === 'no_conforme' ? '*' : '(opcional)'}
                </label>
                <textarea
                  id="observaciones"
                  rows={3}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: falta retocar el zócalo del living…"
                />
              </div>
            )}

            {/* Datos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="nombre" className={labelCls}>Nombre y apellido *</label>
                <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="dni" className={labelCls}>DNI *</label>
                <input id="dni" value={dni} onChange={(e) => setDni(e.target.value)} className={inputCls} inputMode="numeric" />
              </div>
            </div>

            {/* Firma */}
            <div>
              <p className={labelCls}>Tu firma *</p>
              <SignaturePad onSave={setFirmaFile} saved={!!firmaFile} />
            </div>

            {formError && (
              <div className="border border-red-300/50 bg-red-50 rounded-md px-4 py-3 text-[13px] text-red-600">
                {formError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="w-full text-white font-bold text-[12px] uppercase tracking-[0.24em] rounded-md py-4 disabled:opacity-50 transition-colors"
              style={{ background: '#C38A5A' }}
            >
              {sending ? 'Enviando…' : 'Firmar y enviar'}
            </button>

            <p className="text-[11px] text-[#6B6155] text-center leading-relaxed pb-4">
              Al enviar, tu firma y tus datos quedan registrados en el acta de
              conformidad de la obra junto con la fecha de hoy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
