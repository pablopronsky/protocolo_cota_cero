'use client';

import { useState, useEffect } from 'react';
import { getPhotoUrl, type PhotoQueueItem } from '@/lib/photos';
import type { PhotoRef } from '@/schemas';

interface Props {
  photo: PhotoRef;
  localBlob: string | null;
  onRemove?: () => void;
  /** Estado en la cola local. `undefined` = ya no está encolada. */
  queueItem?: PhotoQueueItem;
  onRetry?: () => void;
}

// Muestra una foto: usa localBlob para preview inmediato mientras sube,
// y resuelve la URL de Storage cuando ya está subida (pending:false).
//
// #P1 — `pending` en Firestore no alcanza para decidir qué mostrar: una subida
// rechazada de forma permanente también queda `pending: true`. El estado de la
// cola local (`queueItem`) es el que separa "pendiente" de "error al subir", y
// sin él una foto fallada se vería igual que una en camino.
export default function PhotoThumb({ photo, localBlob, onRemove, queueItem, onRetry }: Props) {
  const [url, setUrl] = useState<string | null>(localBlob);

  useEffect(() => {
    if (localBlob) {
      setUrl(localBlob);
      return;
    }
    if (!photo.pending && photo.storagePath) {
      getPhotoUrl(photo.storagePath).then(setUrl).catch(() => {});
    }
  }, [localBlob, photo.pending, photo.storagePath]);

  const failed = queueItem?.state === 'error';
  const pending = photo.pending && !failed;

  return (
    <div className="aspect-square rounded overflow-hidden bg-[#B8AEA3]/20 relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={photo.caption ?? 'Foto de obra'}
          className={`w-full h-full object-cover ${failed ? 'opacity-50' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[#6B6155] font-mono">
          {failed ? 'error' : photo.pending ? 'subiendo…' : 'foto'}
        </div>
      )}

      {failed && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white px-1.5 py-1 space-y-1">
          <p className="text-[10px] leading-tight font-semibold">Error al subir</p>
          {queueItem?.message && (
            <p className="text-[9px] leading-tight">{queueItem.message}</p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] underline font-semibold"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {pending && (
        <span className="absolute bottom-1 left-1 text-[11px] bg-amber-500 text-white px-1 rounded leading-tight">
          pendiente
        </span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Eliminar foto"
          className="absolute top-1 right-1 w-5 h-5 bg-[#2B2D2F]/65 text-white rounded-full flex items-center justify-center text-[11px] leading-none hover:bg-red-500/80 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
