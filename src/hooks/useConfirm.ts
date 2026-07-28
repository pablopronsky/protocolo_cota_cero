'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [danger, setDanger] = useState(false);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  // Un segundo diálogo reemplaza al anterior. Resolver el pendiente evita que
  // el primer caller quede esperando para siempre una promesa huérfana.
  const openConfirm = useCallback((msg: string, opts?: { danger?: boolean }): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setMessage(msg);
      setDanger(!!opts?.danger);
      setOpen(true);
    });
  }, []);

  const onConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setOpen(false);
  }, []);

  const onCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => () => {
    // Si la navegación desmonta el componente con el modal abierto, el flujo
    // que esperaba la confirmación se cancela de forma determinista.
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return { confirmOpen: open, confirmMessage: message, confirmDanger: danger, openConfirm, onConfirm, onCancel };
}
