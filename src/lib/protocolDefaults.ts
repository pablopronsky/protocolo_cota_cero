import type { ProtocolTemplate, DocType } from '@/schemas';

// Campos que el template siembra para un docType, listos para mezclar en los
// defaultValues de RHF. Devuelve {} si no hay template (→ comportamiento actual).
export function templateSeedFor(
  docType: DocType,
  template: ProtocolTemplate | null,
): Record<string, unknown> {
  if (!template) return {};
  switch (docType) {
    case 'VT':
      return {
        encuentrosCriticos: template.VT?.encuentrosCriticos ?? [],
        condicionesEspacio: template.VT?.condicionesEspacio ?? [],
      };
    case 'EP':
      return {
        limpiezaSoporte: template.EP?.limpiezaSoporte ?? [],
        condicionesParaIniciar: template.EP?.condicionesParaIniciar ?? [],
      };
    case 'OT':
      return {
        criteriosTecnicos: template.OT?.criteriosTecnicos ?? [],
        secuenciaEjecucion: (template.OT?.secuenciaEjecucion ?? []).map((descripcion, i) => ({
          paso: i + 1, descripcion, completado: false,
        })),
      };
    case 'RF':
      return {
        checklistCalidad: (template.RF?.checklistCalidad ?? []).map((item) => ({
          item, estado: '',
        })),
      };
    case 'FM':
      return {
        usoRecomendado: template.FM?.usoRecomendado ?? [],
        precauciones: template.FM?.precauciones ?? [],
        frecuenciaLimpieza: template.FM?.frecuenciaLimpieza ?? '',
        productosAptos: template.FM?.productosAptos ?? [],
        productosNoAptos: template.FM?.productosNoAptos ?? [],
      };
    default:
      return {};
  }
}
