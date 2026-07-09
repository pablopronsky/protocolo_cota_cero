'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeDoc, saveDoc, setDocStatus } from '@/lib/repo/projects';
import { useSaveStatusContext } from '@/contexts/SaveStatusContext';
import type { ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';

// Cerrar/firmar usa writeBatch.commit(), cuya promesa no resuelve hasta el ack
// del servidor: sin conexión el spinner quedaría colgado para siempre. Los
// forms chequean esto antes de intentar el lock y muestran el mensaje.
export function offlineLockError(): string | null {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Sin conexión: no se puede cerrar el documento sin señal. Los cambios quedan guardados en el dispositivo; reintentá al recuperar conexión.';
  }
  return null;
}

export function useDoc(projectCode: ProjectCode, docType: DocType) {
  const [docData, setDocData] = useState<AnyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveStateLocal] = useState<'idle' | 'saving' | 'saved' | 'offline' | 'denied' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Último payload programado y aún no escrito. Permite despacharlo si el
  // componente se desmonta durante la ventana del debounce (navegación in-app).
  const pendingRef = useRef<{ data: Partial<AnyDoc>; projectStatus?: ProjectStatus } | null>(null);
  const globalSave = useSaveStatusContext();
  const setSaveState = useCallback(
    (s: 'idle' | 'saving' | 'saved' | 'offline' | 'denied' | 'error') => {
      setSaveStateLocal(s);
      globalSave?.setDocState(s);
    },
    [globalSave],
  );

  // Al desmontar (salir del doc), limpia el estado global para que el header
  // no muestre "Guardado" en páginas que no son de edición de documentos.
  useEffect(() => () => globalSave?.setDocState('idle'), [globalSave]);
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
      pendingRef.current = { data, projectStatus };
      debounceRef.current = setTimeout(async () => {
        pendingRef.current = null;
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
    pendingRef.current = null;
  }, []);

  // Al desmontar, un guardado pendiente no se descarta: se despacha inmediato.
  // Sin esto, editar y navegar dentro de la app antes de que venza el debounce
  // (800ms) perdía la última edición en silencio.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      const write = statusRef.current === 'vacio'
        ? setDocStatus(projectCode, docType, 'en_progreso', pending.data, pending.projectStatus)
        : saveDoc(projectCode, docType, pending.data);
      void write.catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { docData, loading, saveState, autosave, cancelAutosave };
}
