'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/client';
import type { AppUser } from '@/schemas';

export interface AuthState {
  user: User | null;
  appUser: AppUser | null;
  role: 'admin' | 'tecnico' | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    appUser: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, appUser: null, role: null, loading: false });
        return;
      }

      const tokenResult = await user.getIdTokenResult();
      const role = (tokenResult.claims.role as 'admin' | 'tecnico') ?? null;

      const db = getFirebaseDb();
      const snap = await getDoc(doc(db, 'users', user.uid));
      const appUser = snap.exists() ? (snap.data() as AppUser) : null;

      setState({ user, appUser, role, loading: false });
    });
    return unsubscribe;
  }, []);

  return state;
}

export async function login(email: string, password: string): Promise<void> {
  const auth = getFirebaseAuth();
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}
