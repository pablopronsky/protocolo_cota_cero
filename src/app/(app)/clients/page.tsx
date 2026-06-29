'use client';

export default function ClientsPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-1">Gestión</p>
        <h1 className="font-bold text-[#2B2D2F] leading-none tracking-tight" style={{ fontSize: 42, letterSpacing: '-0.01em' }}>
          CLIENTES
        </h1>
      </div>
      <div className="mt-12 py-24 border border-dashed border-[#B8AEA3]/25 rounded-lg flex flex-col items-center justify-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#C38A5A]/60">Próximamente</span>
        <p className="text-[13px] text-[#B8AEA3]/60 text-center max-w-xs">
          El módulo de Clientes estará disponible en una próxima versión.
        </p>
      </div>
    </div>
  );
}
