'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { listAllProjects } from '@/lib/repo/projects';
import { useAuth } from '@/hooks/useAuth';
import type { Project, DocStatus } from '@/schemas';
import { DOC_ORDER } from '@/schemas';

/* ── Icons ──────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IconChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ── Helpers ─────────────────────────────────────────────── */
const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  borrador:  { label: 'Borrador',     bg: 'bg-[#B8AEA3]/20', text: 'text-[#6B6155]' },
  en_curso:  { label: 'En Curso',     bg: 'bg-[#7BA88A]/20', text: 'text-[#5A8A6A]' },
  entregado: { label: 'Entregado',    bg: 'bg-[#2B2D2F]/10', text: 'text-[#2B2D2F]' },
  archivado: { label: 'Archivado',    bg: 'bg-[#B8AEA3]/10', text: 'text-[#6B6155]' },
};

function calcProgress(docStatus: Record<string, DocStatus>): number {
  const weights: Record<DocStatus, number> = {
    vacio: 0, en_progreso: 0.5, completo: 1, firmado: 1,
  };
  const total = DOC_ORDER.reduce((sum, dt) => sum + (weights[docStatus?.[dt] ?? 'vacio'] ?? 0), 0);
  return Math.round((total / DOC_ORDER.length) * 100);
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).replace('.', '');
}

const PAGE_SIZE = 10;

export default function ProjectsPage() {
  const router = useRouter();
  const { role } = useAuth();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('activos');
  const [page, setPage] = useState(0);

  useEffect(() => {
    listAllProjects().then((ps) => {
      setAllProjects(ps);
      setLoading(false);
    });
  }, []);

  const filtered = allProjects.filter((p) => {
    const matchSearch =
      !search ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.clienteNombre.toLowerCase().includes(search.toLowerCase()) ||
      p.domicilioObra.localidad.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'activos' && p.status !== 'archivado') ||
      p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  return (
    <div className="space-y-7 min-w-0">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[13px] font-bold text-[#2B2D2F]/25 tracking-widest">01</span>
            <div className="flex items-center gap-1">
              <div className="w-10 h-px bg-[#2B2D2F]/15" />
              <div className="w-1.5 h-1.5 bg-[#C38A5A]" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#C38A5A]">
              Protocolo
            </span>
          </div>
          <h1
            className="font-bold text-[#2B2D2F] leading-none tracking-tight"
            style={{ fontSize: 42, letterSpacing: '-0.01em' }}
          >
            PROYECTOS
          </h1>
          {!loading && (
            <p className="mt-2 text-[13px] text-[#6B6155]">
              {filtered.length} proyecto{filtered.length !== 1 ? 's' : ''} activo{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {role === 'admin' && (
          <Link
            href="/projects/new"
            className="shrink-0 border border-[#2B2D2F]/25 text-[#2B2D2F] text-[11px] font-bold uppercase tracking-[0.22em] px-5 py-2.5 rounded hover:border-[#C38A5A] hover:text-[#C38A5A] transition-colors mt-1"
          >
            + Nuevo Proyecto
          </Link>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-[480px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6155] pointer-events-none">
            <IconSearch />
          </span>
          <input
            type="search"
            placeholder="Buscar por cliente, código o localidad"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[rgba(43,45,47,0.12)] rounded-md pl-9 pr-4 py-2.5 text-[13px] bg-white placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none border border-[rgba(43,45,47,0.12)] rounded-md pl-4 pr-9 py-2.5 text-[13px] bg-white text-[#2B2D2F] focus:border-[#C38A5A] focus:outline-none transition-colors cursor-pointer"
          >
            <option value="activos">Activos</option>
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="en_curso">En curso</option>
            <option value="entregado">Entregado</option>
            <option value="archivado">Archivado</option>
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6155] pointer-events-none">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 -mt-px text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155] pointer-events-none">
          </span>
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────── */}
      {loading && (
        <div className="py-24 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.28em] text-[#6B6155]">
            Cargando…
          </span>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────── */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-[#B8AEA3]/20 rounded-lg">
              <p className="text-[13px] text-[#6B6155]">Sin proyectos que coincidan.</p>
            </div>
          ) : (
            <div className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(43,45,47,0.07)]">
                    {['Código','Cliente','Estado','Fecha Inicio','Fecha Fin','Progreso','Acciones'].map((col) => (
                      <th
                        key={col}
                        className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p, i) => {
                    const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.borrador;
                    const progress = calcProgress(p.docStatus);
                    return (
                      <tr
                        key={p.code}
                        onClick={() => router.push(`/projects/${p.code}`)}
                        className={`border-b border-[rgba(43,45,47,0.06)] hover:bg-[#F5F2ED]/60 transition-colors cursor-pointer ${
                          i === paginated.length - 1 ? 'border-b-0' : ''
                        }`}
                      >
                        {/* Código */}
                        <td className="px-5 py-4">
                          <span className="font-bold text-[14px] text-[#2B2D2F] tracking-tight">
                            {p.code}
                          </span>
                        </td>
                        {/* Cliente */}
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-[#2B2D2F]">{p.clienteNombre}</span>
                        </td>
                        {/* Estado */}
                        <td className="px-5 py-4">
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-sm ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        {/* Fecha Inicio */}
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-[#2B2D2F]/70">
                            {fmtDate(p.createdAt)}
                          </span>
                        </td>
                        {/* Fecha Fin */}
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-[#6B6155]">—</span>
                        </td>
                        {/* Progreso */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 bg-[#B8AEA3]/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#6B8FA3] rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-[12px] text-[#6B6155] font-mono w-8">
                              {progress}%
                            </span>
                          </div>
                        </td>
                        {/* Acciones */}
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-3">
                            {role === 'admin' && (
                              <Link
                                href={`/projects/${p.code}`}
                                className="text-[#6B6155] hover:text-[#C38A5A] transition-colors"
                                title="Editar"
                              >
                                <IconEdit />
                              </Link>
                            )}
                            <Link
                              href={`/projects/${p.code}`}
                              className="text-[#6B6155] hover:text-[#C38A5A] transition-colors"
                              title="Ver"
                            >
                              <IconEye />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Table footer ──────────────────────────────── */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B6155]">
                {filtered.length} Proyecto{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155]">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="w-7 h-7 flex items-center justify-center rounded border border-[rgba(43,45,47,0.15)] text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <IconChevronLeft />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-[rgba(43,45,47,0.15)] text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <IconChevronRight />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
