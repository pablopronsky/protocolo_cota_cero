import {
  collection, doc, getDoc, getDocs, onSnapshot,
  setDoc, updateDoc, writeBatch, query, orderBy, limit, startAfter,
  where,
  QueryDocumentSnapshot, DocumentData, Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/client';
import type { Project, ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';
import { DOC_ORDER } from '@/schemas';
import { sequencingError } from '../sequencing';
import { pendingUploadsError } from '../pendingUploads';
import { isReopenable, AC_SIGNED_IS_FINAL } from '../docLifecycle';
import { editableDocPatch } from '../docPatch';
import { documentAction } from '../documentApi';

// Datos que necesita setDocStatus para validar la secuencia del protocolo al
// cerrar un documento. Los aporta el caller, que ya tiene el Project + upstream
// cargados. El servidor repite la validación sobre los documentos actuales.
export interface SequencingGuard {
  docStatus: Partial<Record<DocType, DocStatus>>;
  upstream?: Partial<Record<DocType, AnyDoc>>;
}

const db = () => getFirebaseDb();
function currentUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sesion no disponible. Volve a iniciar sesion.');
  return uid;
}

// ── Reads ─────────────────────────────────────────────────

export async function getProject(code: ProjectCode): Promise<Project | null> {
  const snap = await getDoc(doc(db(), 'projects', code));
  return snap.exists() ? (snap.data() as Project) : null;
}

export function subscribeProject(
  code: ProjectCode,
  callback: (project: Project | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), 'projects', code),
    (snap) => callback(snap.exists() ? (snap.data() as Project) : null),
    (error) => onError?.(error),
  );
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

export async function listProjectsByClient(clientId: string): Promise<Project[]> {
  const snap = await getDocs(query(
    collection(db(), 'projects'),
    where('clienteId', '==', clientId),
  ));
  return snap.docs
    .map((d) => d.data() as Project)
    .sort((a, b) => b.updatedAt - a.updatedAt);
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
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), 'projects', projectCode, 'documents', docType),
    (snap) => {
      if (snap.exists()) callback(snap.data() as AnyDoc);
      else onError?.(new Error('Documento no encontrado.'));
    },
    (error) => onError?.(error),
  );
}

// ── Writes ────────────────────────────────────────────────

export async function saveDoc(
  projectCode: ProjectCode,
  docType: DocType,
  data: Partial<AnyDoc>,
): Promise<void> {
  const ref = doc(db(), 'projects', projectCode, 'documents', docType);
  await setDoc(ref, { ...editableDocPatch(data), updatedAt: Date.now(), updatedBy: currentUid() }, { merge: true });
}

// Los cierres, reaperturas y revisiones son una transacción de servidor.
// La promoción inicial conserva la persistencia offline del SDK.
export async function setDocStatus(
  projectCode: ProjectCode, docType: DocType, status: DocStatus,
  extra: Partial<AnyDoc> = {}, projectStatus?: ProjectStatus, guard?: SequencingGuard,
): Promise<void> {
  if (status === 'completo' || status === 'firmado') {
    if (guard) {
      const error = sequencingError(docType, status, guard.docStatus, guard.upstream);
      if (error) throw new Error(error);
    }
    const pending = pendingUploadsError(extra);
    if (pending) throw new Error(pending);
    await documentAction({ action: 'close', projectCode, docType, status,
      values: editableDocPatch(extra), expectedVersion: typeof extra.version === 'number' ? extra.version - 1 : undefined });
    return;
  }
  const batch = writeBatch(db());
  const now = Date.now();
  const updatedBy = currentUid();
  batch.update(doc(db(), 'projects', projectCode, 'documents', docType), {
    ...editableDocPatch(extra), status, updatedAt: now, updatedBy,
  });
  batch.update(doc(db(), 'projects', projectCode), {
    [`docStatus.${docType}`]: status, updatedAt: now, updatedBy,
    ...(projectStatus === 'borrador' ? { status: 'en_curso' } : {}),
  });
  await batch.commit();
}

export async function reopenDoc(
  projectCode: ProjectCode, docType: DocType, by: string,
  snapshot: Record<string, unknown>, version: number,
): Promise<void> {
  if (currentUid() !== by) throw new Error('La sesión cambió. Volvé a intentar.');
  if (!isReopenable(docType, snapshot.status as DocStatus)) {
    throw new Error(docType === 'AC' ? AC_SIGNED_IS_FINAL : 'Este documento no se puede reabrir.');
  }
  await documentAction({ action: 'reopen', projectCode, docType, expectedVersion: version - 1 });
}

export async function archiveProject(projectCode: ProjectCode): Promise<void> {
  await documentAction({ action: 'archive', projectCode });
}

export async function unarchiveProject(projectCode: ProjectCode): Promise<void> {
  await documentAction({ action: 'unarchive', projectCode });
}

export async function updateProjectMaterial(
  projectCode: ProjectCode,
  materialInstalado: Project['materialInstalado'],
): Promise<void> {
  await updateDoc(doc(db(), 'projects', projectCode), {
    materialInstalado,
    updatedAt: Date.now(),
    updatedBy: getFirebaseAuth().currentUser?.uid ?? '',
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
