'use client';

import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel, danger }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={message}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-lg shadow-xl border border-[rgba(43,45,47,0.10)] p-6 max-w-sm w-full mx-4">
        <div className={`w-10 h-px mb-5 ${danger ? 'bg-red-500' : 'bg-[#C38A5A]'}`} />
        <p className="text-[13px] text-[#2B2D2F] leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2.5 min-h-[44px] text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B6155] border border-[rgba(43,45,47,0.15)] rounded hover:border-[#C38A5A]/40 hover:text-[#C38A5A] transition-colors"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2.5 min-h-[44px] text-[10px] font-bold uppercase tracking-[0.18em] text-white rounded transition-colors ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#2B2D2F] hover:bg-[#C38A5A]'
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
