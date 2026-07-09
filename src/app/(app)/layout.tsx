'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, logout } from '@/hooks/useAuth';
import { initPhotoQueueListener } from '@/lib/photos';
import Logo from '@/components/Logo';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SaveStatusProvider, useSaveStatusContext } from '@/contexts/SaveStatusContext';
import { ToastProvider } from '@/contexts/ToastContext';
import SaveIndicator from '@/components/SaveIndicator';

const APP_VERSION = '2.6.0';

const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

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
  const cls = `flex items-center gap-2.5 px-3 min-h-[44px] rounded-sm text-[11px] font-bold uppercase tracking-wide transition-colors duration-150 ${
    disabled
      ? 'text-[#8C8275] pointer-events-none'
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

function HeaderSaveStatus() {
  const ctx = useSaveStatusContext();
  if (!ctx) return null;
  return <SaveIndicator state={!ctx.online ? 'offline' : ctx.docState} />;
}

// #27 — Avisa antes de cerrar/recargar si hay un guardado en curso (ventana del
// debounce de autosave + la escritura misma). No cubre navegación in-app: los
// forms cancelan el autosave pendiente antes de bloquear/firmar, que es el único
// flujo que fuerza una navegación propia.
function UnsavedChangesGuard() {
  const ctx = useSaveStatusContext();
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (ctx?.docState === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [ctx?.docState]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const cleanup = initPhotoQueueListener();
    return cleanup;
  }, []);

  // Cierra el drawer mobile al navegar.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Cierra el drawer con Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

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
    <SaveStatusProvider>
    <ToastProvider>
    <UnsavedChangesGuard />
    <div className="min-h-dvh flex bg-[#F5F2ED]">
      {/* ── Overlay (mobile drawer) ────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar / drawer ───────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[188px] shrink-0 bg-[#1A1B1D] flex flex-col h-dvh transform transition-transform duration-200 lg:translate-x-0 lg:sticky lg:top-0 lg:z-10 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 pt-5 pb-5 border-b border-white/[0.06]">
          <Link href="/projects" className="block" onClick={() => setDrawerOpen(false)}>
            <span className="text-[#F5F2ED]">
              <Logo size="sm" />
            </span>
          </Link>
          <button
            type="button"
            className="lg:hidden text-[#B8AEA3] hover:text-[#F5F2ED] p-1"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
          >
            <IconClose />
          </button>
        </div>

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
            className="font-bold uppercase text-[#D9D2C8] leading-[1.7]"
            style={{ fontSize: 9, letterSpacing: '0.22em' }}
          >
            Protocolo<br />de Obra
          </p>
          <p
            className="mt-1.5 font-mono text-[#D9D2C8]/85 uppercase tracking-widest"
            style={{ fontSize: 9 }}
          >
            Versión {APP_VERSION}
          </p>
        </div>
      </aside>

      {/* ── Content pane ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-11 px-4 lg:px-8 flex items-center gap-3 lg:gap-6 border-b border-[rgba(43,45,47,0.08)] shrink-0 bg-[#F5F2ED]">
          <button
            type="button"
            className="lg:hidden text-[#2B2D2F] p-1 -ml-1"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            <IconMenu />
          </button>
          <span className="lg:hidden text-[#2B2D2F]">
            <Logo size="xs" />
          </span>
          <div className="flex-1 hidden md:flex justify-center px-2">
            <div className="w-full max-w-[280px]">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex-1 md:hidden" />
          <HeaderSaveStatus />
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2B2D2F]/80">
            {displayName}
          </span>
          <button
            onClick={() => logout().then(() => router.replace('/login'))}
            className="inline-flex items-center h-full px-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B6155] hover:text-[#2B2D2F] transition-colors cursor-pointer"
          >
            Salir
          </button>
        </header>

        {/* Page */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
    </SaveStatusProvider>
  );
}
