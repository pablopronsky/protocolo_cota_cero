'use client';

import { useState, useEffect } from 'react';
import { subscribeProject, getAllDocs } from '@/lib/repo/projects';
import type { Project, ProjectCode, DocType, AnyDoc } from '@/schemas';

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export function useProject(code: ProjectCode) {
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocType, AnyDoc>>>({});
  const [projectLoading, setProjectLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setProject(null);
      setDocs({});
      setProjectLoading(false);
      setDocsLoading(false);
      setError('Código de proyecto inválido.');
      return;
    }

    let active = true;
    setProject(null);
    setDocs({});
    setProjectLoading(true);
    setDocsLoading(true);
    setError(null);

    const unsubscribe = subscribeProject(
      code,
      (nextProject) => {
        if (!active) return;
        setProject(nextProject);
        setProjectLoading(false);
      },
      (reason) => {
        if (!active) return;
        setError(errorMessage(reason, 'No se pudo cargar el proyecto.'));
        setProjectLoading(false);
      },
    );

    void getAllDocs(code)
      .then((nextDocs) => {
        if (active) setDocs(nextDocs);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, 'No se pudo cargar el legajo del proyecto.'));
      })
      .finally(() => {
        if (active) setDocsLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [code]);

  // El formulario no se monta hasta tener proyecto y documentos. Esto evita
  // que RHF arranque vacío y un reset tardío borre datos que el usuario tipeó.
  return { project, docs, loading: projectLoading || docsLoading, error };
}
