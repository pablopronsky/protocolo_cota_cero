'use client';

import { useEffect, useState } from 'react';
import { subscribePhotoQueue, type PhotoQueueSnapshot } from './photos';

// #P1 — El estado real de una subida vive en IndexedDB, no en Firestore.
//
// Firestore solo distingue `pending: true/false`. Si Storage rechaza la imagen
// de forma permanente, el ref se queda en `pending: true` y sin este hook la UI
// no tiene manera de diferenciar "todavía subiendo" de "nunca va a subir". Los
// formularios lo cruzan con `registroFotografico` por `PhotoRef.id`.
export function usePhotoQueue(): PhotoQueueSnapshot {
  const [snapshot, setSnapshot] = useState<PhotoQueueSnapshot>(() => new Map());

  useEffect(() => subscribePhotoQueue(setSnapshot), []);

  return snapshot;
}
