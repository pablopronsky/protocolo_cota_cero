import { z } from 'zod';

// Los forms mandan '' para campos opcionales vacíos. Lo normalizamos a undefined
// para que email()/number() no fallen y Firestore (con ignoreUndefinedProperties)
// los omita en vez de guardar cadenas/NaN basura.
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v);

const optionalString = z.preprocess(emptyToUndef, z.string().trim().optional());
const optionalEmail = z.preprocess(emptyToUndef, z.email().optional());
const optionalPositiveNumber = z.preprocess(emptyToUndef, z.coerce.number().positive().optional());

// ── Crear proyecto ────────────────────────────────────────
// Nota: createdBy y responsableComercial NO están acá — los deriva el server
// desde el token verificado. El cliente no puede falsificar autoría.
//
// Flujo de cliente:
//   - clienteId presente  → usar cliente existente de la colección clients.
//   - clienteId ausente   → se crean clienteNombre/Contacto/Telefono requeridos
//     y el server crea el doc en clients antes de crear el proyecto.
export const CreateProjectInput = z.object({
  // Cliente: existente o nuevo
  clienteId:       optionalString,
  clienteNombre:   z.preprocess(emptyToUndef, z.string().trim().min(1).optional()),
  clienteContacto: z.preprocess(emptyToUndef, z.string().trim().min(1).optional()),
  clienteTelefono: z.preprocess(emptyToUndef, z.string().trim().min(1).optional()),
  clienteEmail:    optionalEmail,
  clienteDniCuit:  optionalString,

  calle:      z.string().trim().min(1, 'Calle requerida'),
  numero:     z.string().trim().min(1, 'Número requerido'),
  localidad:  z.string().trim().min(1, 'Localidad requerida'),
  referencia: optionalString,

  tipoEspacio: z.enum(['vivienda', 'local', 'oficina', 'otro']),
  modalidad:   z.enum(['obra_integral', 'solo_mano_de_obra']),

  materialTipo:        z.enum(['laminado', 'spc', 'madera', 'deck', 'revestimiento', 'otro']),
  materialDescripcion: z.string().trim().min(1, 'Descripción del material requerida'),
  materialM2:          optionalPositiveNumber,

  presupuestoRef:     optionalString,
  responsableTecnico: optionalString,
}).superRefine((d, ctx) => {
  // Si no viene un clienteId existente, los tres campos de nuevo cliente son obligatorios.
  if (!d.clienteId) {
    if (!d.clienteNombre)   ctx.addIssue({ code: 'custom', path: ['clienteNombre'],   message: 'Nombre del cliente requerido' });
    if (!d.clienteContacto) ctx.addIssue({ code: 'custom', path: ['clienteContacto'], message: 'Contacto requerido' });
    if (!d.clienteTelefono) ctx.addIssue({ code: 'custom', path: ['clienteTelefono'], message: 'Teléfono requerido' });
  }
});

export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

// ── Duplicar proyecto ─────────────────────────────────────
// La regex valida y sanitiza originCode (evita path traversal en db.doc()).
export const DuplicateProjectInput = z.object({
  originCode: z.string().regex(/^COTA-\d{4}-\d{4}$/, 'Código de proyecto inválido'),
});

export type DuplicateProjectInput = z.infer<typeof DuplicateProjectInput>;

// ── Protocolo: validación al guardar ─────────────────────
// Cada array de checkbox se valida como subconjunto del enum correspondiente.
// Usado por el handler de guardado del editor (Batch B).
import {
  ENCUENTROS_CRITICOS, CONDICIONES_ESPACIO, LIMPIEZA_SOPORTE,
  CONDICIONES_INICIAR, CRITERIOS_TECNICOS, USO_RECOMENDADO, PRECAUCIONES_FM,
} from '@/schemas';

export const ProtocolTemplateInput = z.object({
  VT: z.object({
    encuentrosCriticos: z.enum(ENCUENTROS_CRITICOS).array(),
    condicionesEspacio: z.enum(CONDICIONES_ESPACIO).array(),
  }),
  EP: z.object({
    limpiezaSoporte: z.enum(LIMPIEZA_SOPORTE).array(),
    condicionesParaIniciar: z.enum(CONDICIONES_INICIAR).array(),
  }),
  OT: z.object({
    criteriosTecnicos: z.enum(CRITERIOS_TECNICOS).array(),
    secuenciaEjecucion: z.string().array(),
  }),
  RF: z.object({
    checklistCalidad: z.string().array(),
  }),
  FM: z.object({
    usoRecomendado: z.enum(USO_RECOMENDADO).array(),
    precauciones: z.enum(PRECAUCIONES_FM).array(),
    frecuenciaLimpieza: z.enum(['', 'diaria', 'semanal', 'mensual', 'segun_uso']),
    productosAptos: z.string().array(),
    productosNoAptos: z.string().array(),
  }),
});

export type ProtocolTemplateInput = z.infer<typeof ProtocolTemplateInput>;
