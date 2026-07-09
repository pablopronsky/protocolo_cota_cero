'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listAllProjects } from '@/lib/repo/projects';
import { listClients } from '@/lib/repo/clients';
import type { Project, Client } from '@/schemas';

interface Result {
  type: 'project' | 'client';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

// #24 — Búsqueda global de proyectos + clientes (por código, cliente, localidad,
// DNI/email). Carga perezosa: recién trae las listas al primer foco/tipeo, no
// en cada render del layout. Filtrado client-side, coherente con projects/clients
// (pocos registros, uso interno).
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function ensureLoaded() {
    if (projects === null) listAllProjects().then(setProjects);
    if (clients === null) listClients().then(setClients);
  }

  const q = query.trim().toLowerCase();
  const results: Result[] = !q ? [] : [
    ...(projects ?? [])
      .filter((p) =>
        p.code.toLowerCase().includes(q) ||
        p.clienteNombre.toLowerCase().includes(q) ||
        p.domicilioObra.localidad.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({ type: 'project' as const, id: p.code, title: p.code, subtitle: p.clienteNombre, href: `/projects/${p.code}` })),
    ...(clients ?? [])
      .filter((c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.dni_cuit ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ type: 'client' as const, id: c.id, title: c.nombre, subtitle: c.telefono || c.email || '', href: `/clients/${encodeURIComponent(c.id)}` })),
  ];

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="search"
        placeholder="Buscar proyecto o cliente…"
        value={query}
        onFocus={() => { ensureLoaded(); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); ensureLoaded(); setOpen(true); }}
        className="w-full border border-[rgba(43,45,47,0.15)] rounded-md px-3 py-1.5 text-[12px] bg-white placeholder:text-[#8C8275] focus:border-[#C38A5A] focus:outline-none transition-colors"
      />
      {open && q && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-[rgba(43,45,47,0.12)] rounded-lg shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-[#6B6155]">Sin resultados.</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onClick={() => go(r.href)}
                className="w-full text-left px-4 py-2.5 hover:bg-[#F5F2ED] transition-colors border-b border-[rgba(43,45,47,0.06)] last:border-b-0"
              >
                <p className="text-[13px] font-semibold text-[#2B2D2F]">{r.title}</p>
                <p className="text-[11px] text-[#6B6155]">{r.type === 'project' ? 'Proyecto' : 'Cliente'} · {r.subtitle}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
