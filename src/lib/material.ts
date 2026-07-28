// Convierte abreviaturas de proveedor a una especificación clara para las
// piezas que ve el cliente, sin alterar el dato técnico guardado en el legajo.
export function formatMaterialForClient(description: string): string {
  return description
    .replace(/\.\s*5\s*mm\s*WL\s*0[.,]5\b/i, ' · 5 mm · capa de uso 0,5 mm')
    .replace(/\b5\s*mm\b/gi, '5 mm')
    .replace(/\bWL\s*0[.,]5\b/i, 'capa de uso 0,5 mm')
    .trim();
}
