'use client';

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLS: Record<Variant, string> = {
  primary: 'bg-[#2B2D2F] text-white hover:bg-[#C38A5A]',
  secondary:
    'border border-[rgba(43,45,47,0.15)] text-[#6B6155] hover:border-[#C38A5A]/40 hover:text-[#C38A5A]',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  ghost: 'text-[#6B6155] hover:text-[#C38A5A]',
};

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-3 py-2 text-[10px] min-h-[36px]',
  md: 'px-4 py-2.5 text-[10px] min-h-[44px]',
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 font-bold uppercase tracking-[0.18em] rounded transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
      {...props}
    />
  );
}
