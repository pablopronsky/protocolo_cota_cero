import {
  collection, doc, getDoc, getDocs, onSnapshot, addDoc,
  setDoc, updateDoc, writeBatch, query, orderBy, limit, startAfter,
  serverTimestamp,
  QueryDocumentSnapshot, DocumentData, Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/client';
import type { Project, ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';
import { DOC_ORDER } from '@/schemas';
import { sequencingError } from '../sequencing';

// Datos que necesita setDocStatus para validar la secuencia del protocolo al
// cerrar un documento. Los aporta el caller, que ya tiene el Project + upstream
// cargados (evita lecturas extra y funciona offline con writeBatch).
export interface SequencingGuard {
  docStatus: Partial<Record<DocType, DocStatus>>;
  upstream?: Partial<Record<DocType, AnyDoc>>;
}

const db = () => getFirebaseDb();

// ── Reads ─────────────────────────────────────────────────

export async function getProject(code: ProjectCode): Promise<Project | null> {
  const snap = await getDoc(doc(db(), 'projects', code));
  return snap.exists() ? (snap.data() as Project) : null;
}

export function subscribeProject(
  code: ProjectCode,
  callback: (project: Project | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db(), 'projects', code), (snap) => {
    callback(snap.exists() ? (snap.data() as Project) : null);
  });
}

const PAGE_SIZE = 20;

export type ProjectCursor = QueryDocumentSnapshot<DocumentData>;

export interface ProjectPage {
  projects: Project[];
  cursor: ProjectCursor | null;
}

export async function listProjects(cursor?: ProjectCursor): Promise<ProjectPage> {
  const col = collection(db(), 'projects');
  const q = cursor
    ? query(col, orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
    : query(col, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
  const snap = await getDocs(q);
  return {
    projects: snap.docs.map((d) => d.data() as Project),
    cursor: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null,
  };
}

// Trae TODOS los proyectos (sin paginar). Pensado para un panel interno con
// pocos proyectos: permite filtrar y paginar client-side con conteos exactos.
export async function listAllProjects(): Promise<Project[]> {
  const snap = await getDocs(query(collection(db(), 'projects'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => d.data() as Project);
}

export async function getDoc_(projectCode: ProjectCode, docType: DocType): Promise<AnyDoc | null> {
  const snap = await getDoc(doc(db(), 'projects', projectCode, 'documents', docType));
  return snap.exists() ? (snap.data() as AnyDoc) : null;
}

export async function getAllDocs(projectCode: ProjectCode): Promise<Partial<Record<DocType, AnyDoc>>> {
  const snap = await getDocs(collection(db(), 'projects', projectCode, 'documents'));
  const result: Partial<Record<DocType, AnyDoc>> = {};
  snap.docs.forEach((d) => {
    result[d.id as DocType] = d.data() as AnyDoc;
  });
  return result;
}

export function subscribeDoc(
  projectCode: ProjectCode,
  docType: DocType,
  callback: (d: AnyDoc) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), 'projects', projectCode, 'documents', docType),
    (snap) => { if (snap.exists()) callback(snap.data() as AnyDoc); },
  );
}

// ── Writes ────────────────────────────────────────────────

export async function saveDoc(
  projectCode: ProjectCode,
  docType: DocType,
  data: Partial<AnyDoc>,
): Promise<void> {
  const ref = doc(db(), 'projects', projectCode, 'documents', docType);
  await setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
}

export async function setDocStatus(
  projectCode: ProjectCode,
  docType: DocType,
  status: DocStatus,
  extra: Partial<AnyDoc> = {},
  projectStatus?: ProjectStatus,
  guard?: SequencingGuard,
): Promise<void> {
  // #21 — Defensa de secuencia en el único camino de escritura de estado. El
  // form ya valida antes para mostrar el error con UX; esto protege a cualquier
  // futuro caller. Las reglas Firestore son el backstop de seguridad real.
  if (guard && (status === 'completo' || status === 'firmado')) {
    const err = sequencingError(docType, status, guard.docStatus, guard.upstream);
    if (err) throw new Error(err);
  }

  const batch = writeBatch(db());
  const docRef = doc(db(), 'projects', projectCode, 'documents', docType);
  const projRef = doc(db(), 'projects', projectCode);
  const now = Date.now();
  const updatedBy = getFirebaseAuth().currentUser?.uid ?? '';

  batch.update(docRef, { status, updatedAt: now, ...extra });

  const projUpdate: Record<string, unknown> = {
    [`docStatus.${docType}`]: status,
    updatedAt: now,
    updatedBy,
  };

  // Transición de estado del proyecto. Se calcula a partir del estado actual
  // (lo pasa el caller, que ya tiene el Project cargado) para no requerir una
  // lectura extra y seguir funcionando offline con writeBatch.
  if (projectStatus && projectStatus !== 'archivado') {
    let next: ProjectStatus = projectStatus;
    if (projectStatus === 'borrador' && status !== 'vacio') next = 'en_curso';
    if (docType === 'AC' && status === 'firmado') next = 'entregado';
    if (next !== projectStatus) projUpdate.status = next;
  }

  batch.update(projRef, projUpdate);
  await batch.commit();
}

// #19 — Reabre un doc bloqueado (completo/firmado → en_progreso). Solo admin:
// las reglas Firestore restringen esta transición a los campos que toca este
// batch (ver firestore.rules, bloque de reopen bajo isAdmin()).
export async function reopenDoc(
  projectCode: ProjectCode,
  docType: DocType,
  by: string,
): Promise<void> {
  const batch = writeBatch(db());
  const docRef = doc(db(), 'projects', projectCode, 'documents', docType);
  const projRef = doc(db(), 'projects', projectCode);
  const now = Date.now();

  batch.update(docRef, {
    status: 'en_progreso' as DocStatus,
    updatedAt: now,
    updatedBy: by,
    reopenedAt: now,
    reopenedBy: by,
  });
  batch.update(projRef, {
    [`docStatus.${docType}`]: 'en_progreso' as DocStatus,
    updatedAt: now,
    updatedBy: by,
  });
  await batch.commit();
}

export async function archiveProject(projectCode: ProjectCode): Promise<void> {
  await updateDoc(doc(db(), 'projects', projectCode), {
    status: 'archivado' as ProjectStatus,
    updatedAt: Date.now(),
  });
}

export async function unarchiveProject(projectCode: ProjectCode): Promise<void> {
  await updateDoc(doc(db(), 'projects', projectCode), {
    status: 'en_curso' as ProjectStatus,
    updatedAt: Date.now(),
  });
}

export async function writeRevision(
  projectCode: ProjectCode,
  docType: DocType,
  action: DocStatus,
  snapshot: Record<string, unknown>,
  version: number,
  by: string,
): Promise<void> {
  await addDoc(collection(db(), 'projects', projectCode, 'revisions'), {
    docType, projectCode, action, snapshot, version, by, at: serverTimestamp(),
  });
}

// Inicializa los 6 documentos vacíos para un proyecto nuevo.
export function initEmptyDocs(
  batch: ReturnType<typeof writeBatch>,
  projectCode: ProjectCode,
  createdBy: string,
): void {
  const now = Date.now();
  DOC_ORDER.forEach((docType) => {
    const ref = doc(db(), 'projects', projectCode, 'documents', docType);
    batch.set(ref, {
      docType,
      projectCode,
      status: 'vacio',
      lockedSnapshot: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: createdBy,
      version: 0,
    });
  });
}
