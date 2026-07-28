import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acta de conformidad · COTA CERO',
  description: 'Revisá y firmá el acta de conformidad de tu obra con COTA CERO.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Acta de conformidad · COTA CERO',
    description: 'Revisá el trabajo realizado y firmá el acta desde tu celular.',
    type: 'website',
    siteName: 'COTA CERO',
  },
};

export default function FirmarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
