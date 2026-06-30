'use client';

import { useEffect, useState } from 'react';
import { getProject, getAllDocs } from '@/lib/repo/projects';
import { useAuth } from '@/hooks/useAuth';
import { buildLockedSnapshot } from '@/lib/inheritance';
import { DOC_ORDER, DOC_LABELS } from '@/schemas';
import type { Project, DocType, AnyDoc } from '@/schemas';
import { Body, Header, Footer, PrintActions, type Snapshot } from './PrintDocument';

interface Props {
  code: string;
}

export default function PrintLegajo({ code }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Wait for Firebase Auth to hydrate before reading Firestore.
    // Without this guard, a new tab opens unauthenticated and every
    // read gets permission-denied before the auth token is available.
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
        <div className="print-page">
          <p className="font-mono text-sm text-[#B8AEA3]">Cargando legajo…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="print-shell">
        <div className="print-page">
          <p className="text-sm text-red-600">No se pudo cargar el legajo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="print-shell">
      {/* Portada del legajo */}
      <div className="print-page" style={{ breakAfter: 'page' }}>
        <header className="flex justify-between items-end border-b-2 border-[#2B2D2F] pb-3 mb-4">
          <div>
            <div className="font-mono font-bold text-xl tracking-[3px]">
              COTA<span className="text-[#C38A5A]">·</span>CERO
            </div>
            <div className="text-[10px] text-[#B8AEA3] tracking-[1px] mt-0.5">
              DOCUMENTACIÓN DE OBRA
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-[#2B2D2F] text-lg">{project.code}</div>
            <div className="text-sm font-semibold text-[#C38A5A] tracking-wider">LEGAJO COMPLETO</div>
          </div>
        </header>

        <div className="space-y-3 mt-6">
          <div className="border-b border-[#B8AEA3]/40 pb-3">
            <p className="text-[10px] text-[#B8AEA3] uppercase tracking-wider">Cliente</p>
            <p className="font-semibold">{project.clienteNombre}</p>
            <p className="text-sm text-[#B8AEA3]">
              {project.domicilioObra.calle} {project.domicilioObra.numero}, {project.domicilioObra.localidad}
            </p>
          </div>
          <div className="border-b border-[#B8AEA3]/40 pb-3">
            <p className="text-[10px] text-[#B8AEA3] uppercase tracking-wider">Material instalado</p>
            <p className="font-semibold">{project.materialInstalado.tipo} · {project.materialInstalado.descripcion}</p>
          </div>

          <table className="w-full text-sm mt-4">
            <thead>
              <tr>
                <th className="text-left text-[10px] text-[#B8AEA3] font-semibold py-1 border-b border-[#B8AEA3]">Documento</th>
                <th className="text-left text-[10px] text-[#B8AEA3] font-semibold py-1 border-b border-[#B8AEA3]">Estado</th>
                <th className="text-right text-[10px] text-[#B8AEA3] font-semibold py-1 border-b border-[#B8AEA3]">Versión</th>
              </tr>
            </thead>
            <tbody>
              {DOC_ORDER.map((dt) => {
                const d = docs[dt];
                const st = d?.status ?? 'vacio';
                const locked = st === 'completo' || st === 'firmado';
                return (
                  <tr key={dt}>
                    <td className="py-1.5 border-b border-[#F5F2ED]">
                      <span className="font-mono text-[#C38A5A] mr-2">{dt}</span>
                      {DOC_LABELS[dt]}
                    </td>
                    <td className="py-1.5 border-b border-[#F5F2ED] capitalize">
                      {locked ? <span className="font-semibold">● {st}</span> : <span className="text-[#B8AEA3]">○ {st}</span>}
                    </td>
                    <td className="py-1.5 border-b border-[#F5F2ED] text-right font-mono text-[#B8AEA3]">
                      v{d?.version ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="mt-5 pt-2 border-t border-[#B8AEA3]/50 flex justify-between text-[9px] text-[#B8AEA3] font-mono">
          <span>{project.clienteNombre} · {project.code}</span>
          <span>Generado: {new Date().toLocaleString('es-AR')}</span>
        </footer>
      </div>

      {/* Un print-page por documento */}
      {DOC_ORDER.map((dt, i) => {
        const doc = docs[dt] ?? null;
        const snapshot: Snapshot = doc
          ? (doc.lockedSnapshot ?? buildLockedSnapshot(project, docs, doc))
          : {};
        const status = (doc?.status ?? 'vacio') as string;
        const locked = status === 'completo' || status === 'firmado';
        const isLast = i === DOC_ORDER.length - 1;

        return (
          <div key={dt} className="print-page" style={isLast ? undefined : { breakAfter: 'page' }}>
            <Header project={project} docType={dt} status={status} locked={locked} />
            <Body docType={dt} project={project} s={snapshot} />
            <Footer project={project} doc={doc} />
          </div>
        );
      })}

      <PrintActions />
    </div>
  );
}
