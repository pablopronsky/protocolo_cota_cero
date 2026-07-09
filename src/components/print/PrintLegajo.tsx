'use client';

import { useEffect, useMemo, useState } from 'react';
import Logo from '@/components/Logo';
import { getProject, getAllDocs } from '@/lib/repo/projects';
import { useAuth } from '@/hooks/useAuth';
import { buildLockedSnapshot } from '@/lib/inheritance';
import { DOC_ORDER, DOC_LABELS } from '@/schemas';
import type { Project, DocType, DocStatus, AnyDoc } from '@/schemas';
import { Body, Header, Footer, PrintActions, type Snapshot } from './PrintDocument';

interface Props {
  code: string;
}

type DocRow = {
  docType: DocType;
  label: string;
  status: DocStatus;
  locked: boolean;
  version: number;
  updatedAt: number | null;
};

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

  const rows = useMemo<DocRow[]>(() => {
    if (!project) return [];
    return DOC_ORDER.map((docType) => {
      const doc = docs[docType];
      const status = (project.docStatus?.[docType] ?? doc?.status ?? 'vacio') as DocStatus;
      return {
        docType,
        label: DOC_LABELS[docType],
        status,
        locked: isDocLocked(status),
        version: doc?.version ?? 0,
        updatedAt: typeof doc?.updatedAt === 'number' ? doc.updatedAt : null,
      };
    });
  }, [docs, project]);

  if (loading) {
    return (
      <div className="print-shell">
        <div className="print-page legajo-page">
          <div className="legajo-canvas">
            <p className="legajo-loading">Cargando legajo...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="print-shell">
        <div className="print-page legajo-page">
          <div className="legajo-canvas">
            <p className="text-sm text-red-600">No se pudo cargar el legajo.</p>
          </div>
        </div>
      </div>
    );
  }

  const isFinal = isLegajoFinal(rows);
  const pendingRows = rows.filter((row) => !row.locked || (row.docType === 'AC' && row.status !== 'firmado'));
  const totalPages = DOC_ORDER.length + 2;
  const statusLabel = isFinal ? 'Final' : 'Borrador';
  const statusCaption = isFinal ? 'Legajo listo para emitir' : 'Vista previa controlada';

  return (
    <div className="print-shell">
      <Cover
        project={project}
        statusLabel={statusLabel}
        statusCaption={statusCaption}
        isFinal={isFinal}
      />

      <SummaryPage
        project={project}
        rows={rows}
        isFinal={isFinal}
        pendingRows={pendingRows}
        pageNumber={2}
        totalPages={totalPages}
      />

      {DOC_ORDER.map((docType, i) => {
        const doc = docs[docType] ?? null;
        const row = rows.find((item) => item.docType === docType);
        const snapshot: Snapshot = doc
          ? (doc.lockedSnapshot ?? buildLockedSnapshot(project, docs, doc))
          : {};
        const status = row?.status ?? 'vacio';
        const locked = row?.locked ?? false;
        const pageNumber = i + 3;
        const isLast = i === DOC_ORDER.length - 1;

        return (
          <div key={docType} className="print-page legajo-page" style={isLast ? undefined : { breakAfter: 'page' }}>
            <div className="legajo-canvas legajo-doc-canvas">
              <Header project={project} docType={docType} status={status} locked={locked} />
              {!locked && (
                <div className="legajo-preview-note">
                  <strong>Documento en vista previa:</strong> esta ficha todavía no está bloqueada. El legajo final
                  debe emitirse con el snapshot firmado o completo.
                </div>
              )}
              <Body docType={docType} project={project} s={snapshot} />
              <Footer project={project} doc={doc} pageNumber={pageNumber} totalPages={totalPages} />
            </div>
          </div>
        );
      })}

      <PrintActions label={isFinal ? 'Guardar legajo final' : 'Guardar vista previa'} />
    </div>
  );
}

