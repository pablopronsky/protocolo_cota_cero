import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="py-16 px-6 text-center border border-dashed border-[#B8AEA3]/30 rounded-lg flex flex-col items-center gap-3">
      {icon && <div className="text-[#B8AEA3]">{icon}</div>}
      <p className="text-[14px] font-bold text-[#2B2D2F]">{title}</p>
      {description && <p className="text-[13px] text-[#6B6155] max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
