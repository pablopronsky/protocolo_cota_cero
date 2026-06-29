'use client';

import { useEffect, useState } from 'react';
import { getProject, getAllDocs } from '@/lib/repo/projects';
import { useAuth } from '@/hooks/useAuth';
import { buildLockedSnapshot } from '@/lib/inheritance';
import type { Project, DocType, AnyDoc } from '@/schemas';
import { Body, type Snapshot } from './PrintDocument';

interface Props {
  code: string;
}

// Entregable premium para el cliente: portada + Acta de Conformidad + Ficha de
// Mantenimiento. Reutiliza los cuerpos del legajo técnico, pero con presentación
// branded (sin estados internos, versiones ni "borrador").
export default function PrintEntregable({ code }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setError(true); setLoading(false); return; }

    let alive = true;
    (async () => {
      try {
        const [p, d] = await Promise.all([getProject(code), getAllDocs(code)]);
        if (!alive) return;
        if (!p) { setError(true); setLoading(false); return; }
        setProject(p);
        setDocs(d);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code, user, authLoading]);

  if (loading) {
    return (
      <div className="print-shell">
        <div className="print-page"><p className="font-mono text-sm text-[#B8AEA3]">Preparando entregable…</p></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="print-shell">
        <div className="print-page"><p className="text-sm text-red-600">No se pudo cargar el entregable.</p></div>
      </div>
    );
  }

  const snapFor = (dt: DocType): Snapshot => {
    const d = docs[dt] ?? null;
    return d ? (d.lockedSnapshot ?? buildLockedSnapshot(project, docs, d)) : {};
  };

  return (
    <div className="print-shell">
      <Cover project={project} />

      <DocPage title="Acta de Conformidad" code={project.code}>
        <Body docType="AC" project={project} s={snapFor('AC')} />
      </DocPage>

      <DocPage title="Ficha de Mantenimiento" code={project.code} last>
        <Body docType="FM" project={project} s={snapFor('FM')} />
      </DocPage>

      <Actions project={project} />
    </div>
  );
}

// ── Portada ──────────────────────────────────────────────────
function Cover({ project }: { project: Project }) {
  return (
    <div
      className="print-page print-cover print-color"
      style={{
        background: '#1A1B1D',
        color: '#F5F2ED',
        minHeight: '240mm',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        pageBreakAfter: 'always',
      }}
    >
      <div className="flex justify-between items-start">
        <span className="font-mono text-[10px] tracking-[0.3em] text-[#B8AEA3]/70 uppercase">
          Entrega de obra
        </span>
        <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-[#C38A5A]">
          {project.code}
        </span>
      </div>

      <div className="flex flex-col items-center text-center py-10">
        <Wordmark />
        <p className="mt-4 text-[11px] tracking-[0.42em] text-[#B8AEA3] uppercase">
          Superficies y Terminaciones
        </p>
        <div className="w-10 h-px bg-[#C38A5A] my-7" />
        <p className="text-[13px] tracking-[0.2em] text-[#F5F2ED]/85 uppercase">
          Documentación de entrega
        </p>
      </div>

      <div className="border-t border-white/10 pt-5 space-y-3">
        <Row label="Cliente" value={project.cliente.nombre} />
        <Row
          label="Domicilio de obra"
          value={`${project.domicilioObra.calle} ${project.domicilioObra.numero}, ${project.domicilioObra.localidad}`}
        />
        <Row
          label="Material instalado"
          value={`${cap(project.materialInstalado.tipo)} · ${project.materialInstalado.descripcion}`}
        />
        <Row label="Fecha de entrega" value={new Date().toLocaleDateString('es-AR')} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-6">
      <span className="text-[10px] uppercase tracking-[0.22em] text-[#B8AEA3]/70 shrink-0">{label}</span>
      <span className="text-sm font-medium text-[#F5F2ED] text-right">{value || '—'}</span>
    </div>
  );
}

function Wordmark() {
  return (
    <div
      className="flex items-center font-bold uppercase"
      style={{ fontSize: 54, letterSpacing: '0.155em', lineHeight: 1, color: '#F5F2ED' }}
    >
      COTA
      <span style={{ display: 'inline-block', position: 'relative', width: 2, height: '0.82em', margin: '0 0.32em', background: '#C38A5A' }}>
        <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, background: '#C38A5A' }} />
      </span>
      CERO
    </div>
  );
}

// ── Página de documento (branded, sin metadatos internos) ────
function DocPage({ title, code, last, children }: {
  title: string; code: string; last?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="print-page" style={last ? undefined : { pageBreakAfter: 'always' }}>
      <header className="flex justify-between items-end border-b-2 border-[#2B2D2F] pb-3 mb-5">
        <div>
          <div className="font-mono font-bold text-lg tracking-[3px] text-[#2B2D2F]">
            COTA<span className="text-[#C38A5A]">·</span>CERO
          </div>
          <div className="text-[9px] text-[#B8AEA3] tracking-[2px] mt-0.5 uppercase">
            Superficies y Terminaciones
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-[#2B2D2F] leading-tight">{title}</div>
          <div className="font-mono text-[11px] text-[#C38A5A] tracking-wider">{code}</div>
        </div>
      </header>
      {children}
      <footer className="mt-6 pt-2 border-t border-[#B8AEA3]/50 text-center text-[9px] text-[#B8AEA3] tracking-[0.2em] uppercase">
        Gracias por elegir COTA·CERO · Superficies y Terminaciones
      </footer>
    </div>
  );
}

// ── Acciones (pantalla) ──────────────────────────────────────
function Actions({ project }: { project: Project }) {
  const phone = project.cliente.telefono.replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Hola ${project.cliente.nombre}, te compartimos la documentación de entrega de tu obra (${project.code}). ¡Gracias por confiar en COTA·CERO!`,
  );
  const waHref = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;

  return (
    <div className="no-print fixed bottom-5 right-5 flex gap-2">
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-[#1A1B1D] text-[#F5F2ED] font-semibold rounded-md px-5 py-3 text-sm shadow-lg border border-[#C38A5A]/40"
      >
        WhatsApp al cliente
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="text-white font-semibold rounded-md px-6 py-3 text-sm shadow-lg"
        style={{ background: '#C38A5A' }}
      >
        Guardar / Imprimir PDF
      </button>
    </div>
  );
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
