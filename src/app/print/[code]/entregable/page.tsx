import PrintEntregable from '@/components/print/PrintEntregable';

// Ruta del entregable del cliente: /print/[code]/entregable
// Sin shell de panel (no está bajo el grupo (app)).
export default async function PrintEntregablePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PrintEntregable code={code} />;
}
