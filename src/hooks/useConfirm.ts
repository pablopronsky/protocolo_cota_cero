'use client';
import { useState, useRef, useCallback } from 'react';

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const openConfirm = useCallback((msg: string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setMessage(msg);
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

  return { confirmOpen: open, confirmMessage: message, openConfirm, onConfirm, onCancel };
}
