import type { ReactNode } from 'react';

type Tone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger';

const TONE_CLS: Record<Tone, string> = {
  neutral: 'bg-[#F0EDE7] text-[#6B6155]',
  copper: 'bg-[#C38A5A]/15 text-[#7B4A28]',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap ${TONE_CLS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
