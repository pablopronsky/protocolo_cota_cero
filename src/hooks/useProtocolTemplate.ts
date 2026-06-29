'use client';
import { useEffect, useState } from 'react';
import { subscribeProtocolTemplate } from '@/lib/repo/protocol';
import type { ProtocolTemplate } from '@/schemas';

export function useProtocolTemplate() {
  const [template, setTemplate] = useState<ProtocolTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = subscribeProtocolTemplate((t) => { setTemplate(t); setLoading(false); });
    return unsub;
  }, []);
  return { template, loading };
}
