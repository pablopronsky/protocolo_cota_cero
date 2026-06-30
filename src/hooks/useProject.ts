'use client';

import { useState, useEffect } from 'react';
import { subscribeProject, getAllDocs } from '@/lib/repo/projects';
import { getClient } from '@/lib/repo/clients';
import type { Project, Client, ProjectCode, DocType, AnyDoc } from '@/schemas';

export function useProject(code: ProjectCode) {
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;

    const unsub = subscribeProject(code, (p) => {
      setProject(p);
      setLoading(false);
      // Cargar el cliente cada vez que cambie el proyecto (el clienteId podría cambiar si se corrige)
      if (p?.clienteId) {
        getClient(p.clienteId).then(setClient).catch(() => setClient(null));
      } else {
        setClient(null);
      }
    });

    getAllDocs(code).then(setDocs);

    return unsub;
  }, [code]);

  return { project, client, docs, loading };
}
