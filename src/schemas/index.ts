// ── Aliases ──────────────────────────────────────────────
export type UID = string;
export type ISODate = string;
export type Millis = number;
export type ProjectCode = string;

// ── Status ───────────────────────────────────────────────
export type ProjectStatus = 'borrador' | 'en_curso' | 'entregado' | 'archivado';
export type DocStatus = 'vacio' | 'en_progreso' | 'completo' | 'firmado';
export type DocType = 'VT' | 'EP' | 'OT' | 'RF' | 'AC' | 'FM';

// ── Photo ─────────────────────────────────────────────────
export interface PhotoRef {
  id: string;
  storagePath: string;
  caption?: string;
  takenAt: Millis;
  uploadedBy: UID;
  pending?: boolean; // true = encolada offline, no subida aún
  localBlob?: string; // object URL local mientras está pendiente
}

// ── Inherited wrapper ─────────────────────────────────────
export interface Inherited<T> {
  value: T;
  source: { doc: DocType | 'PROJECT'; field: string; version: number };
  overridden: boolean;
}

// ── Client ────────────────────────────────────────────────
export interface Client {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email?: string;
  dni_cuit?: string;
  createdAt: Millis;
  updatedAt: Millis;
}

// ── Project ───────────────────────────────────────────────
export interface Project {
  code: ProjectCode;
  year: number;
  seq: number;
  // clienteId apunta a la colección clients. clienteNombre es denormalizado
  // para mostrar en listas y prints sin una lectura extra.
  clienteId: string;
  clienteNombre: string;
  domicilioObra: {
    calle: string;
    numero: string;
    localidad: string;
    referencia?: string;
  };
  tipoEspacio: 'vivienda' | 'local' | 'oficina' | 'otro';
  modalidad: 'obra_integral' | 'solo_mano_de_obra';
  materialInstalado: {
    tipo: 'laminado' | 'spc' | 'madera' | 'deck' | 'revestimiento' | 'otro';
    descripcion: string;
    m2Estimados?: number;
  };
  presupuestoRef?: string;
  status: ProjectStatus;
  docStatus: Record<DocType, DocStatus>;
  responsableComercial: UID;
  responsableTecnico: UID;
  createdAt: Millis;
  createdBy: UID;
  updatedAt: Millis;
  updatedBy: UID;
  duplicatedFrom?: ProjectCode;
}

// ── DocBase ───────────────────────────────────────────────
export interface DocBase {
  docType: DocType;
  projectCode: ProjectCode;
  status: DocStatus;
  lockedSnapshot: Record<string, unknown> | null;
  lockedAt: Millis | null;
  lockedBy: UID | null;
  createdAt: Millis;
  updatedAt: Millis;
  updatedBy: UID;
  version: number;
}

// ── VT ────────────────────────────────────────────────────
export interface DocVT extends DocBase {
  docType: 'VT';
  fechaVisita: ISODate;
  tecnico: UID;
  ambientes: Array<{
    nombre: string;
    m2: number;
    zocaloMl?: number; // metros lineales de zócalo
    varillas?: Array<{ tipo: string; tamano: string }>;
    observacion?: string;
  }>;
  m2Total: number;
  estadoSoporte: 'bueno' | 'regular' | 'malo' | '';
  materialSoporte: 'carpeta' | 'contrapiso' | 'ceramico' | 'madera' | 'otro' | '';
  humedad: { medicionPct: number; metodo: 'higrometro' | 'film' | 'otro' | ''; apto: boolean };
  nivelacion: { desnivelMm: number; apto: boolean };
  encuentrosCriticos: string[];
  condicionesEspacio: string[];
  registroFotografico: PhotoRef[];
  dictamen: 'apto' | 'apto_con_preparacion' | 'no_apto' | '';
  dictamenDetalle: string;
  observaciones: string;
}

// ── EP ────────────────────────────────────────────────────
export interface DocEP extends DocBase {
  docType: 'EP';
  desnivelMm: Inherited<number>;
  humedadPct: Inherited<number>;
  requiereNivelacion: boolean;
  metodoNivelacion?: 'autonivelante' | 'mortero' | 'lijado' | '';
  espesorMm?: number;
  tratamientoHumedad: boolean;
  barreraVapor?: 'polietileno' | 'imprimacion_epoxi' | 'otro' | '';
  requiereImprimacion: boolean;
  productoImprimacion?: string;
  limpiezaSoporte: string[];
  reparacionesPrevias: Array<{ zona: string; accion: string; producto?: string }>;
  condicionesParaIniciar: string[];
  tiemposSecadoEstimados?: string;
  observaciones: string;
}

