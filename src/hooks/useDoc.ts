'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeDoc, saveDoc, setDocStatus } from '@/lib/repo/projects';
import type { ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';

export function useDoc(projectCode: ProjectCode, docType: DocType) {
  const [docData, setDocData] = useState<AnyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline' | 'denied' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Estado en vivo del doc, para decidir en el momento del guardado si esta es
  // la primera edición (vacio → en_progreso). Vive en un ref para que el
  // callback debounced lea siempre el valor actual sin recrearse.
  const statusRef = useRef<DocStatus | undefined>(undefined);

  useEffect(() => {
    if (!projectCode || !docType) return;

    const unsub = subscribeDoc(projectCode, docType, (d) => {
      setDocData(d);
      statusRef.current = (d as AnyDoc).status;
      setLoading(false);
    });

    return unsub;
  }, [projectCode, docType]);

  const autosave = useCallback(
    (data: Partial<AnyDoc>, projectStatus?: ProjectStatus) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveState('saving');
      debounceRef.current = setTimeout(async () => {
        try {
          // Primera edición de un doc vacío: promoverlo a en_progreso. A
          // diferencia de saveDoc (que solo toca el doc), setDocStatus también
          // actualiza project.docStatus —el mirror que lee el overview— y, si
          // corresponde, el estado del proyecto (borrador → en_curso). En
          // adelante el doc ya no está vacío y se usa el autosave normal.
          if (statusRef.current === 'vacio') {
            await setDocStatus(projectCode, docType, 'en_progreso', data, projectStatus);
          } else {
            await saveDoc(projectCode, docType, data);
          }
          setSaveState('saved');
          savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
        } catch (err) {
          const error = err as { code?: string };
          if (error.code === 'permission-denied') {
            setSaveState('denied');
          } else if (!navigator.onLine || error.code === 'unavailable' || error.code === 'failed-precondition') {
            setSaveState('offline');
          } else {
            setSaveState('error');
          }
        }
      }, 800);
    },
    [projectCode, docType],
  );

  // Cancela cualquier guardado pendiente. Lo llama el handler de bloqueo antes
  // de escribir el estado final: evita que un autosave en vuelo (programado con
  // el estado previo) se ejecute después del lock y lo revierta.
  const cancelAutosave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  return { docData, loading, saveState, autosave, cancelAutosave };
}
