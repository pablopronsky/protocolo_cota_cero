import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'COTA CERO · Gestión de Obra',
  description: 'Sistema de documentación de obra — COTA CERO',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
