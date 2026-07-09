'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'denied' | 'error';

interface SaveStatusValue {
  docState: SaveState;
  setDocState: (s: SaveState) => void;
  online: boolean;
}

const SaveStatusContext = createContext<SaveStatusValue | null>(null);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [docState, setDocState] = useState<SaveState>('idle');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <SaveStatusContext.Provider value={{ docState, setDocState, online }}>
      {children}
    </SaveStatusContext.Provider>
  );
}

// No lanza si se usa fuera del provider — páginas fuera de (app) (login, print) no lo tienen.
export function useSaveStatusContext() {
  return useContext(SaveStatusContext);
}
