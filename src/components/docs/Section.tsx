export function Section({ id, title, children }: {
  id?: string; title: string; children: React.ReactNode;
}) {
  return (
    <div id={id} className="doc-section rounded-lg overflow-hidden border border-[rgba(43,45,47,0.10)] scroll-mt-20">
      <div className="px-4 py-2.5" style={{ background: '#7B4A28' }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
          | {title}
        </span>
      </div>
      <div className="px-4 pb-4 pt-3 space-y-3 bg-white border-t border-[rgba(43,45,47,0.06)]">
        {children}
      </div>
    </div>
  );
}
