'use client';

interface Props {
  state: 'idle' | 'saving' | 'saved' | 'offline' | 'denied' | 'error';
}

export default function SaveIndicator({ state }: Props) {
  if (state === 'idle') return null;

  const map = {
    saving:  { text: 'Guardando',          dot: 'bg-[#B8AEA3] animate-pulse' },
    saved:   { text: 'Guardado',           dot: 'bg-[#C38A5A]' },
    offline: { text: 'Sin conexión · cola', dot: 'bg-amber-500' },
    denied:  { text: 'Permiso denegado',   dot: 'bg-red-500' },
    error:   { text: 'Error al guardar',   dot: 'bg-red-500' },
  } as const;

  const { text, dot } = map[state];

  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-mono font-bold uppercase tracking-[0.16em] text-[#6B6155]">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {text}
    </span>
  );
}
