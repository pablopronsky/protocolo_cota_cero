'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, logout } from '@/hooks/useAuth';
import { initPhotoQueueListener } from '@/lib/photos';
import Logo from '@/components/Logo';

const APP_VERSION = '2.6.0';

/* ── Sidebar icons ──────────────────────────────────────── */
const IconPrincipio = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 3h12M2 6h8M2 9h10M2 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IconProyectos = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IconClientes = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconPresupuesto = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconAjustes = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconChevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ── Nav item ────────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon,
  active,
  disabled,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
}) {
  const cls = `flex items-center gap-2.5 px-3 py-2 rounded-sm text-[11px] font-bold uppercase tracking-wide transition-colors duration-150 ${
    disabled
      ? 'text-[#B8AEA3]/60 pointer-events-none'
      : active
      ? 'text-[#C38A5A]'
      : 'text-[#B8AEA3] hover:text-[#F5F2ED]'
  }`;
  if (disabled) return <span className={cls}>{icon}{label}</span>;
  return (
    <Link href={href} className={cls}>
      {icon}
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const cleanup = initPhotoQueueListener();
    return cleanup;
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F2ED]">
        <span className="text-[#2B2D2F]"><Logo size="sm" /></span>
      </div>
    );
  }

  const displayName = (
    user.displayName || user.email?.split('@')[0] || 'Usuario'
  ).toUpperCase();

  return (
    <div className="min-h-dvh flex bg-[#F5F2ED]">
      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className="w-[188px] shrink-0 bg-[#1A1B1D] flex flex-col sticky top-0 h-dvh z-10">
        {/* Logo */}
        <Link
          href="/projects"
          className="block px-5 pt-5 pb-5 border-b border-white/[0.06]"
        >
          <span className="text-[#F5F2ED]">
            <Logo size="sm" />
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 pt-6 flex flex-col gap-0.5 px-2">
          {role === 'admin' && (
            <NavItem
              href="/protocol"
              label="Protocolo"
              icon={<IconPrincipio />}
              active={pathname.startsWith('/protocol')}
            />
          )}
          <NavItem
            href="/projects"
            label="Proyectos"
            icon={<IconProyectos />}
            active={pathname.startsWith('/projects')}
          />
          <NavItem
            href="/clients"
            label="Clientes"
            icon={<IconClientes />}
            active={pathname.startsWith('/clients')}
          />
          <NavItem
            href="/budgets"
            label="Presupuestos"
            icon={<IconPresupuesto />}
            active={pathname.startsWith('/budgets')}
            disabled
          />
          <NavItem
            href="/settings"
            label="Ajustes"
            icon={<IconAjustes />}
            active={pathname === '/settings'}
          />
        </nav>

        {/* Bottom stamp */}
        <div className="px-5 py-5 border-t border-white/[0.05]">
          <div className="w-6 h-px bg-[#C38A5A]/40 mb-3" />
          <p
            className="font-bold uppercase text-[#B8AEA3]/80 leading-[1.7]"
            style={{ fontSize: 9, letterSpacing: '0.22em' }}
          >
            Protocolo<br />de Obra
          </p>
          <p
            className="mt-1.5 font-mono text-[#B8AEA3]/70 uppercase tracking-widest"
            style={{ fontSize: 9 }}
          >
            Versión {APP_VERSION}
          </p>
        </div>
      </aside>

      {/* ── Content pane ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-11 px-8 flex items-center justify-end gap-6 border-b border-[rgba(43,45,47,0.08)] shrink-0 bg-[#F5F2ED]">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2B2D2F]/80">
            {displayName}
          </span>
          <button
            onClick={() => logout().then(() => router.replace('/login'))}
            className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B6155] hover:text-[#2B2D2F] transition-colors cursor-pointer"
          >
            Salir
          </button>
        </header>

        {/* Page */}
        <main className="flex-1 px-8 py-8 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
