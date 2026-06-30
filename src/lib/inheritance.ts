import type {
  Project, DocType, DocVT, DocEP, DocOT, DocRF, DocAC, DocFM,
  AnyDoc, Inherited,
} from '@/schemas';

export interface InheritedSeed {
  readonly: Record<string, unknown>;
  editable: Record<string, Inherited<unknown>>;
}

export interface DriftReport {
  field: string;
  currentValue: unknown;
  originValue: unknown;
  originDoc: DocType | 'PROJECT';
}

// Construye el seed de herencia para un documento nuevo.
// Isomórfico: sin imports de Firebase.
export function deriveInherited(
  project: Project,
  upstream: Partial<Record<DocType, AnyDoc>>,
  targetType: DocType,
): InheritedSeed {
  const vt = upstream.VT as DocVT | undefined;
  const ep = upstream.EP as DocEP | undefined;
  const ot = upstream.OT as DocOT | undefined;

  switch (targetType) {
    case 'EP':
      return {
        readonly: {
          estadoSoporte: vt?.estadoSoporte ?? '',
          materialSoporte: vt?.materialSoporte ?? '',
          dictamen: vt?.dictamen ?? '',
          humedadApto: vt?.humedad?.apto ?? false,
        },
        editable: {
          desnivelMm: makeInherited(
            vt?.nivelacion?.desnivelMm ?? 0, 'VT', 'nivelacion.desnivelMm', vt?.version ?? 0,
          ),
          humedadPct: makeInherited(
            vt?.humedad?.medicionPct ?? 0, 'VT', 'humedad.medicionPct', vt?.version ?? 0,
          ),
        },
      };

    case 'OT':
      return {
        readonly: {
          domicilioObra: project.domicilioObra,
          materialInstalado: project.materialInstalado,
          materialSoporte: vt?.materialSoporte ?? '',
          resumenPreparacion: {
            metodoNivelacion: ep?.metodoNivelacion ?? null,
            barreraVapor: ep?.barreraVapor ?? null,
            requiereImprimacion: ep?.requiereImprimacion ?? false,
          },
        },
        editable: {},
      };

    case 'RF':
      return {
        readonly: {
          alcance: ot?.alcance ?? '',
          secuenciaEjecucion: ot?.secuenciaEjecucion ?? [],
          condicionesParaIniciar: ep?.condicionesParaIniciar ?? [],
        },
        editable: {},
      };

    case 'AC':
      return {
        readonly: {
          // clienteNombre es el campo denormalizado en Project.
          // Se guarda como objeto para mantener compatibilidad con los snapshots
          // bloqueados anteriores que usaban {nombre, contacto, telefono}.
          cliente: { nombre: project.clienteNombre },
          domicilioObra: project.domicilioObra,
          obraEjecutada: ot?.alcance ?? '',
        },
        editable: {},
      };

    case 'FM':
      return {
        readonly: {
          materialInstalado: project.materialInstalado,
          tipoEspacio: project.tipoEspacio,
        },
        editable: {},
      };

    default:
      return { readonly: {}, editable: {} };
  }
}

// Construye el lockedSnapshot al bloquear un documento.
export function buildLockedSnapshot(
  project: Project,
  upstream: Partial<Record<DocType, AnyDoc>>,
  doc: AnyDoc,
): Record<string, unknown> {
  const seed = deriveInherited(project, upstream, doc.docType);
  const { lockedSnapshot: _ls, ...docData } = doc as AnyDoc & { lockedSnapshot: unknown };
  return {
    ...docData,
    ...seed.readonly,
    ...Object.fromEntries(
      Object.entries(seed.editable).map(([k, v]) => {
        const derived = v as Inherited<unknown>;
        const stored = (docData as Record<string, unknown>)[k] as Inherited<unknown> | undefined;
        // Preserve tech overrides: if the field was manually changed, snapshot that value.
        return [k, stored?.overridden ? stored.value : derived.value];
      }),
    ),
  };
}

// Detecta si los campos heredados del documento divergieron respecto al origen actual.
export function detectDrift(
  doc: DocEP,
  project: Project,
  upstream: Partial<Record<DocType, AnyDoc>>,
): DriftReport[] {
  if (doc.status !== 'en_progreso' && doc.status !== 'vacio') return [];
  const reports: DriftReport[] = [];
  const vt = upstream.VT as DocVT | undefined;
  if (!vt) return [];

  // Los campos heredados pueden no estar poblados todavía en un doc recién
  // creado (el doc se inicializa solo con los campos base). En ese caso no hay
  // snapshot de origen contra el cual comparar, así que no hay drift.
  const desnivel = doc.desnivelMm;
  if (desnivel?.source && !desnivel.overridden
    && vt.version !== desnivel.source.version) {
    reports.push({
      field: 'desnivelMm',
      currentValue: desnivel.value,
      originValue: vt.nivelacion?.desnivelMm ?? 0,
      originDoc: 'VT',
    });
  }

  const humedad = doc.humedadPct;
  if (humedad?.source && !humedad.overridden
    && vt.version !== humedad.source.version) {
    reports.push({
      field: 'humedadPct',
      currentValue: humedad.value,
      originValue: vt.humedad?.medicionPct ?? 0,
      originDoc: 'VT',
    });
  }

  return reports;
}

// ── helpers ──────────────────────────────────────────────
function makeInherited<T>(value: T, doc: DocType, field: string, version: number): Inherited<T> {
  return { value, source: { doc, field, version }, overridden: false };
}
