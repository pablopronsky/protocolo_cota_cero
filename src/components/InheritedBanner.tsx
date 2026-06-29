'use client';

import type { DriftReport } from '@/lib/inheritance';

interface Props {
  drifts: DriftReport[];
  onReimport: () => void;
}

export default function InheritedBanner({ drifts, onReimport }: Props) {
  if (drifts.length === 0) return null;

  return (
    <div className="flex items-start gap-3 border border-[#C38A5A]/30 bg-[#C38A5A]/[0.04] rounded-md px-4 py-3">
      {/* Copper left accent bar */}
      <div className="w-0.5 self-stretch bg-[#C38A5A] shrink-0 rounded-full" />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold uppercase tracking-[0.18em] text-[#2B2D2F]">
          Origen actualizado
        </p>
        <ul className="mt-1.5 space-y-1">
          {drifts.map((d) => (
            <li key={d.field} className="text-xs text-[#56514D]">
              <span className="font-mono text-[#2B2D2F]">{d.field}</span>
              {': '}valor actual{' '}
              <span className="font-mono">{String(d.currentValue)}</span>
              {' → '}origen{' '}
              <span className="font-mono">{String(d.originValue)}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={onReimport}
        className="shrink-0 text-[15px] font-bold uppercase tracking-[0.14em] text-[#C38A5A] hover:text-[#2B2D2F] transition-colors whitespace-nowrap"
      >
        Re-importar
      </button>
    </div>
  );
}
