'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { getClient, updateClient } from '@/lib/repo/clients';
import { listAllProjects } from '@/lib/repo/projects';
import { PROJECT_STATUS_BADGE, calcProgress, fmtDate } from '@/lib/projectDisplay';
import { useAuth } from '@/hooks/useAuth';
import type { Client, Project } from '@/schemas';

const inputCls =
  'w-full border border-[rgba(43,45,47,0.12)] rounded-md px-4 py-2.5 text-[13px] bg-white placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors';

function newProjectHref(c: Client): string {
  const params = new URLSearchParams();
  params.set('clienteId', c.id);
  params.set('clienteNombre', c.nombre);
  return `/projects/new?${params.toString()}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 bg-white border border-[rgba(43,45,47,0.08)] rounded-lg px-4 py-3">
      <p className="text-[22px] font-bold text-[#2B2D2F] font-mono leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B6155] mt-1.5">{label}</p>
    </div>
  );
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { role } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editContacto, setEditContacto] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDniCuit, setEditDniCuit] = useState('');
  const [editError, setEditError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const clientId = decodeURIComponent(id);
    Promise.all([
      getClient(clientId),
      listAllProjects(),
    ]).then(([c, ps]) => {
      setClient(c);
      setProjects(
        ps
          .filter((p) => p.clienteId === clientId)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
      setLoading(false);
    });
  }, [id]);

  function startEdit() {
    if (!client) return;
    setEditNombre(client.nombre);
    setEditContacto(client.contacto);
    setEditTelefono(client.telefono);
    setEditEmail(client.email ?? '');
    setEditDniCuit(client.dni_cuit ?? '');
    setEditError('');
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editNombre.trim()) { setEditError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setEditError('');
    try {
      await updateClient(decodeURIComponent(id), {
        nombre: editNombre.trim(),
        contacto: editContacto.trim(),
        telefono: editTelefono.trim(),
        email: editEmail.trim() || undefined,
        dni_cuit: editDniCuit.trim() || undefined,
      });
      setClient((prev) => prev ? {
        ...prev,
        nombre: editNombre.trim(),
        contacto: editContacto.trim(),
        telefono: editTelefono.trim(),
        email: editEmail.trim() || undefined,
        dni_cuit: editDniCuit.trim() || undefined,
      } : prev);
      setSavedOk(true);
      setEditing(false);
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      setEditError('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center">
        <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#6B6155]">Cargando…</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors">
          <span className="text-base leading-none">←</span> Clientes
        </Link>
        <p className="text-sm text-red-500">Cliente no encontrado.</p>
      </div>
    );
  }

  const enCurso  = projects.filter((p) => p.status === 'borrador' || p.status === 'en_curso').length;
  const entregados = projects.filter((p) => p.status === 'entregado').length;
  const archivados = projects.filter((p) => p.status === 'archivado').length;

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6B6155] hover:text-[#C38A5A] transition-colors">
        <span className="text-base leading-none">←</span> Clientes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Cliente</p>
          <h1 className="text-[26px] font-bold text-[#2B2D2F] leading-tight tracking-tight">
            {client.nombre}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6B6155]">
            {client.contacto && <span>{client.contacto}</span>}
            {client.telefono && <span>· {client.telefono}</span>}
            {client.email && <span>· {client.email}</span>}
            {client.dni_cuit && <span className="font-mono">· {client.dni_cuit}</span>}
          </div>
          {savedOk && (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#C38A5A]">Guardado</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-1">
          {role === 'admin' && !editing && (
            <button
              onClick={startEdit}
              className="border border-[#2B2D2F]/15 text-[#2B2D2F]/50 text-[11px] font-bold uppercase tracking-[0.22em] px-4 py-2.5 rounded hover:border-[#C38A5A]/40 hover:text-[#C38A5A] transition-colors cursor-pointer"
            >
              Editar
            </button>
          )}
          {role === 'admin' && (
            <Link
              href={newProjectHref(client)}
              className="border border-[#2B2D2F]/25 text-[#2B2D2F] text-[11px] font-bold uppercase tracking-[0.22em] px-5 py-2.5 rounded hover:border-[#C38A5A] hover:text-[#C38A5A] transition-colors"
            >
              + Nuevo Proyecto
            </Link>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] mb-1">Editar datos del cliente</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#6B6155]">Nombre <span className="text-[#C38A5A]">*</span></label>
              <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className={inputCls} placeholder="Nombre o razón social" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#6B6155]">Contacto</label>
              <input type="text" value={editContacto} onChange={(e) => setEditContacto(e.target.value)} className={inputCls} placeholder="Nombre del contacto" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#6B6155]">Teléfono</label>
              <input type="text" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} className={inputCls} placeholder="11-1234-5678" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#6B6155]">Email</label>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inputCls} placeholder="email@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#6B6155]">DNI / CUIT</label>
              <input type="text" value={editDniCuit} onChange={(e) => setEditDniCuit(e.target.value)} className={inputCls} placeholder="20-12345678-9" />
            </div>
          </div>
          {editError && <p className="text-[12px] text-red-500">{editError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded bg-[#2B2D2F] text-white text-[11px] font-bold uppercase tracking-[0.18em] hover:bg-[#C38A5A] disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-default"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-5 py-2 rounded border border-[rgba(43,45,47,0.15)] text-[#6B6155] text-[11px] font-bold uppercase tracking-[0.18em] hover:border-[#B8AEA3]/40 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Stats */}
      <div className="flex gap-3">
        <Stat value={projects.length} label="Total" />
        <Stat value={enCurso} label="En curso" />
        <Stat value={entregados} label="Entregados" />
        <Stat value={archivados} label="Archivados" />
      </div>

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[#B8AEA3]/20 rounded-lg">
          <p className="text-[13px] text-[#6B6155]">Sin proyectos todavía.</p>
        </div>
      ) : (
        <div>
          <p className="eyebrow mb-3">Proyectos</p>
          <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[rgba(43,45,47,0.07)]">
                  {['Código','Estado','Domicilio de obra','Progreso','Inicio'].map((col) => (
                    <th key={col} className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const badge = PROJECT_STATUS_BADGE[p.status] ?? PROJECT_STATUS_BADGE.borrador;
                  const progress = calcProgress(p.docStatus);
                  const dir = `${p.domicilioObra.calle} ${p.domicilioObra.numero} — ${p.domicilioObra.localidad}`;
                  return (
                    <tr key={p.code} className={`border-b border-[rgba(43,45,47,0.06)] ${i === projects.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-5 py-4">
                        <Link href={`/projects/${p.code}`} className="font-bold text-[14px] text-[#2B2D2F] tracking-tight hover:text-[#C38A5A] transition-colors">
                          {p.code}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-sm ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-[#2B2D2F]/70">{dir}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-[#B8AEA3]/20 rounded-full overflow-hidden">
                            <div className="h-full bg-[#C38A5A] rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[12px] text-[#6B6155] font-mono w-8">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-[#6B6155]">{fmtDate(p.createdAt)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
