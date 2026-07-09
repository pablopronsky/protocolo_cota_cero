import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-white rounded-lg border border-[rgba(43,45,47,0.10)] p-4 ${className}`}>
      {children}
    </div>
  );
}
