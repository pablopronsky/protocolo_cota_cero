'use client';

interface Props {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-lg shadow-xl border border-[rgba(43,45,47,0.10)] p-6 max-w-sm w-full mx-4">
        <div className="w-10 h-px bg-[#C38A5A] mb-5" />
        <p className="text-[13px] text-[#2B2D2F] leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#B8AEA3] border border-[rgba(43,45,47,0.15)] rounded hover:border-[#C38A5A]/40 hover:text-[#C38A5A] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white bg-[#2B2D2F] rounded hover:bg-[#C38A5A] transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
