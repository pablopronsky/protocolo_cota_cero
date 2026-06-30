'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { AppUser } from '@/schemas';

export default function SettingsPage() {
  const { role, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    if (!loading && role !== 'admin') router.replace('/projects');
  }, [role, loading, router]);

  useEffect(() => {
    if (role !== 'admin') return;
    const db = getFirebaseDb();
    getDocs(collection(db, 'users')).then((snap) => {
      setUsers(snap.docs.map((d) => d.data() as AppUser));
    });
  }, [role]);

  if (loading || role !== 'admin') return null;

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-1">Administración</p>
        <h1 className="text-xl font-bold text-[#2B2D2F]">Usuarios</h1>
      </div>

      <p className="text-xs text-[#6B6155] leading-relaxed">
        Los roles se asignan con custom claims via Admin SDK. Contactar al admin técnico para realizar cambios.
      </p>

      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.uid}
            className="bg-white border border-[rgba(43,45,47,0.09)] rounded-lg px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm text-[#2B2D2F] truncate">{u.nombre}</p>
              <p className="text-xs text-[#6B6155] font-mono truncate">{u.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-[14px] font-bold uppercase tracking-[0.14em] border rounded px-2 py-px ${
                  u.role === 'admin'
                    ? 'bg-[#2B2D2F] text-[#C38A5A] border-[#2B2D2F]'
                    : 'text-[#6B6155] border-[#B8AEA3]/35'
                }`}
              >
                {u.role}
              </span>
              {!u.activo && (
                <span className="text-[14px] font-bold uppercase tracking-[0.14em] text-red-400">
                  Inactivo
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
