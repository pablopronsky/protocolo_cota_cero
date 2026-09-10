'use client';

import { useState, useEffect } from 'react';
import { subscribeProject } from '@/lib/repo/projects';
import { collection, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { documentAction } from '@/lib/documentApi';
import { documentStatuses, effectiveProjectStatus } from '@/lib/projectState';
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

    const unsubscribeDocs = onSnapshot(collection(getFirebaseDb(), 'projects', code, 'documents'), (snap) => {
      if (!active) return;
      const next: Partial<Record<DocType, AnyDoc>> = {};
      snap.forEach(d => { next[d.id as DocType] = d.data() as AnyDoc; });
      setDocs(next);
      setDocsLoading(false);
    }, reason => {
      if (!active) return;
      setError(errorMessage(reason, 'No se pudo cargar el legajo.'));
      setDocsLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
      unsubscribeDocs();
    };
  }, [code]);

  useEffect(() => {
    if (!project || projectLoading || docsLoading) return;
    const expected = documentStatuses(docs);
    const status = effectiveProjectStatus(docs, project.status === 'archivado');
    if (JSON.stringify(expected) === JSON.stringify(project.docStatus) && status === project.status) return;
    const repair = () => { void documentAction({ action: 'reconcile', projectCode: code }).catch(() => {
      // Las vistas ya usan los documentos reales; reintentar en la próxima conexión.
    }); };
    repair();
    window.addEventListener('online', repair);
    const timer = setInterval(repair, 30_000);
    return () => { window.removeEventListener('online', repair); clearInterval(timer); };
  }, [code, project, docs, projectLoading, docsLoading]);

  const currentProject = project && !docsLoading ? {
    ...project, docStatus: documentStatuses(docs),
    status: effectiveProjectStatus(docs, project.status === 'archivado'),
  } : project;

  // El formulario no se monta hasta tener proyecto y documentos. Esto evita
  // que RHF arranque vacío y un reset tardío borre datos que el usuario tipeó.
  return { project: currentProject, docs, loading: projectLoading || docsLoading, error };
}
