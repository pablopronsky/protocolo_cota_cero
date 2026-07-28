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

interface UseAuthOptions {
  loadProfile?: boolean;
}

export function useAuth({ loadProfile = true }: UseAuthOptions = {}): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    appUser: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({ user: null, appUser: null, role: null, loading: false });
        return;
      }

      // Las pantallas que sólo necesitan una sesión autenticada no deben esperar
      // la renovación de claims ni la lectura del perfil.
      if (!loadProfile) {
        setState({ user, appUser: null, role: null, loading: false });
        return;
      }

      void (async () => {
        try {
          // forceRefresh:true garantiza que un cambio de rol (custom claim) se
          // refleje en la próxima carga sin tener que cerrar sesión.
          const tokenResult = await user.getIdTokenResult(true);
          const role = (tokenResult.claims.role as 'admin' | 'tecnico') ?? null;

          const db = getFirebaseDb();
          const snap = await getDoc(doc(db, 'users', user.uid));
          const appUser = snap.exists() ? (snap.data() as AppUser) : null;

          if (active && auth.currentUser?.uid === user.uid) {
            setState({ user, appUser, role, loading: false });
          }
        } catch (error) {
          if (active && auth.currentUser?.uid === user.uid) {
            setState({ user, appUser: null, role: null, loading: false });
          }
          console.error('No se pudo cargar el perfil del usuario.', error);
        }
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadProfile]);

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