// ── OT ────────────────────────────────────────────────────
export interface DocOT extends DocBase {
  docType: 'OT';
  equipo: Array<{ uid?: UID; nombre: string; rol: string }>;
  fechaInicio: ISODate;
  fechaFinEstimada: ISODate;
  alcance: string;
  secuenciaEjecucion: Array<{
    paso: number;
    descripcion: string;
    criterio?: string;
    responsable?: string;
    completado: boolean;
  }>;
  criteriosTecnicos: string[];
  materialesHerramientas: Array<{
    item: string;
    cantidad: number;
    provistoPor: 'cota_cero' | 'cliente';
  }>;
  registroIncidencias: Array<{
    fecha: ISODate;
    descripcion: string;
    accion: string;
    resuelto: boolean;
  }>;
  observaciones: string;
}

// ── RF ────────────────────────────────────────────────────
export interface DocRF extends DocBase {
  docType: 'RF';
  cumpleEP: 'si' | 'no' | 'parcial' | '';
  desviosEP?: string;
  cumpleOT: 'si' | 'no' | 'parcial' | '';
  desviosOT?: string;
  checklistCalidad: Array<{
    item: string;
    estado: 'ok' | 'observado' | 'rehacer' | '';
    nota?: string;
  }>;
  registroFotografico: PhotoRef[];
  observaciones: string;
  aptoEntrega: boolean;
  revisadoPor: UID;
  fechaRevision: ISODate;
}

// ── AC ────────────────────────────────────────────────────
export interface DocAC extends DocBase {
  docType: 'AC';
  fechaActa: ISODate;
  conformidad: 'conforme' | 'conforme_con_observaciones' | 'no_conforme' | '';
  observacionesCliente: string;
  firmaCliente: { nombreAclaratorio: string; dni: string; firma: PhotoRef | null };
  firmaCotaCero: { uid: UID; firma: PhotoRef | null };
}

// ── FM ────────────────────────────────────────────────────
export interface DocFM extends DocBase {
  docType: 'FM';
  usoRecomendado: string[];
  productosAptos: string[];
  productosNoAptos: string[];
  frecuenciaLimpieza: 'diaria' | 'semanal' | 'mensual' | 'segun_uso' | '';
  precauciones: string[];
  recomendaciones: string;
  observaciones: string;
}

// ── Union ─────────────────────────────────────────────────
export type AnyDoc = DocVT | DocEP | DocOT | DocRF | DocAC | DocFM;

// ── User ──────────────────────────────────────────────────
export interface AppUser {
  uid: UID;
  nombre: string;
  email: string;
  role: 'admin' | 'tecnico';
  activo: boolean;
}

// ── Opciones cerradas ─────────────────────────────────────
export const ENCUENTROS_CRITICOS = [
  'puertas', 'escaleras', 'juntas_dilatacion', 'desagues', 'zocalos',
  'columnas', 'arcos', 'umbrales',
] as const;

export const CONDICIONES_ESPACIO = [
  'habitado', 'electricidad', 'agua', 'acceso', 'ventilacion',
] as const;

export const LIMPIEZA_SOPORTE = [
  'barrido', 'aspirado', 'removedor_grasa', 'neutralizante', 'secado',
] as const;

export const CONDICIONES_INICIAR = [
  'soporte_seco', 'nivelacion_lista', 'imprimacion_curada',
  'ambiente_limpio', 'herramientas_listas', 'material_en_obra',
] as const;

export const CRITERIOS_TECNICOS = [
  'aclimatacion_material', 'expansion_perimetral', 'union_correcta',
  'pegamento_homologado', 'zocalos_post_instalacion', 'limpieza_final',
] as const;

export const USO_RECOMENDADO = [
  'trafico_moderado', 'evitar_agua_estancada', 'alfombras_antihumedad',
  'protectores_muebles', 'temperatura_estable',
] as const;

export const PRECAUCIONES_FM = [
  'no_mojar_exceso', 'evitar_puntos_calor', 'no_arrastrar_muebles',
  'no_usar_abrasivos', 'ventilar_regularmente',
] as const;

