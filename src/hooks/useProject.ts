'use client';

import { useState, useEffect } from 'react';
import { subscribeProject, getAllDocs } from '@/lib/repo/projects';
import type { Project, ProjectCode, DocType, AnyDoc } from '@/schemas';

export function useProject(code: ProjectCode) {
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;

    const unsub = subscribeProject(code, (p) => {
      setProject(p);
      setLoading(false);
    });

    getAllDocs(code).then(setDocs);

    return unsub;
  }, [code]);

  return { project, docs, loading };
}
