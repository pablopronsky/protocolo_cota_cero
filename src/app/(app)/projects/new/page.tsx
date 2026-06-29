'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const users = useUsers();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    clienteNombre: '',
    clienteContacto: '',
    clienteTelefono: '',
    clienteEmail: '',
    clienteDniCuit: '',
    calle: '',
    numero: '',
    localidad: '',
    referencia: '',
    tipoEspacio: 'vivienda',
    modalidad: 'obra_integral',
    materialTipo: 'laminado',
    materialDescripcion: '',
    materialM2: '',
    presupuestoRef: '',
    responsableTecnico: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!user) { setError('Sesión no válida. Volvé a ingresar.'); return; }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // createdBy/responsableComercial los deriva el server desde el token.
        body: JSON.stringify(form),
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

  const input = (
    value: string,
    onChange: (v: string) => void,
    extra?: React.InputHTMLAttributes<HTMLInputElement>
  ) => (
    <input
      {...extra}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-2.5 bg-white text-sm text-[#2B2D2F] placeholder:text-[#B8AEA3] focus:border-[#C38A5A] focus:outline-none transition-colors"
    />
  );

  const sel = (
    value: string,
    onChange: (v: string) => void,
    children: React.ReactNode
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[rgba(43,45,47,0.18)] rounded-md px-3 py-2.5 bg-white text-sm text-[#2B2D2F] focus:border-[#C38A5A] focus:outline-none transition-colors"
    >
      {children}
    </select>
  );

  const labelCls = 'block text-[15px] font-bold uppercase tracking-[0.16em] text-[#B8AEA3] mb-1.5';

  return (
    <div className="space-y-5 pb-10">
      <div>
        <a
          href="/projects"
          className="text-[15px] font-bold uppercase tracking-[0.2em] text-[#B8AEA3] hover:text-[#C38A5A] transition-colors"
        >
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
          <div className="px-4 py-4 space-y-3">
            <div>
              <label className={labelCls}>Nombre *</label>
              {input(form.clienteNombre, (v) => set('clienteNombre', v), { required: true })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Contacto *</label>
                {input(form.clienteContacto, (v) => set('clienteContacto', v), { required: true })}
              </div>
              <div>
                <label className={labelCls}>Teléfono *</label>
                {input(form.clienteTelefono, (v) => set('clienteTelefono', v), { required: true, type: 'tel' })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Email</label>
                {input(form.clienteEmail, (v) => set('clienteEmail', v), { type: 'email' })}
              </div>
              <div>
                <label className={labelCls}>DNI / CUIT</label>
                {input(form.clienteDniCuit, (v) => set('clienteDniCuit', v))}
              </div>
            </div>
          </div>
        </div>

        {/* Domicilio de obra */}
        <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(43,45,47,0.07)]">
            <div className="section-head">Domicilio de obra</div>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Calle *</label>
                {input(form.calle, (v) => set('calle', v), { required: true })}
              </div>
              <div>
                <label className={labelCls}>Número *</label>
                {input(form.numero, (v) => set('numero', v), { required: true })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Localidad *</label>
                {input(form.localidad, (v) => set('localidad', v), { required: true, placeholder: 'City Bell, Gonnet…' })}
              </div>
              <div>
                <label className={labelCls}>Referencia</label>
                {input(form.referencia, (v) => set('referencia', v), { placeholder: 'Piso, depto, lote…' })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <p className="text-xs text-[#B8AEA3] mt-1.5">Se puede cambiar después desde el overview del proyecto.</p>
          </div>
        </div>

        {error && (
          <p className="text-[16px] font-mono text-red-500">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-[rgba(43,45,47,0.18)] rounded-md py-3 text-[15px] font-bold uppercase tracking-[0.14em] text-[#2B2D2F] hover:border-[#C38A5A]/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#2B2D2F] text-[#F5F2ED] rounded-md py-3 text-[15px] font-bold uppercase tracking-[0.14em] hover:bg-[#1F1F1F] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  );
}
