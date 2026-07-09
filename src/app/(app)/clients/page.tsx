'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listClients } from '@/lib/repo/clients';
import { listAllProjects } from '@/lib/repo/projects';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Client, Project } from '@/schemas';

/* ── Icons ──────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
const IconClientesEmpty = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="11" r="5" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M5 27c0-6.075 4.925-9.5 11-9.5s11 3.425 11 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const PAGE_SIZE = 10;

interface ClientRow extends Client {
  projectCount: number;
  activeCount: number;
  lastActivity: number;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).replace('.', '');
}

function matchesSearch(c: ClientRow, q: string): boolean {
  if (!q) return true;
  const hay = [c.nombre, c.contacto, c.telefono, c.email ?? '', c.dni_cuit ?? '']
    .join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function ClientsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([listClients(), listAllProjects()]).then(([clients, projects]) => {
      // Indexar proyectos por clienteId para calcular métricas
      const byClient = new Map<string, Project[]>();
      for (const p of projects) {
        const arr = byClient.get(p.clienteId);
        if (arr) arr.push(p);
        else byClient.set(p.clienteId, [p]);
      }

      const enriched: ClientRow[] = clients.map((c) => {
        const ps = byClient.get(c.id) ?? [];
        const active = ps.filter((p) => p.status !== 'archivado').length;
        const last = ps.reduce((m, p) => Math.max(m, p.updatedAt), c.updatedAt);
        return { ...c, projectCount: ps.length, activeCount: active, lastActivity: last };
      });

      enriched.sort((a, b) => b.lastActivity - a.lastActivity);
      setRows(enriched);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter((c) => matchesSearch(c, search));
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="space-y-7 min-w-0">
      {/* ── Page header ──────────────────────────────────── */}
      <div>
        <p className="eyebrow mb-1">Gestión</p>
        <h1
          className="font-bold text-[#2B2D2F] leading-none tracking-tight"
          style={{ fontSize: 42, letterSpacing: '-0.01em' }}
        >
          CLIENTES
        </h1>
        {!loading && (
          <p className="mt-2 text-[13px] text-[#6B6155]">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ── Filter ───────────────────────────────────────── */}
      <div className="relative flex-1 sm:max-w-[480px]">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6155] pointer-events-none">
          <IconSearch />
        </span>
        <input
          type="search"
          placeholder="Buscar por nombre, teléfono, email o DNI"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-[rgba(43,45,47,0.12)] rounded-md pl-9 pr-4 py-2.5 text-[13px] bg-white placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors"
        />
      </div>

      {/* ── Loading ──────────────────────────────────────── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────── */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconClientesEmpty />}
              title={rows.length === 0 ? 'Todavía no hay clientes' : 'Sin clientes que coincidan'}
              description={
                rows.length === 0
                  ? 'Se crean automáticamente al dar de alta un proyecto.'
                  : 'Probá ajustar la búsqueda.'
              }
            />
          ) : (
            <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-2">
              {paginated.map((c) => (
                <div key={c.id} onClick={() => router.push(`/clients/${encodeURIComponent(c.id)}`)} className="cursor-pointer">
                  <Card>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-[14px] text-[#2B2D2F] tracking-tight">{c.nombre}</span>
                      {c.activeCount > 0 && (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-sm bg-[#C38A5A]/18 text-[#9C5F2E] shrink-0">
                          {c.activeCount} activo{c.activeCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {c.dni_cuit && <p className="text-[11px] font-mono text-[#6B6155] mb-2">{c.dni_cuit}</p>}
                    <p className="text-[13px] text-[#2B2D2F]">{c.telefono || '—'}</p>
                    {c.email && <p className="text-[12px] text-[#6B6155]">{c.email}</p>}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(43,45,47,0.06)]">
                      <span className="text-[12px] font-bold text-[#2B2D2F] font-mono">{c.projectCount} proyecto{c.projectCount !== 1 ? 's' : ''}</span>
                      <span className="text-[12px] text-[#6B6155]">{fmtDate(c.lastActivity)}</span>
                    </div>
                  </Card>
                </div>
              ))}
            </div>

            {/* Desktop/tablet: table */}
            <div className="hidden sm:block bg-white border border-[rgba(43,45,47,0.09)] rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(43,45,47,0.07)]">
                    {['Cliente','Contacto','Proyectos','Últ. actividad'].map((col) => (
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
                  {paginated.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/clients/${encodeURIComponent(c.id)}`)}
                      className={`border-b border-[rgba(43,45,47,0.06)] hover:bg-[#F5F2ED]/60 transition-colors cursor-pointer ${
                        i === paginated.length - 1 ? 'border-b-0' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className="font-bold text-[14px] text-[#2B2D2F] tracking-tight">{c.nombre}</span>
                        {c.dni_cuit && (
                          <span className="block text-[11px] font-mono text-[#6B6155] mt-0.5">{c.dni_cuit}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-[#2B2D2F]">{c.telefono || '—'}</span>
                        {c.email && (
                          <span className="block text-[12px] text-[#6B6155] mt-0.5">{c.email}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-bold text-[#2B2D2F] font-mono">{c.projectCount}</span>
                          {c.activeCount > 0 && (
                            <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-sm bg-[#C38A5A]/18 text-[#9C5F2E]">
                              {c.activeCount} activo{c.activeCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-[#6B6155]">{fmtDate(c.lastActivity)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B6155]">
                {filtered.length} Cliente{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B6155]">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label="Página anterior"
                    className="w-11 h-11 flex items-center justify-center rounded border border-[rgba(43,45,47,0.15)] text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <IconChevronLeft />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    aria-label="Página siguiente"
                    className="w-11 h-11 flex items-center justify-center rounded border border-[rgba(43,45,47,0.15)] text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
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
