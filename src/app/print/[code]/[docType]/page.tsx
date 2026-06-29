import { notFound } from 'next/navigation';
import PrintDocument from '@/components/print/PrintDocument';
import { DOC_ORDER } from '@/schemas';
import type { DocType } from '@/schemas';

// Página de impresión: sin el shell del panel (no está bajo el grupo (app)).
// Los datos se cargan client-side para aprovechar el caché offline de Firestore.
export default async function PrintPage({
  params,
}: {
  params: Promise<{ code: string; docType: string }>;
}) {
  const { code, docType } = await params;
  if (!DOC_ORDER.includes(docType as DocType)) notFound();
  return <PrintDocument code={code} docType={docType as DocType} />;
}