// Defaults por tipo de material instalado. Se aplican al crear un FM vacío.
// El técnico puede editar todos los campos luego.
export type TipoMaterial = Project['materialInstalado']['tipo'];

interface FMDefaults {
  usoRecomendado: string[];
  precauciones: string[];
  frecuenciaLimpieza: 'diaria' | 'semanal' | 'mensual' | 'segun_uso' | '';
  productosAptos: string[];
  productosNoAptos: string[];
  recomendaciones: string;
}

export const FM_DEFAULTS_BY_TIPO: Record<TipoMaterial, FMDefaults> = {
  laminado: {
    usoRecomendado: ['trafico_moderado', 'evitar_agua_estancada', 'alfombras_antihumedad', 'protectores_muebles', 'temperatura_estable'],
    precauciones: ['no_mojar_exceso', 'no_arrastrar_muebles', 'no_usar_abrasivos', 'evitar_puntos_calor'],
    frecuenciaLimpieza: 'semanal',
    productosAptos: [
      'Limpiador neutro pH 7 diluido en agua',
      'Bona Floor Cleaner',
      'Paño de microfibra húmedo (bien escurrido)',
    ],
    productosNoAptos: [
      'Lavandina / lejía',
      'Amoniaco',
      'Cera para pisos',
      'Jabón comun',
      'Máquina de vapor',
      'Fregona empapada',
    ],
    recomendaciones:
      'Usar solo paño húmedo bien escurrido: el exceso de agua levanta las juntas y arruina el piso. ' +
      'Nunca usar máquina de vapor (Swiffer Wet Jet y similares). ' +
      'Colocar alfombras antihumedad en accesos al exterior. ' +
      'No usar alfombras de goma directamente sobre el piso (pueden decolorarlo). ' +
      'El laminado NO es apto para baños ni lavanderías.',
  },
  spc: {
    usoRecomendado: ['trafico_moderado', 'evitar_agua_estancada', 'protectores_muebles', 'temperatura_estable'],
    precauciones: ['no_arrastrar_muebles', 'no_usar_abrasivos', 'evitar_puntos_calor'],
    frecuenciaLimpieza: 'segun_uso',
    productosAptos: [
      'Agua con detergente neutro',
      'Limpiador para pisos vinílicos / SPC',
      'Paño de microfibra',
    ],
    productosNoAptos: [
      'Solventes (acetona, thinner)',
      'Abrasivos fuertes',
      'Limpiadores con amoniaco',
      'Disolventes',
    ],
    recomendaciones:
      'El SPC es resistente al agua pero no sumergible: evitar agua estancada prolongada en juntas. ' +
      'Proteger patas de muebles con feltros o topes de goma. ' +
      'No usar cortafrío ni herramientas cortantes cerca de las juntas. ' +
      'Evitar exposición directa y prolongada al sol sin protección UV (puede blanquear el color).',
  },
  madera: {
    usoRecomendado: ['trafico_moderado', 'evitar_agua_estancada', 'alfombras_antihumedad', 'protectores_muebles', 'temperatura_estable'],
    precauciones: ['no_mojar_exceso', 'no_arrastrar_muebles', 'no_usar_abrasivos', 'evitar_puntos_calor', 'ventilar_regularmente'],
    frecuenciaLimpieza: 'semanal',
    productosAptos: [
      'Bona Wood Floor Cleaner',
      'Limpiador específico para madera laqueada o aceitada',
      'Paño de microfibra casi seco',
    ],
    productosNoAptos: [
      'Agua en exceso',
      'Vinagre',
      'Amoniaco',
      'Lavandina',
      'Aceites de cocina',
      'Limpiadores multiusos',
      'Máquina de vapor',
      'Cera (en pisos laqueados)',
    ],
    recomendaciones:
      'La madera es sensible a la humedad y los cambios de temperatura. ' +
      'Mantener humedad relativa ambiente entre 45-65% y temperatura estable. ' +
      'Relaqueado o reaceitado periódico según desgaste (orientativo: cada 3-5 años en zonas de tráfico intenso). ' +
      'Evitar tacos de aguja y ruedas de silla sin protector. ' +
      'No usar alfombras de goma directamente sobre el piso (pueden decolorarlo).',
  },
  deck: {
    usoRecomendado: ['trafico_moderado', 'protectores_muebles'],
    precauciones: ['no_usar_abrasivos', 'no_mojar_exceso'],
    frecuenciaLimpieza: 'mensual',
    productosAptos: [
      'Agua + jabón neutro',
      'Limpiador específico para deck WPC',
      'Cepillo de cerdas suaves',
    ],
    productosNoAptos: [
      'Lavandina concentrada',
      'Solventes',
      'Hidrolavadora a alta presión (> 80 bar)',
      'Abrasivos metálicos',
    ],
    recomendaciones:
      'Limpiar con agua y jabón neutro usando cepillo de cerdas suaves. ' +
      'No obstruir las ranuras de drenaje del deck. ' +
      'Para deck de madera natural: aplicar aceite para exterior cada año o cuando el agua deje de perlar sobre la superficie. ' +
      'En invierno retirar o cubrir los muebles para prolongar la vida útil del producto.',
  },
  revestimiento: {
    usoRecomendado: ['trafico_moderado', 'temperatura_estable'],
    precauciones: ['no_usar_abrasivos', 'no_mojar_exceso'],
    frecuenciaLimpieza: 'semanal',
    productosAptos: [
      'Limpiador neutro diluido en agua',
      'Agua jabonosa suave',
      'Paño de microfibra húmedo',
      'Alcohol isopropílico 70% para manchas puntuales',
    ],
    productosNoAptos: [
      'Abrasivos (virutilla, esponja metálica)',
      'Solventes (acetona, thinner)',
      'Limpiadores ácidos',
    ],
    recomendaciones:
      'Limpiar con paño húmedo sin presión excesiva. ' +
      'Para manchas difíciles usar alcohol isopropílico 70% con paño suave en pequeñas cantidades. ' +
      'No perforar ni golpear sin asistencia técnica. ' +
      'En zonas húmedas (baños, cocinas): verificar el sellado de juntas perimetrales una vez al año.',
  },
  otro: {
    usoRecomendado: ['trafico_moderado', 'protectores_muebles'],
    precauciones: ['no_mojar_exceso', 'no_arrastrar_muebles', 'no_usar_abrasivos'],
    frecuenciaLimpieza: 'segun_uso',
    productosAptos: [
      'Limpiador neutro diluido en agua',
      'Paño de microfibra',
    ],
    productosNoAptos: [
      'Abrasivos',
      'Solventes',
      'Lavandina concentrada',
    ],
    recomendaciones:
      'Consultar con COTA·CERO para instrucciones específicas según el material instalado.',
  },
};

