import type { ProtocolTemplate, DocType } from '@/schemas';

// Un campo del template dejado en blanco significa "sin default configurado":
// no debe entrar al seed, porque pisaría otros defaults con menor prioridad
// (p. ej. FM_DEFAULTS_BY_TIPO por material instalado).
function nonEmpty(xs: string[] | undefined): string[] | undefined {
  return xs && xs.length > 0 ? xs : undefined;
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Campos que el template siembra para un docType, listos para mezclar en los
// defaultValues de RHF. Devuelve {} si no hay template (→ comportamiento actual).
// Solo incluye campos con contenido configurado.
export function templateSeedFor(
  docType: DocType,
  template: ProtocolTemplate | null,
): Record<string, unknown> {
  if (!template) return {};
  switch (docType) {
    case 'VT':
      return compact({
        encuentrosCriticos: nonEmpty(template.VT?.encuentrosCriticos),
        condicionesEspacio: nonEmpty(template.VT?.condicionesEspacio),
      });
    case 'EP':
      return compact({
        limpiezaSoporte: nonEmpty(template.EP?.limpiezaSoporte),
        condicionesParaIniciar: nonEmpty(template.EP?.condicionesParaIniciar),
      });
    case 'OT':
      return compact({
        criteriosTecnicos: nonEmpty(template.OT?.criteriosTecnicos),
        secuenciaEjecucion: nonEmpty(template.OT?.secuenciaEjecucion)?.map((descripcion, i) => ({
          paso: i + 1, descripcion, completado: false,
        })),
      });
    case 'RF':
      return compact({
        checklistCalidad: nonEmpty(template.RF?.checklistCalidad)?.map((item) => ({
          item, estado: '',
        })),
      });
    case 'FM':
      return compact({
        usoRecomendado: nonEmpty(template.FM?.usoRecomendado),
        precauciones: nonEmpty(template.FM?.precauciones),
        frecuenciaLimpieza: template.FM?.frecuenciaLimpieza || undefined,
        productosAptos: nonEmpty(template.FM?.productosAptos),
        productosNoAptos: nonEmpty(template.FM?.productosNoAptos),
      });
    default:
      return {};
  }
}
