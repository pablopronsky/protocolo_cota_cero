'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeDoc, saveDoc, setDocStatus } from '@/lib/repo/projects';
import { useSaveStatusContext, type SaveState } from '@/contexts/SaveStatusContext';
import type { ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';

type PendingSave = {
  data: Partial<AnyDoc>;
  projectStatus?: ProjectStatus;
};

// Cerrar/firmar usa writeBatch.commit(), cuya promesa no resuelve hasta el ack
// del servidor: sin conexión el spinner quedaría colgado para siempre. Los
// forms chequean esto antes de intentar el lock y muestran el mensaje.
export function offlineLockError(): string | null {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Sin conexión: no se puede cerrar el documento sin señal. Los cambios quedan guardados en el dispositivo; reintentá al recuperar conexión.';
  }
  return null;
}

function saveErrorState(reason: unknown): SaveState {
  const error = reason as { code?: string };
  if (error.code === 'permission-denied') return 'denied';
  if (!navigator.onLine || error.code === 'unavailable' || error.code === 'failed-precondition') {
    return 'offline';
  }
  return 'error';
}

export function useDoc(projectCode: ProjectCode, docType: DocType) {
  const [docData, setDocData] = useState<AnyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveStateLocal] = useState<SaveState>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingSave | null>(null);
  const statusRef = useRef<DocStatus | undefined>(undefined);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const globalSetDocState = useSaveStatusContext()?.setDocState;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      globalSetDocState?.('idle');
    };
  }, [globalSetDocState]);

  const setSaveState = useCallback((state: SaveState) => {
    if (!mountedRef.current) return;
    setSaveStateLocal(state);
    globalSetDocState?.(state);
  }, [globalSetDocState]);

  useEffect(() => {
    if (!projectCode || !docType) return;

    setDocData(null);
    setLoading(true);
    setLoadError(null);
    statusRef.current = undefined;

    return subscribeDoc(
      projectCode,
      docType,
      (doc) => {
        setDocData(doc);
        statusRef.current = doc.status;
        setLoading(false);
      },
      (error) => {
        setLoadError(error.message || 'No se pudo cargar el documento.');
        setLoading(false);
      },
    );
  }, [projectCode, docType]);

  const persist = useCallback(async (pending: PendingSave) => {
    // Si la suscripción aún no entregó el primer snapshot, el documento sólo
    // puede ser vacío o ya editable; promoverlo otra vez a en_progreso es seguro
    // y mantiene sincronizado project.docStatus.
    if (!statusRef.current || statusRef.current === 'vacio') {
      await setDocStatus(
        projectCode,
        docType,
        'en_progreso',
        pending.data,
        pending.projectStatus,
      );
      statusRef.current = 'en_progreso';
    } else {
      await saveDoc(projectCode, docType, pending.data);
    }
  }, [projectCode, docType]);

  const enqueueWrite = useCallback((pending: PendingSave): Promise<void> => {
    // Firestore conserva el orden de mutaciones locales, pero serializar aquí
    // también evita que una respuesta vieja pise el indicador de una nueva.
    const write = writeQueueRef.current
      .catch(() => undefined)
      .then(() => persist(pending));
    writeQueueRef.current = write;
    return write;
  }, [persist]);

  const autosave = useCallback((data: Partial<AnyDoc>, projectStatus?: ProjectStatus) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }

    const generation = ++saveGenerationRef.current;
    pendingRef.current = { data, projectStatus };
    setSaveState('saving');

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;

      void enqueueWrite(pending)
        .then(() => {
          if (!mountedRef.current || generation !== saveGenerationRef.current) return;
          setSaveState('saved');
          savedTimerRef.current = setTimeout(() => {
            if (generation === saveGenerationRef.current) setSaveState('idle');
          }, 2000);
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || generation !== saveGenerationRef.current) return;
          setSaveState(saveErrorState(error));
        });
    }, 800);
  }, [enqueueWrite, setSaveState]);

  // Cancela el debounce y espera cualquier escritura que ya haya empezado. El
  // cierre/firma se ejecuta después, por lo que nunca puede ser pisado por un
  // autosave anterior que reciba su ACK más tarde.
  const cancelAutosave = useCallback(async (): Promise<void> => {
    const clearScheduled = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      debounceRef.current = null;
      savedTimerRef.current = null;
      pendingRef.current = null;
    };

    ++saveGenerationRef.current;
    while (true) {
      clearScheduled();
      const observedQueue = writeQueueRef.current;
      try {
        await observedQueue;
      } catch {
        // El cierre vuelve a persistir todos los valores y mostrará su propio
        // error si la causa (permisos/conexión) continúa vigente.
      }
      clearScheduled();
      if (writeQueueRef.current === observedQueue) break;
    }
    ++saveGenerationRef.current;
    setSaveState('idle');
  }, [setSaveState]);

  // Al desmontar, el último cambio pendiente se encola detrás de cualquier
  // escritura en vuelo en vez de perderse durante la ventana del debounce.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    ++saveGenerationRef.current;
    if (pending) void enqueueWrite(pending).catch(() => undefined);
  }, [enqueueWrite]);

  return { docData, loading, loadError, saveState, autosave, cancelAutosave };
}