// ── Protocolo: plantilla de valores por defecto ───────────
// Cada campo es un subconjunto de la lista cerrada correspondiente, salvo los
// de texto libre (productos, secuencia, checklist) que son string[] sembrados
// como líneas. AC no tiene defaults.
export interface ProtocolTemplate {
  VT: {
    encuentrosCriticos: string[];     // ⊆ ENCUENTROS_CRITICOS
    condicionesEspacio: string[];     // ⊆ CONDICIONES_ESPACIO
  };
  EP: {
    limpiezaSoporte: string[];        // ⊆ LIMPIEZA_SOPORTE
    condicionesParaIniciar: string[]; // ⊆ CONDICIONES_INICIAR
  };
  OT: {
    criteriosTecnicos: string[];      // ⊆ CRITERIOS_TECNICOS
    secuenciaEjecucion: string[];     // descripciones de pasos (texto libre)
  };
  RF: {
    checklistCalidad: string[];       // labels de ítems de checklist (texto libre)
  };
  FM: {
    usoRecomendado: string[];         // ⊆ USO_RECOMENDADO
    precauciones: string[];           // ⊆ PRECAUCIONES_FM
    frecuenciaLimpieza: '' | 'diaria' | 'semanal' | 'mensual' | 'segun_uso';
    productosAptos: string[];
    productosNoAptos: string[];
  };
  updatedAt: number;
  updatedBy: UID;
}

export const DOC_LABELS: Record<DocType, string> = {
  VT: 'Visita Técnica',
  EP: 'Especificación de Preparación',
  OT: 'Orden de Trabajo',
  RF: 'Revisión Final',
  AC: 'Acta de Conformidad',
  FM: 'Ficha de Mantenimiento',
};

export const DOC_ORDER: DocType[] = ['VT', 'EP', 'OT', 'RF', 'AC', 'FM'];
