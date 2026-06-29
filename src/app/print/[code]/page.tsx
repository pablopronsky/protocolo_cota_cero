import PrintLegajo from '@/components/print/PrintLegajo';

// Ruta de impresión del legajo completo: /print/[code]
// Sin shell de panel (no está bajo el grupo (app)).
export default async function PrintLegajoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PrintLegajo code={code} />;
}
