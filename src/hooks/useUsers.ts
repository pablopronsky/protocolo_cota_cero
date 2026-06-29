'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import type { AppUser } from '@/schemas';

export function useUsers(): AppUser[] {
  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    const db = getFirebaseDb();
    getDocs(query(collection(db, 'users'), where('activo', '==', true)))
      .then((snap) => setUsers(snap.docs.map((d) => d.data() as AppUser)))
      .catch(() => {});
  }, []);

  return users;
}