function Cover({
  project,
  statusLabel,
  statusCaption,
  isFinal,
}: {
  project: Project;
  statusLabel: string;
  statusCaption: string;
  isFinal: boolean;
}) {
  return (
    <div className="print-page legajo-page" style={{ breakAfter: 'page' }}>
      <section className="legajo-canvas legajo-cover print-color">
        <div className="legajo-cover-top">
          <div className="legajo-cover-logo">
            <Logo size="lg" />
            <span>Superficies y terminaciones</span>
          </div>
          <div className={`legajo-status-stamp ${isFinal ? 'is-final' : 'is-draft'}`}>
            <span>Estado</span>
            <strong>{statusLabel}</strong>
          </div>
        </div>

        <main className="legajo-cover-main">
          <p className="legajo-kicker">Protocolo de obra</p>
          <h1>
            Legajo técnico
            <span>completo</span>
          </h1>
          <p>
            Documento de control, trazabilidad y cierre para instalación de superficies.
            {isFinal ? ' Emitido como versión final.' : ' Preparado para revisar antes de la emisión final.'}
          </p>
        </main>

        <div className="legajo-cover-meta">
          <MetaBlock
            label="Proyecto"
            value={project.clienteNombre}
            note={projectAddress(project)}
          />
          <MetaBlock
            label="Código"
            value={project.code}
            note={`${humanize(project.tipoEspacio)} - ${humanize(project.modalidad)}`}
          />
          <MetaBlock
            label="Emitido"
            value={new Date().toLocaleDateString('es-AR')}
            note={`${materialLabel(project)}${areaLabel(project)}`}
          />
        </div>

        <div className="legajo-cover-caption">{statusCaption}</div>
      </section>
    </div>
  );
}

function SummaryPage({
  project,
  rows,
  isFinal,
  pendingRows,
  pageNumber,
  totalPages,
}: {
  project: Project;
  rows: DocRow[];
  isFinal: boolean;
  pendingRows: DocRow[];
  pageNumber: number;
  totalPages: number;
}) {
  const completeCount = rows.filter((row) => row.locked).length;

  return (
    <div className="print-page legajo-page" style={{ breakAfter: 'page' }}>
      <section className="legajo-canvas">
        <LegajoRunningHeader project={project} title="Legajo técnico de obra" />

        <main className="legajo-content">
          <p className="legajo-kicker">Resumen ejecutivo</p>
          <h2 className="legajo-page-title">Estado documental de la obra</h2>
          <p className="legajo-lead">
            Esta primera página refleja el estado real del tablero del proyecto. El resumen usa el estado vivo
            del proyecto para evitar portadas desactualizadas.
          </p>

          <div className="legajo-summary-grid">
            <section className="legajo-panel">
              <div className="legajo-panel-head">
                <h3>Datos principales</h3>
                <span className={`legajo-badge ${isFinal ? 'is-ok' : 'is-progress'}`}>
                  {isFinal ? 'Final' : 'En revisión'}
                </span>
              </div>
              <div className="legajo-panel-body legajo-facts">
                <Fact label="Cliente" value={project.clienteNombre} />
                <Fact label="Tipo de obra" value={`${humanize(project.tipoEspacio)} - ${humanize(project.modalidad)}`} />
                <Fact label="Dirección" value={projectAddress(project)} />
                <Fact label="Material" value={materialLabel(project)} />
              </div>
            </section>

            <section className="legajo-panel is-dark print-color">
              <div className="legajo-panel-head">
                <h3>Avance</h3>
                <span className={`legajo-badge ${isFinal ? 'is-ok' : 'is-progress'}`}>
                  {completeCount}/{DOC_ORDER.length}
                </span>
              </div>
              <div className="legajo-panel-body">
                <p className="legajo-big-number">
                  {completeCount}
                  <small> de {DOC_ORDER.length}</small>
                </p>
                <Fact label="Superficie estimada" value={project.materialInstalado.m2Estimados ? `${project.materialInstalado.m2Estimados} m2` : 'Sin estimar'} dark />
                <Fact label="Estado de salida" value={isFinal ? 'Listo para emitir' : 'Vista previa'} dark />
              </div>
            </section>
          </div>

          <div className="legajo-status-line">
            {rows.map((row, i) => (
              <div className="legajo-step" key={row.docType}>
                <span className="legajo-step-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="legajo-step-code">{row.docType}</span>
                <span className={`legajo-step-status ${statusTone(row.status)}`}>
                  {statusText(row.status)}
                </span>
              </div>
            ))}
          </div>

          <div className={`legajo-alert ${isFinal ? 'is-ok' : 'is-draft'}`}>
            <div>{isFinal ? 'Final' : 'Cierre'}</div>
            <p>
              {isFinal
                ? 'Todos los documentos requeridos están cerrados. Esta salida puede usarse como legajo final de obra.'
                : `Legajo pendiente de cierre: faltan ${pendingRows.map((row) => row.docType).join(', ')}. La descarga es una vista previa y debe conservar esa marca hasta completar el protocolo.`}
            </p>
          </div>

          <div className="legajo-exit-grid">
            <ExitItem
              title={isFinal ? 'Documento final' : 'Vista previa permitida'}
              text={isFinal ? 'La portada no muestra borrador y el legajo puede archivarse.' : 'Se puede revisar con etiqueta de borrador y estados visibles.'}
            />
            <ExitItem
              title={isFinal ? 'Snapshots bloqueados' : 'Final bloqueado'}
              text={isFinal ? 'Cada ficha sale desde su versión cerrada.' : 'La versión final requiere todas las fichas cerradas, RF firmada y AC firmada.'}
            />
            <ExitItem
              title="Portada viva"
              text="El resumen toma project.docStatus para no depender de documentos en caché."
            />
          </div>
        </main>

        <LegajoFooter project={project} pageNumber={pageNumber} totalPages={totalPages} />
      </section>
    </div>
  );
}

