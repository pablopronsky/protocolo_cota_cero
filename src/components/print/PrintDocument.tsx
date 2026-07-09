'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { getProject, getAllDocs } from '@/lib/repo/projects';
import { getPhotoUrl } from '@/lib/photos';
import { buildLockedSnapshot } from '@/lib/inheritance';
import { useAuth } from '@/hooks/useAuth';
import { DOC_LABELS } from '@/schemas';
import type { Project, DocType, AnyDoc, PhotoRef } from '@/schemas';

interface Props {
  code: string;
  docType: DocType;
}

export default function PrintDocument({ code, docType }: Props) {
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
        <div className="print-page">
          <p className="font-mono text-sm text-[#B8AEA3]">Cargando documento…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="print-shell">
        <div className="print-page">
          <p className="text-sm text-red-600">No se pudo cargar el documento.</p>
        </div>
      </div>
    );
  }

  const doc = docs[docType] ?? null;
  // El legajo "oficial" es el snapshot congelado al bloquear. Si el documento
  // todavía no se bloqueó, se reconstruye con la misma lógica de herencia para
  // poder imprimir un borrador.
  const snapshot: Snapshot = doc
    ? (doc.lockedSnapshot ?? buildLockedSnapshot(project, docs, doc))
    : {};
  const status = (doc?.status ?? 'vacio') as string;
  const locked = status === 'completo' || status === 'firmado';

  return (
    <div className="print-shell">
      <div className="print-page">
        <Header project={project} docType={docType} status={status} locked={locked} />
        <Body docType={docType} project={project} s={snapshot} />
        <Footer project={project} doc={doc} />
      </div>
      <PrintActions />
    </div>
  );
}

// ── Header / Footer ──────────────────────────────────────────

export type Snapshot = Record<string, unknown>;

export function Header({ project, docType, status, locked }: {
  project: Project; docType: DocType; status: string; locked: boolean;
}) {
  return (
    <header className="print-doc-header">
      <div>
        <Logo size="sm" />
        <span>Superficies y terminaciones</span>
      </div>
      <div>
        <span>{project.code}</span>
        <strong><b>{docType}</b> - {DOC_LABELS[docType]}</strong>
        <small className={locked ? 'is-locked' : 'is-draft'}>
          {locked ? humanize(status) : `${humanize(status)} - borrador`}
        </small>
      </div>
    </header>
  );
}

export function Footer({ project, doc, pageNumber, totalPages }: {
  project: Project;
  doc: AnyDoc | null;
  pageNumber?: number;
  totalPages?: number;
}) {
  return (
    <footer className="print-doc-footer">
      <span>{project.clienteNombre} - {project.code}</span>
      <span>
        {pageNumber && totalPages
          ? `Página ${String(pageNumber).padStart(2, '0')}/${String(totalPages).padStart(2, '0')}`
          : doc?.lockedAt
          ? `Bloqueado: ${fmtDateTime(doc.lockedAt)}`
          : `Generado: ${fmtDateTime(Date.now())}`}
      </span>
    </footer>
  );
}

export function PrintActions({ label = 'Imprimir / Guardar PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print fixed bottom-5 right-5 bg-[#2B2D2F] text-[#F5F2ED] font-semibold rounded-md px-6 py-3 text-sm shadow-lg"
    >
      {label}
    </button>
  );
}

// ── Cuerpo por tipo de documento ─────────────────────────────

export function Body({ docType, project, s }: { docType: DocType; project: Project; s: Snapshot }) {
  switch (docType) {
    case 'VT': return <VTBody project={project} s={s} />;
    case 'EP': return <EPBody s={s} />;
    case 'OT': return <OTBody project={project} s={s} />;
    case 'RF': return <RFBody s={s} />;
    case 'AC': return <ACBody s={s} />;
    case 'FM': return <FMBody s={s} />;
    default: return null;
  }
}

