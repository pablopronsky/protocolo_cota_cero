'use client';

import { useState, useEffect, Suspense, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { listClients } from '@/lib/repo/clients';
import type { Client } from '@/schemas';

/* ── Client picker ──────────────────────────────────────── */
export interface NewClientForm {
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  dni_cuit: string;
}

export const EMPTY_NEW_CLIENT: NewClientForm = { nombre: '', contacto: '', telefono: '', email: '', dni_cuit: '' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// #22 — Validación real del sub-form de cliente nuevo (reemplaza el hidden-input
// hack: antes se duplicaban los valores en inputs ocultos solo para que
// `FormData` los capturara; ahora el estado vive en el padre y se valida acá).
export function validateNewClient(f: NewClientForm): Partial<Record<keyof NewClientForm, string>> {
  const errs: Partial<Record<keyof NewClientForm, string>> = {};
  if (!f.nombre.trim()) errs.nombre = 'Nombre requerido';
  if (!f.contacto.trim()) errs.contacto = 'Contacto requerido';
  if (!f.telefono.trim()) errs.telefono = 'Teléfono requerido';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) errs.email = 'Email inválido';
  return errs;
}

interface ClientPickerProps {
  selected: Client | null;
  onSelect: (c: Client | null) => void;
  showNew: boolean;
  onShowNewChange: (v: boolean) => void;
  newForm: NewClientForm;
  onNewFormChange: (f: NewClientForm) => void;
  newFormErrors: Partial<Record<keyof NewClientForm, string>>;
}

function ClientPicker({
  selected, onSelect, showNew, onShowNewChange, newForm, onNewFormChange, newFormErrors,
}: ClientPickerProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => { listClients().then(setClients); }, []);

  const filtered = query.trim()
    ? clients.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.nombre.toLowerCase().includes(q) ||
          c.telefono.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.dni_cuit ?? '').toLowerCase().includes(q)
        );
      })
    : clients.slice(0, 6);

  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';
  const inputCls = 'w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-2.5 bg-white text-sm text-[#2B2D2F] placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors';

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-4 bg-[#F5F2ED] border border-[#C38A5A]/30 rounded-lg px-4 py-3">
        <div>
          <p className="font-bold text-[14px] text-[#2B2D2F]">{selected.nombre}</p>
          <p className="text-[12px] text-[#6B6155]">
            {[selected.telefono, selected.email, selected.dni_cuit].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] hover:text-[#C38A5A] transition-colors shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      {!showNew && (
        <>
          <input
            type="search"
            placeholder="Buscar cliente por nombre, teléfono o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputCls}
            autoFocus
          />
          {filtered.length > 0 && (
            <div className="border border-[rgba(43,45,47,0.12)] rounded-lg overflow-hidden">
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#F5F2ED] transition-colors ${
                    i < filtered.length - 1 ? 'border-b border-[rgba(43,45,47,0.07)]' : ''
                  }`}
                >
                  <p className="font-semibold text-[13px] text-[#2B2D2F]">{c.nombre}</p>
                  <p className="text-[11px] text-[#6B6155]">
                    {[c.telefono, c.email, c.dni_cuit].filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          )}
          {query.trim() && filtered.length === 0 && (
            <p className="text-[12px] text-[#6B6155] px-1">
              Sin resultados para <strong>{query}</strong>.
            </p>
          )}
          <button
            type="button"
            onClick={() => onShowNewChange(true)}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] hover:text-[#C38A5A] transition-colors"
          >
            + Nuevo cliente
          </button>
        </>
      )}

      {/* New client inline form — estado en el padre, validado antes de crear el proyecto */}
      {showNew && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input value={newForm.nombre} onChange={(e) => onNewFormChange({ ...newForm, nombre: e.target.value })} className={inputCls} />
            {newFormErrors.nombre && <p className="text-[12px] text-red-500 mt-1">{newFormErrors.nombre}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contacto *</label>
              <input value={newForm.contacto} onChange={(e) => onNewFormChange({ ...newForm, contacto: e.target.value })} className={inputCls} />
              {newFormErrors.contacto && <p className="text-[12px] text-red-500 mt-1">{newFormErrors.contacto}</p>}
            </div>
            <div>
              <label className={labelCls}>Teléfono *</label>
              <input type="tel" value={newForm.telefono} onChange={(e) => onNewFormChange({ ...newForm, telefono: e.target.value })} className={inputCls} />
              {newFormErrors.telefono && <p className="text-[12px] text-red-500 mt-1">{newFormErrors.telefono}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={newForm.email} onChange={(e) => onNewFormChange({ ...newForm, email: e.target.value })} className={inputCls} />
              {newFormErrors.email && <p className="text-[12px] text-red-500 mt-1">{newFormErrors.email}</p>}
            </div>
            <div>
              <label className={labelCls}>DNI / CUIT</label>
              <input value={newForm.dni_cuit} onChange={(e) => onNewFormChange({ ...newForm, dni_cuit: e.target.value })} className={inputCls} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onShowNewChange(false)}
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] hover:text-[#C38A5A] transition-colors"
          >
            ← Buscar existente
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main form ───────────────────────────────────────────── */
function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const users = useUsers();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientForm>(EMPTY_NEW_CLIENT);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const newClientErrors = attemptedSubmit ? validateNewClient(newClient) : {};

  // Prefill cuando se llega desde la ficha de un cliente
  const prefillId   = searchParams.get('clienteId');
  const prefillName = searchParams.get('clienteNombre');
  useEffect(() => {
    if (prefillId && prefillName) {
      setSelectedClient({ id: prefillId, nombre: prefillName, contacto: '', telefono: '', createdAt: 0, updatedAt: 0 });
    }
  }, [prefillId, prefillName]);

  const [form, setForm] = useState({
    calle: '', numero: '', localidad: '', referencia: '',
    tipoEspacio: 'vivienda', modalidad: 'obra_integral',
    materialTipo: 'laminado', materialDescripcion: '', materialM2: '',
    presupuestoRef: '', responsableTecnico: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!user) { setError('Sesión no válida. Volvé a ingresar.'); return; }

    // Construir el payload: cliente existente vs nuevo
    const body: Record<string, unknown> = { ...form };
    if (selectedClient) {
      // Cliente existente (o prefill desde la ficha del cliente, vía clienteId)
      body.clienteId = selectedClient.id;
    } else if (showNewClient) {
      setAttemptedSubmit(true);
      const errs = validateNewClient(newClient);
      if (Object.keys(errs).length > 0) {
        setError('Completá los datos del cliente antes de continuar.');
        return;
      }
      body.clienteNombre   = newClient.nombre.trim();
      body.clienteContacto = newClient.contacto.trim();
      body.clienteTelefono = newClient.telefono.trim();
      body.clienteEmail    = newClient.email.trim();
      body.clienteDniCuit  = newClient.dni_cuit.trim();
    } else {
      setError('Seleccioná un cliente existente o creá uno nuevo.');
      return;
    }

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al crear el proyecto');
      }
      const { code } = await res.json();
      router.push(`/projects/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  const input = (value: string, onChange: (v: string) => void, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...extra}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-2.5 bg-white text-sm text-[#2B2D2F] placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors"
    />
  );
  const sel = (value: string, onChange: (v: string) => void, children: React.ReactNode) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-2.5 bg-white text-sm text-[#2B2D2F] focus:border-[#C38A5A] focus:outline-none transition-colors"
    >
      {children}
    </select>
  );
  const labelCls = 'block text-[13px] font-semibold text-[#6B6155] mb-1.5';

  return (
    <div className="space-y-5 pb-10">
      <div>
        <a href="/projects" className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors">
          ← Proyectos
        </a>
        <h1 className="text-xl font-bold text-[#2B2D2F] mt-1.5">Nuevo proyecto</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Cliente */}
        <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(43,45,47,0.07)]">
            <div className="section-head">Cliente</div>
          </div>
          <div className="px-4 py-4">
            <ClientPicker
              selected={selectedClient}
              onSelect={setSelectedClient}
              showNew={showNewClient}
              onShowNewChange={setShowNewClient}
              newForm={newClient}
              onNewFormChange={setNewClient}
              newFormErrors={newClientErrors}
            />
          </div>
        </div>

        {/* Domicilio de obra */}
        <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(43,45,47,0.07)]">
            <div className="section-head">Domicilio de obra</div>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Calle *</label>
                {input(form.calle, (v) => set('calle', v), { required: true })}
              </div>
              <div>
                <label className={labelCls}>Número *</label>
                {input(form.numero, (v) => set('numero', v), { required: true })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Localidad *</label>
                {input(form.localidad, (v) => set('localidad', v), { required: true, placeholder: 'City Bell, Gonnet…' })}
              </div>
              <div>
                <label className={labelCls}>Referencia</label>
                {input(form.referencia, (v) => set('referencia', v), { placeholder: 'Piso, depto, lote…' })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo de espacio *</label>
                {sel(form.tipoEspacio, (v) => set('tipoEspacio', v), <>
                  <option value="vivienda">Vivienda</option>
                  <option value="local">Local comercial</option>
                  <option value="oficina">Oficina</option>
                  <option value="otro">Otro</option>
                </>)}
              </div>
              <div>
                <label className={labelCls}>Modalidad *</label>
                {sel(form.modalidad, (v) => set('modalidad', v), <>
                  <option value="obra_integral">Obra integral</option>
                  <option value="solo_mano_de_obra">Solo mano de obra</option>
                </>)}
              </div>
            </div>
          </div>
        </div>

        {/* Material */}
        <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(43,45,47,0.07)]">
            <div className="section-head">Material a instalar</div>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo *</label>
                {sel(form.materialTipo, (v) => set('materialTipo', v), <>
                  <option value="laminado">Laminado</option>
                  <option value="spc">SPC</option>
                  <option value="madera">Madera</option>
                  <option value="deck">Deck</option>
                  <option value="revestimiento">Revestimiento</option>
                  <option value="otro">Otro</option>
                </>)}
              </div>
              <div>
                <label className={labelCls}>M² estimados</label>
                {input(form.materialM2, (v) => set('materialM2', v), { type: 'number', inputMode: 'decimal' })}
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción (marca / modelo / línea) *</label>
              {input(form.materialDescripcion, (v) => set('materialDescripcion', v), { required: true })}
            </div>
            <div>
              <label className={labelCls}>Ref. presupuesto</label>
              {input(form.presupuestoRef, (v) => set('presupuestoRef', v), { placeholder: 'COTA-2026-XXXX' })}
            </div>
          </div>
        </div>

        {/* Asignación */}
        <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(43,45,47,0.07)]">
            <div className="section-head">Asignación</div>
          </div>
          <div className="px-4 py-4">
            <label className={labelCls}>Responsable técnico</label>
            {sel(form.responsableTecnico, (v) => set('responsableTecnico', v), <>
              <option value="">— Seleccionar —</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>{u.nombre}</option>
              ))}
            </>)}
            <p className="text-xs text-[#6B6155] mt-1.5">Se puede cambiar después desde el overview del proyecto.</p>
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-[rgba(43,45,47,0.18)] rounded-md py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2B2D2F] hover:border-[#C38A5A]/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#2B2D2F] text-[#F5F2ED] rounded-md py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] hover:bg-[#1F1F1F] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectForm />
    </Suspense>
  );
}
