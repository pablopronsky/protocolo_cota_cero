'use client';

import { useState, useEffect } from 'react';
import { getPhotoUrl } from '@/lib/photos';
import type { PhotoRef } from '@/schemas';

interface Props {
  photo: PhotoRef;
  localBlob: string | null;
  onRemove?: () => void;
}

// Muestra una foto: usa localBlob para preview inmediato mientras sube,
// y resuelve la URL de Storage cuando ya está subida (pending:false).
export default function PhotoThumb({ photo, localBlob, onRemove }: Props) {
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

  return (
    <div className="aspect-square rounded overflow-hidden bg-[#B8AEA3]/20 relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[#B8AEA3] font-mono">
          {photo.pending ? 'subiendo…' : 'foto'}
        </div>
      )}
      {photo.pending && (
        <span className="absolute bottom-1 left-1 text-[11px] bg-amber-500 text-white px-1 rounded leading-tight">
          pendiente
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 bg-[#2B2D2F]/65 text-white rounded-full flex items-center justify-center text-[11px] leading-none hover:bg-red-500/80 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
