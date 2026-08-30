'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { buildLockedSnapshot } from '@/lib/inheritance';
import type { Project, Client, DocType, AnyDoc } from '@/schemas';
import { FM_DEFAULTS_BY_TIPO } from '@/schemas';
import { formatMaterialForClient } from '@/lib/material';
import { evaluateDeliverable, DRAFT_NOTICE, type DeliverableGate } from '@/lib/deliverable';
import { Body, DocumentFrame, type Snapshot } from './PrintDocument';
import { MaintenanceGuide } from './MaintenanceGuide';
import { PrintBrandLogo } from './PrintBrandLogo';

interface Props {
  code: string;
}

type LoadError = 'auth' | 'not_found' | 'load' | null;

interface DeliverablePayload {
  project: Project;
  documents: Partial<Record<DocType, AnyDoc>>;
  client: Client | null;
  deliverable?: DeliverableGate;
}

// Entregable premium para el cliente: portada + Acta de Conformidad + Ficha de
// Mantenimiento. Reutiliza los cuerpos del legajo técnico, pero con presentación
// branded (sin estados internos, versiones ni "borrador").
export default function PrintEntregable({ code }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>(null);
  // #P0-1 — Arranca en false: hasta que el servidor confirme que la obra tiene
  // entregable final, todo lo que se renderiza es borrador.
  const [isFinal, setIsFinal] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setError('auth'); setLoading(false); return; }

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await user.getIdToken();
        // Se pide siempre en modo preview: la ruta sin `preview=1` niega el
        // payload cuando la obra no está en condiciones, y acá queremos poder
        // mostrar el borrador rotulado. Quién decide si es final sigue siendo
        // el servidor, vía `payload.deliverable`.
        const url = `/api/deliverable/${encodeURIComponent(code)}?preview=1`;
        let res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        // Una pestaña recién abierta puede conservar un token vencido durante
        // unos milisegundos. Renovarlo una vez evita un falso error de carga.
        if (res.status === 401) {
          const refreshedToken = await user.getIdToken(true);
          res = await fetch(url, {
            headers: { Authorization: `Bearer ${refreshedToken}` },
            cache: 'no-store',
          });
        }

        if (!alive) return;
        if (res.status === 401) { setError('auth'); return; }
        if (res.status === 404) { setError('not_found'); return; }
        if (!res.ok) throw new Error(`deliverable ${res.status}`);

        const payload = await res.json() as DeliverablePayload;
        setProject(payload.project);
        setDocs(payload.documents);
        setClient(payload.client);
        // Doble capa: el veredicto del servidor Y el recalculado acá sobre los
        // mismos documentos. Si alguno dice que no es final, es borrador.
        setIsFinal(
          payload.deliverable?.final === true
          && evaluateDeliverable(payload.documents).final,
        );
      } catch (loadError) {
        console.error('[PrintEntregable]', loadError);
        if (alive) setError('load');
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
    const authError = error === 'auth';
    const message = authError
      ? 'Tu sesión venció. Ingresá nuevamente para preparar el PDF.'
      : error === 'not_found'
        ? 'No encontramos esta obra.'
        : 'No pudimos preparar el entregable. Reintentá en unos segundos.';
    return (
      <div className="print-shell">
        <div className="print-page flex min-h-[80vh] items-center justify-center">
          <div className="max-w-md text-center">
            <p className="font-semibold text-[#2B2D2F]">{message}</p>
            <a
              href={authError ? `/login?next=${encodeURIComponent(`/print/${code}/entregable`)}` : window.location.href}
              className="inline-block mt-5 rounded-md bg-[#C38A5A] px-5 py-3 text-sm font-semibold text-white"
            >
              {authError ? 'Volver a ingresar' : 'Reintentar'}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const snapFor = (dt: DocType): Snapshot => {
    const d = docs[dt] ?? null;
    return d ? (d.lockedSnapshot ?? buildLockedSnapshot(project, docs, d)) : {};
  };

  const fmDoc = docs.FM;
  const fmSnapshot = fmDoc?.status === 'vacio' || !fmDoc
    ? { ...FM_DEFAULTS_BY_TIPO[project.materialInstalado.tipo], ...snapFor('FM') }
    : snapFor('FM');

  return (
    <div className="print-shell">
      <DeliverableCover project={project} final={isFinal} />

      <DeliverableDocPage title="Acta de Conformidad" project={project} docCode="AC" final={isFinal}>
        <Body docType="AC" project={project} s={snapFor('AC')} clientFacing />
      </DeliverableDocPage>

      <DeliverableDocPage title="Ficha de Mantenimiento" project={project} docCode="FM" final={isFinal} last>
        <MaintenanceGuide project={project} snapshot={fmSnapshot} />
      </DeliverableDocPage>

      <Actions project={project} client={client} final={isFinal} />
    </div>
  );
}

// ── Portada ──────────────────────────────────────────────────
export function DeliverableCover({ project, final }: { project: Project; final: boolean }) {
  return (
    <div className="print-page deliverable-cover print-color">
      <div className="deliverable-cover-top">
        <PrintBrandLogo inverse className="deliverable-cover-logo" />
        <div>
          <strong>{project.code}</strong>
          <span>Documentación para el propietario</span>
        </div>
      </div>

      <main className="deliverable-cover-main">
        <p>Documentación para el propietario</p>
        <h1>Entrega<br />de obra</h1>
        <h2>Acta de conformidad y ficha de mantenimiento</h2>
        <blockquote>La superficie bien resuelta empieza antes de colocar.</blockquote>
      </main>

      {/* #P0-1 — El sello de "apto" ya no es fijo: solo aparece cuando la RF
          está cerrada y apta Y el acta está firmada. En cualquier otro caso el
          documento se rotula como borrador sin valor de entrega. */}
      {final ? (
        <div className="deliverable-cover-status">
          <span aria-hidden>✓</span>
          <strong>Apto para entrega</strong>
        </div>
      ) : (
        <div
          className="deliverable-cover-status"
          style={{ background: '#8A2B2B', color: '#FFFFFF', borderColor: '#8A2B2B' }}
        >
          <span aria-hidden>!</span>
          <strong>{DRAFT_NOTICE}</strong>
        </div>
      )}

      <div className="deliverable-cover-meta">
        <Row label="Proyecto" value={project.clienteNombre} />
        <Row label="Espacio" value={humanize(project.tipoEspacio)} />
        <Row
          label="Sistema instalado"
          value={`${project.materialInstalado.tipo.toUpperCase()} · ${formatMaterialForClient(project.materialInstalado.descripcion)}`}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

// ── Página de documento (branded, sin metadatos internos) ────
export function DeliverableDocPage({ title, project, docCode, final, last, children }: {
  title: string; project: Project; docCode: 'AC' | 'FM'; final: boolean;
  last?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`print-page print-flow-page deliverable-document ${last ? 'is-last' : ''}`}>
      <DocumentFrame
        header={(
          <header className="deliverable-doc-header">
            <PrintBrandLogo className="print-doc-logo" />
            <div><span>{project.code}</span><strong>{docCode} · {title}</strong></div>
          </header>
        )}
        footer={(
          <footer className="deliverable-doc-footer">
            <span>{project.code} · COTA CERO - Protocolo de obra</span>
            <span>{final ? 'Documento de entrega' : DRAFT_NOTICE}</span>
          </footer>
        )}
      >
        <div className="deliverable-doc-title">
          {!final && (
            <p style={{ color: '#8A2B2B', fontWeight: 700, letterSpacing: '0.14em' }}>
              {DRAFT_NOTICE}
            </p>
          )}
          <p>Documento de entrega · {docCode}</p>
          <h1>{title}</h1>
        </div>
        {children}
      </DocumentFrame>
    </section>
  );
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

// ── Acciones (pantalla) ──────────────────────────────────────
function Actions({ project, client, final }: { project: Project; client: Client | null; final: boolean }) {
  const phone = (client?.telefono ?? '').replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Hola ${project.clienteNombre}, te compartimos la documentación de entrega de tu obra (${project.code}). ¡Gracias por confiar en COTA·CERO!`,
  );
  const waHref = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;

  return (
    <div className="no-print fixed bottom-5 right-5 flex items-center gap-2">
      {/* #P0-1 — Sin entregable final no se ofrece mandárselo al cliente: la
          acción de WhatsApp presentaría el borrador como documento terminado. */}
      {final ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#1A1B1D] text-[#F5F2ED] font-semibold rounded-md px-5 py-3 text-sm shadow-lg border border-[#C38A5A]/40"
        >
          WhatsApp al cliente
        </a>
      ) : (
        <span
          className="rounded-md px-5 py-3 text-sm font-semibold shadow-lg"
          style={{ background: '#8A2B2B', color: '#FFFFFF' }}
        >
          {DRAFT_NOTICE}
        </span>
      )}
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