function VTBody({ project, s }: { project: Project; s: Snapshot }) {
  const ambientes = arr<{
    nombre?: string; m2?: number; zocaloMl?: number;
    varillas?: Array<{ tipo?: string; tamano?: string }>; observacion?: string;
  }>(s.ambientes);
  const hum = obj(s.humedad);
  const niv = obj(s.nivelacion);
  const varillasText = (vs?: Array<{ tipo?: string; tamano?: string }>) =>
    (vs ?? [])
      .map((v) => [v.tipo, v.tamano].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
  return (
    <>
      <ClienteBlock project={project} />
      <Section title="Visita y soporte">
        <Grid>
          <Field label="Fecha de visita" value={fmtDate(s.fechaVisita)} />
          <Field label="Estado del soporte" value={humanize(s.estadoSoporte)} />
          <Field label="Material del soporte" value={humanize(s.materialSoporte)} />
        </Grid>
      </Section>

      <Section title="Ambientes">
        <DataTable
          columns={['Ambiente', 'm²', 'Zócalo (ml)', 'Varillas', 'Observación']}
          rows={ambientes.map((a) => [
            a.nombre || '—',
            num(a.m2),
            num(a.zocaloMl),
            varillasText(a.varillas) || '',
            a.observacion || '',
          ])}
          empty="Sin ambientes cargados"
        />
        <p className="text-right text-sm font-mono mt-1">Total: <b>{num(s.m2Total)} m²</b></p>
      </Section>

      <Section title="Mediciones">
        <Grid>
          <Field label="Humedad %" value={num(hum.medicionPct)} />
          <Field label="Método" value={humanize(hum.metodo)} />
          <Field label="Humedad apta" value={yesno(hum.apto)} />
          <Field label="Desnivel máx. (mm)" value={num(niv.desnivelMm)} />
          <Field label="Nivelación apta" value={yesno(niv.apto)} />
        </Grid>
      </Section>

      <Section title="Encuentros críticos">
        <Chips items={arr<string>(s.encuentrosCriticos)} />
      </Section>
      <Section title="Condiciones del espacio">
        <Chips items={arr<string>(s.condicionesEspacio)} />
      </Section>

      <Section title="Dictamen">
        <Field label="Resultado" value={humanize(s.dictamen)} strong />
        <Paragraph value={s.dictamenDetalle} />
      </Section>

      <PhotoSection title="Registro fotográfico" photos={arr<PhotoRef>(s.registroFotografico)} />
      <ObservacionesBlock value={s.observaciones} />
    </>
  );
}

function EPBody({ s }: { s: Snapshot }) {
  const reparaciones = arr<{ zona?: string; accion?: string; producto?: string }>(s.reparacionesPrevias);
  return (
    <>
      <Section title="Datos heredados de la VT" inherited>
        <Grid>
          <Field label="Estado soporte" value={humanize(s.estadoSoporte)} />
          <Field label="Material soporte" value={humanize(s.materialSoporte)} />
          <Field label="Dictamen VT" value={humanize(s.dictamen)} />
          <Field label="Desnivel (mm)" value={num(s.desnivelMm)} />
          <Field label="Humedad (%)" value={num(s.humedadPct)} />
        </Grid>
      </Section>

      <Section title="Nivelación">
        <Grid>
          <Field label="Requiere nivelación" value={yesno(s.requiereNivelacion)} />
          <Field label="Método" value={humanize(s.metodoNivelacion)} />
          <Field label="Espesor (mm)" value={num(s.espesorMm)} />
        </Grid>
      </Section>

      <Section title="Tratamiento de humedad">
        <Grid>
          <Field label="Requiere tratamiento" value={yesno(s.tratamientoHumedad)} />
          <Field label="Barrera de vapor" value={humanize(s.barreraVapor)} />
        </Grid>
      </Section>

      <Section title="Imprimación">
        <Grid>
          <Field label="Requiere imprimación" value={yesno(s.requiereImprimacion)} />
          <Field label="Producto" value={str(s.productoImprimacion)} />
        </Grid>
      </Section>

      <Section title="Limpieza del soporte">
        <Chips items={arr<string>(s.limpiezaSoporte)} />
      </Section>

      <Section title="Reparaciones previas">
        <DataTable
          columns={['Zona', 'Acción', 'Producto']}
          rows={reparaciones.map((r) => [r.zona || '—', r.accion || '—', r.producto || ''])}
          empty="Sin reparaciones"
        />
      </Section>

      <Section title="Condiciones para iniciar">
        <Chips items={arr<string>(s.condicionesParaIniciar)} />
      </Section>

      <Field label="Tiempos de secado estimados" value={str(s.tiemposSecadoEstimados)} />
      <ObservacionesBlock value={s.observaciones} />
    </>
  );
}

function OTBody({ project, s }: { project: Project; s: Snapshot }) {
  const equipo = arr<{ nombre?: string; rol?: string }>(s.equipo);
  const secuencia = arr<{ paso?: number; descripcion?: string; completado?: boolean }>(s.secuenciaEjecucion);
  const materiales = arr<{ item?: string; cantidad?: number; provistoPor?: string }>(s.materialesHerramientas);
  const incidencias = arr<{ fecha?: string; descripcion?: string; accion?: string; resuelto?: boolean }>(s.registroIncidencias);
  return (
    <>
      <Section title="Datos heredados" inherited>
        <Field label="Domicilio de obra" value={`${project.domicilioObra.calle} ${project.domicilioObra.numero}, ${project.domicilioObra.localidad}`} />
        <Field label="Material a instalar" value={`${humanize(project.materialInstalado.tipo)} · ${project.materialInstalado.descripcion}`} />
        <Field label="Material del soporte" value={humanize(s.materialSoporte)} />
      </Section>

      <Section title="Equipo">
        <DataTable
          columns={['Integrante', 'Rol']}
          rows={equipo.map((e) => [e.nombre || '—', e.rol || '—'])}
          empty="Sin equipo asignado"
        />
      </Section>

      <Section title="Plazos y alcance">
        <Grid>
          <Field label="Fecha inicio" value={fmtDate(s.fechaInicio)} />
          <Field label="Fecha fin estimada" value={fmtDate(s.fechaFinEstimada)} />
        </Grid>
        <Paragraph value={s.alcance} />
      </Section>

      <Section title="Secuencia de ejecución">
        <DataTable
          columns={['#', 'Descripción', 'Estado']}
          rows={secuencia.map((p, i) => [String(p.paso ?? i + 1), p.descripcion || '—', p.completado ? '✓ Completado' : 'Pendiente'])}
          empty="Sin pasos definidos"
        />
      </Section>

      <Section title="Criterios técnicos">
        <Chips items={arr<string>(s.criteriosTecnicos)} />
      </Section>

      <Section title="Materiales y herramientas">
        <DataTable
          columns={['Ítem', 'Cant.', 'Provisto por']}
          rows={materiales.map((m) => [m.item || '—', num(m.cantidad), humanize(m.provistoPor)])}
          empty="Sin materiales"
        />
      </Section>

      <Section title="Registro de incidencias">
        <DataTable
          columns={['Fecha', 'Descripción', 'Acción', 'Estado']}
          rows={incidencias.map((x) => [fmtDate(x.fecha), x.descripcion || '—', x.accion || '—', x.resuelto ? '✓ Resuelto' : 'Abierto'])}
          empty="Sin incidencias registradas"
        />
      </Section>

      <ObservacionesBlock value={s.observaciones} />
    </>
  );
}

function RFBody({ s }: { s: Snapshot }) {
  const checklist = arr<{ item?: string; estado?: string; nota?: string }>(s.checklistCalidad);
  return (
    <>
      <Section title="Referencia OT / EP" inherited>
        <Paragraph label="Alcance" value={s.alcance} />
        <Field label="Condiciones EP" value={humanize(arr<string>(s.condicionesParaIniciar).join(', '))} />
      </Section>

      <Section title="Cumplimiento">
        <Grid>
          <Field label="Cumple EP" value={humanize(s.cumpleEP)} strong />
          <Field label="Cumple OT" value={humanize(s.cumpleOT)} strong />
        </Grid>
        <Paragraph label="Desvíos EP" value={s.desviosEP} />
        <Paragraph label="Desvíos OT" value={s.desviosOT} />
      </Section>

      <Section title="Checklist de calidad">
        <DataTable
          columns={['Ítem', 'Estado', 'Nota']}
          rows={checklist.map((c) => [c.item || '—', humanize(c.estado), c.nota || ''])}
          empty="Sin checklist"
        />
      </Section>

      <PhotoSection title="Registro fotográfico" photos={arr<PhotoRef>(s.registroFotografico)} />

      <Section title="Resultado">
        <Grid>
          <Field label="Apto para entrega" value={yesno(s.aptoEntrega)} strong />
          <Field label="Fecha revisión" value={fmtDate(s.fechaRevision)} />
        </Grid>
      </Section>

      <ObservacionesBlock value={s.observaciones} />
    </>
  );
}

function ACBody({ s }: { s: Snapshot }) {
  const cliente = obj(s.cliente);
  const dom = obj(s.domicilioObra);
  const fc = obj(s.firmaCliente);
  const fcc = obj(s.firmaCotaCero);
  return (
    <>
      <Section title="Datos heredados" inherited>
        <Field label="Cliente" value={str(cliente.nombre)} />
        <Field label="Domicilio de obra" value={dom.calle ? `${str(dom.calle)} ${str(dom.numero)}, ${str(dom.localidad)}` : '—'} />
        <Paragraph label="Obra ejecutada" value={s.obraEjecutada} />
      </Section>

      <Section title="Conformidad">
        <Grid>
          <Field label="Fecha del acta" value={fmtDate(s.fechaActa)} />
          <Field label="Conformidad" value={humanize(s.conformidad)} strong />
        </Grid>
        <Paragraph label="Observaciones del cliente" value={s.observacionesCliente} />
      </Section>

      <div className="grid grid-cols-2 gap-6 mt-6 break-inside-avoid">
        <SignatureBox
          title="Firma del cliente"
          name={str(fc.nombreAclaratorio)}
          subtitle={fc.dni ? `DNI ${str(fc.dni)}` : ''}
          firma={fc.firma as PhotoRef | null}
        />
        <SignatureBox
          title="Firma COTA CERO"
          name=""
          subtitle=""
          firma={fcc.firma as PhotoRef | null}
        />
      </div>
    </>
  );
}

function FMBody({ s }: { s: Snapshot }) {
  const material = obj(s.materialInstalado);
  return (
    <>
      <Section title="Material instalado" inherited>
        <Grid>
          <Field label="Tipo" value={humanize(material.tipo)} />
          <Field label="Descripción" value={str(material.descripcion)} />
          <Field label="Espacio" value={humanize(s.tipoEspacio)} />
        </Grid>
      </Section>

      <Section title="Uso recomendado">
        <Chips items={arr<string>(s.usoRecomendado)} />
      </Section>

      <Section title="Limpieza y mantenimiento">
        <Field label="Frecuencia de limpieza" value={humanize(s.frecuenciaLimpieza)} />
        <div className="grid grid-cols-2 gap-6 mt-2">
          <ListBlock label="Productos aptos" items={arr<string>(s.productosAptos)} />
          <ListBlock label="Productos NO aptos" items={arr<string>(s.productosNoAptos)} />
        </div>
      </Section>

      <Section title="Precauciones">
        <Chips items={arr<string>(s.precauciones)} />
      </Section>

      {str(s.recomendaciones) && (
        <Section title="Cuidados y recomendaciones">
          <p className="whitespace-pre-wrap leading-relaxed text-sm">{str(s.recomendaciones)}</p>
        </Section>
      )}

      <ObservacionesBlock value={s.observaciones} />
    </>
  );
}

// ── Primitivas de presentación ───────────────────────────────

function Section({ title, children, inherited }: {
  title: string; children: React.ReactNode; inherited?: boolean;
}) {
  return (
    <section className={`doc-section print-doc-section ${inherited ? 'is-inherited' : ''}`}>
      <h2 className="print-doc-section-title">
        {title}{inherited ? ' - heredado' : ''}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="print-field-grid">{children}</div>;
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="print-field">
      <span>{label}</span>
      <strong className={strong ? 'is-strong' : ''}>{value || '-'}</strong>
    </div>
  );
}

function Paragraph({ label, value }: { label?: string; value: unknown }) {
  const v = str(value);
  if (!v) return null;
  return (
    <div className="print-paragraph">
      {label && <span>{label}</span>}
      <p>{v}</p>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="print-empty">-</p>;
  return (
    <div className="print-chip-list">
      {items.map((it) => (
        <span key={it}>
          {humanize(it)}
        </span>
      ))}
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="print-list-block">
      <span>{label}</span>
      {items.length === 0 ? (
        <p className="print-empty">-</p>
      ) : (
        <ul>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

function DataTable({ columns, rows, empty }: {
  columns: string[]; rows: (string | number)[][]; empty: string;
}) {
  if (rows.length === 0) return <p className="print-empty">{empty}</p>;
  return (
    <table className="print-data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j}>{cell === '' ? '-' : cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClienteBlock({ project }: { project: Project }) {
  return (
    <Section title="Cliente y obra" inherited>
      <Grid>
        <Field label="Cliente" value={project.clienteNombre} />
        <Field label="Domicilio" value={`${project.domicilioObra.calle} ${project.domicilioObra.numero}, ${project.domicilioObra.localidad}`} />
      </Grid>
    </Section>
  );
}

function ObservacionesBlock({ value }: { value: unknown }) {
  const v = str(value);
  if (!v) return null;
  return (
    <Section title="Observaciones">
      <p className="print-note-text">{v}</p>
    </Section>
  );
}

function SignatureBox({ title, name, subtitle, firma }: {
  title: string; name: string; subtitle: string; firma: PhotoRef | null;
}) {
  const src = useResolvedPhoto(firma);
  return (
    <div>
      <div className="border border-[#B8AEA3] rounded h-28 flex items-center justify-center overflow-hidden bg-white">
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={title} className="w-full h-full object-contain" />
          : <span className="text-[10px] text-[#B8AEA3]">Firma</span>}
      </div>
      <div className="border-t border-[#2B2D2F] mt-1 pt-1">
        <div className="text-[10px] text-[#B8AEA3]">{title}</div>
        {name && <div className="font-medium text-sm">{name}</div>}
        {subtitle && <div className="text-xs text-[#B8AEA3]">{subtitle}</div>}
      </div>
    </div>
  );
}

function PhotoSection({ title, photos }: { title: string; photos: PhotoRef[] }) {
  if (photos.length === 0) return null;
  return (
    <Section title={title}>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
      </div>
    </Section>
  );
}

function PhotoThumb({ photo }: { photo: PhotoRef }) {
  const src = useResolvedPhoto(photo);
  return (
    <div className="aspect-square border border-[#B8AEA3]/40 rounded overflow-hidden bg-[#F5F2ED] flex items-center justify-center">
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={photo.caption ?? ''} className="w-full h-full object-cover" />
        : <span className="text-[9px] text-[#B8AEA3] font-mono">{photo.pending ? 'pendiente' : 'foto'}</span>}
    </div>
  );
}

// Resuelve la URL de una foto: usa el blob local si está en sesión, si no baja
// la URL de Storage (solo si ya se subió).
function useResolvedPhoto(photo: PhotoRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(photo?.localBlob ?? null);
  useEffect(() => {
    let alive = true;
    if (photo?.localBlob) { setUrl(photo.localBlob); return; }
    if (photo && !photo.pending && photo.storagePath) {
      getPhotoUrl(photo.storagePath).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    } else {
      setUrl(null);
    }
    return () => { alive = false; };
  }, [photo?.id, photo?.localBlob, photo?.pending, photo?.storagePath]);
  return url;
}

// ── Helpers de formato ───────────────────────────────────────

function humanize(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v).replace(/_/g, ' ');
}
function str(v: unknown): string {
  return v == null ? '' : String(v);
}
function num(v: unknown): string {
  if (v == null || v === '') return '0';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '0';
}
function yesno(v: unknown): string {
  return v ? 'Sí' : 'No';
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function fmtDate(v: unknown): string {
  const sv = str(v);
  if (!sv) return '—';
  const d = new Date(sv);
  return Number.isNaN(d.getTime()) ? sv : d.toLocaleDateString('es-AR');
}
function fmtDateTime(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  return new Date(n).toLocaleString('es-AR');
}
