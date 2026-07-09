// #17 — Barra de acción flotante, pegada al fondo mientras se scrollea el
// formulario. Cada form le pasa sus propios botones/errores como children.
export function DocActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 pt-4 -mb-2 no-print pointer-events-none">
      <div className="bg-white rounded-lg border border-[rgba(43,45,47,0.12)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] p-3 space-y-2 pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