function LegajoRunningHeader({ project, title }: { project: Project; title: string }) {
  return (
    <header className="legajo-running-header">
      <Logo size="sm" />
      <div>
        <span>{title}</span>
        <strong>{project.code}</strong>
      </div>
    </header>
  );
}

function LegajoFooter({ project, pageNumber, totalPages }: {
  project: Project;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <footer className="legajo-running-footer">
      <span>{project.code} - {project.clienteNombre}</span>
      <span>Página {String(pageNumber).padStart(2, '0')}/{String(totalPages).padStart(2, '0')}</span>
    </footer>
  );
}

function MetaBlock({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="legajo-meta-block">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Fact({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`legajo-fact ${dark ? 'is-dark' : ''}`}>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function ExitItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="legajo-exit-item">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function isDocLocked(status: DocStatus | undefined): boolean {
  return status === 'completo' || status === 'firmado';
}

function isLegajoFinal(rows: DocRow[]): boolean {
  const statusByType = Object.fromEntries(rows.map((row) => [row.docType, row.status])) as Partial<Record<DocType, DocStatus>>;
  return rows.length === DOC_ORDER.length
    && rows.every((row) => row.locked)
    && statusByType.RF === 'firmado'
    && statusByType.AC === 'firmado';
}

function statusText(status: DocStatus): string {
  const labels: Record<DocStatus, string> = {
    vacio: 'Pendiente',
    en_progreso: 'En progreso',
    completo: 'Completo',
    firmado: 'Firmado',
  };
  return labels[status];
}

function statusTone(status: DocStatus): string {
  if (status === 'firmado' || status === 'completo') return 'is-ok';
  if (status === 'en_progreso') return 'is-progress';
  return 'is-pending';
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

function materialLabel(project: Project): string {
  return `${humanize(project.materialInstalado.tipo)} - ${project.materialInstalado.descripcion}`;
}

function areaLabel(project: Project): string {
  return project.materialInstalado.m2Estimados ? ` - ${project.materialInstalado.m2Estimados} m2` : '';
}

function projectAddress(project: Project): string {
  const { calle, numero, localidad, referencia } = project.domicilioObra;
  return [calle, numero, referencia, localidad].filter(Boolean).join(' - ');
}
