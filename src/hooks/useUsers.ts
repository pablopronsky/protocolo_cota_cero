'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import type { AppUser } from '@/schemas';

export function useUsers(): AppUser[] {
  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    let active = true;
    const db = getFirebaseDb();
    getDocs(query(collection(db, 'users'), where('activo', '==', true)))
      .then((snap) => {
        if (active) setUsers(snap.docs.map((d) => d.data() as AppUser));
      })
      .catch((error: unknown) => {
        // Evita un rechazo silencioso; los consumidores actuales mantienen el
        // array vacío y el diagnóstico queda disponible para soporte.
        console.error('No se pudo cargar la lista de usuarios activos.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  return users;
}
