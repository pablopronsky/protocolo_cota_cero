'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  // Se llama cuando el usuario toca "Guardar firma": entrega un JPEG con fondo
  // blanco listo para enqueueSignature (mismo contrato que un <input file>).
  onSave: (file: File) => void;
  saved?: boolean;
  disabled?: boolean;
}

// Lienzo de firma a dedo/stylus. Pensado para mobile: sin papel, se firma en
// pantalla y se exporta como imagen. Fondo blanco para que la firma se vea
// igual en pantalla y en el PDF impreso.
export default function SignaturePad({ onSave, saved, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function prime(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1A1B1D';
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) prime(ctx, canvas.width, canvas.height);
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) prime(ctx, canvas.width, canvas.height);
    setHasInk(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onSave(new File([blob], 'firma.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-md border border-[#2A2A2A] bg-white"
        style={{ touchAction: 'none', aspectRatio: '640 / 220' }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B8AEA3] disabled:opacity-40"
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={disabled || !hasInk}
          className="text-[11px] font-bold uppercase tracking-[0.2em] text-white rounded-md px-4 py-2 disabled:opacity-40 transition-colors"
          style={{ background: '#C38A5A' }}
        >
          {saved ? '✓ Firma guardada · Re-firmar' : 'Guardar firma'}
        </button>
        <span className="text-[11px] text-[#B8AEA3]/70">Firmá con el dedo</span>
      </div>
    </div>
  );
}
