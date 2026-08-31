import {
  collection, doc, getDoc, getDocs, onSnapshot,
  setDoc, updateDoc, writeBatch, query, orderBy, limit, startAfter,
  serverTimestamp, where,
  QueryDocumentSnapshot, DocumentData, Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/client';
import type { Project, ProjectCode, DocType, DocStatus, ProjectStatus, AnyDoc } from '@/schemas';
import { DOC_ORDER } from '@/schemas';
import { sequencingError } from '../sequencing';
import { pendingUploadsError } from '../pendingUploads';
import { isReopenable, AC_SIGNED_IS_FINAL } from '../docLifecycle';
import { omitStatus } from '../docPatch';

// Datos que necesita setDocStatus para validar la secuencia del protocolo al
// cerrar un documento. Los aporta el caller, que ya tiene el Project + upstream
// cargados (evita lecturas extra y funciona offline con writeBatch).
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

function addRevisionToBatch(
  batch: ReturnType<typeof writeBatch>,
  projectCode: ProjectCode,
  docType: DocType,
  action: DocStatus,
  snapshot: Record<string, unknown>,
  version: number,
  by: string,
): void {
  const revisionRef = doc(collection(db(), 'projects', projectCode, 'revisions'));
  batch.set(revisionRef, {
    docType, projectCode, action, snapshot, version, by, at: serverTimestamp(),
  });
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
    (snap) => { if (snap.exists()) callback(snap.data() as AnyDoc); },
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
  await setDoc(ref, { ...omitStatus(data), updatedAt: Date.now() }, { merge: true });
}

// El mirror (`project.docStatus`/`project.status`) nunca es fuente de verdad:
// se actualiza en un segundo paso, después de que el documento real (fuente
// de verdad) ya quedó persistido. Si este segundo paso falla —red, permisos,
// lo que sea— el documento real ya está a salvo; el mirror queda simplemente
// atrasado hasta la próxima escritura o una reconciliación, nunca inconsistente
// de una forma que autorice algo que no pasó de verdad.
async function updateMirrorBestEffort(
  projRef: ReturnType<typeof doc>,
  projUpdate: Record<string, unknown>,
): Promise<void> {
  try {
    await updateDoc(projRef, projUpdate);
  } catch (err) {
    console.error('[projects] No se pudo actualizar el mirror docStatus (no crítico, se auto-repara):', err);
  }
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

  const docRef = doc(db(), 'projects', projectCode, 'documents', docType);
  const projRef = doc(db(), 'projects', projectCode);
  const now = Date.now();
  const updatedBy = currentUid();
  const isClosing = status === 'completo' || status === 'firmado';
  const revisionSnapshot = extra.lockedSnapshot;
  const revisionVersion = extra.version;

  if (isClosing && (!revisionSnapshot || typeof revisionVersion !== 'number')) {
    throw new Error('No se puede cerrar el documento sin snapshot y versión de revisión.');
  }

  // #P0-4 — Nunca cerrar con adjuntos a medio subir. Va acá, en el único camino
  // de escritura de estado, y no sólo en cada formulario: una vez que el
  // documento queda bloqueado las reglas rechazan el `updateDoc` de
  // `flushPhotoQueue()`, así que una referencia `pending` congelada en el
  // `lockedSnapshot` ya no se puede completar nunca más.
  if (isClosing) {
    const pendingErr = pendingUploadsError({ extra, revisionSnapshot });
    if (pendingErr) throw new Error(pendingErr);
  }

  // #docStatus-source-of-truth — El documento real (+ su revisión, si cierra)
  // se escribe PRIMERO y solo, nunca en el mismo batch que el mirror del
  // proyecto. Firestore evalúa las reglas de cada escritura de un batch contra
  // el estado YA COMMITEADO, sin ver las escrituras hermanas del mismo batch:
  // si el mirror se escribiera junto con el documento, cualquier regla que
  // valide `docStatus` contra `documents/{docType}.status` en el mismo golpe
  // vería siempre el valor VIEJO y rechazaría cierres legítimos. Separar los
  // pasos hace que, para cuando el mirror se escribe, el documento real ya sea
  // un hecho consumado y verificable.
  const batch = writeBatch(db());
  // Los metadatos autoritativos van al final: un payload de formulario no puede
  // pisar accidentalmente el estado objetivo, la fecha ni el autor del cambio.
  batch.update(docRef, { ...extra, status, updatedAt: now, updatedBy });
  if (isClosing) {
    addRevisionToBatch(
      batch,
      projectCode,
      docType,
      status,
      revisionSnapshot as Record<string, unknown>,
      revisionVersion as number,
      updatedBy,
    );
  }
  await batch.commit();

  // El mirror se actualiza después, best-effort: ver updateMirrorBestEffort.
  const projUpdate: Record<string, unknown> = {
    [`docStatus.${docType}`]: status,
    updatedAt: now,
    updatedBy,
  };

  // Transición de estado del proyecto. Se calcula a partir del estado actual
  // (lo pasa el caller, que ya tiene el Project cargado) para no requerir una
  // lectura extra.
  if (projectStatus && projectStatus !== 'archivado') {
    let next: ProjectStatus = projectStatus;
    if (projectStatus === 'borrador' && status !== 'vacio') next = 'en_curso';
    if (docType === 'AC' && status === 'firmado') next = 'entregado';
    if (next !== projectStatus) projUpdate.status = next;
  }

  await updateMirrorBestEffort(projRef, projUpdate);
}

// #19 — Reabre un doc bloqueado (completo/firmado → en_progreso). Solo admin:
// las reglas Firestore restringen esta transición a los campos que toca este
// batch (ver firestore.rules, bloque de reopen bajo isAdmin()).
export async function reopenDoc(
  projectCode: ProjectCode,
  docType: DocType,
  by: string,
  snapshot: Record<string, unknown>,
  version: number,
): Promise<void> {
  const actor = currentUid();
  if (actor !== by) throw new Error('La sesión cambió. Volvé a intentar la reapertura.');

  // #P0-3 — Backstop de cliente. La frontera real es `isReopen()` en
  // firestore.rules; esto sólo evita gastar un round-trip y da un mensaje
  // entendible. `snapshot` es el documento vivo que pasan los formularios.
  const currentStatus = (snapshot as { status?: DocStatus }).status;
  if (!isReopenable(docType, currentStatus)) {
    throw new Error(docType === 'AC' && currentStatus === 'firmado'
      ? AC_SIGNED_IS_FINAL
      : 'Este documento no se puede reabrir.');
  }

  // Ver comentario #docStatus-source-of-truth en setDocStatus: el documento
  // real + su revisión se escriben primero y solos; el mirror va después,
  // best-effort, para que las reglas siempre lo validen contra un estado real
  // ya commiteado.
  const docRef = doc(db(), 'projects', projectCode, 'documents', docType);
  const projRef = doc(db(), 'projects', projectCode);
  const now = Date.now();

  const batch = writeBatch(db());
  batch.update(docRef, {
    status: 'en_progreso' as DocStatus,
    lockedSnapshot: null,
    lockedAt: null,
    lockedBy: null,
    version,
    updatedAt: now,
    updatedBy: actor,
    reopenedAt: now,
    reopenedBy: actor,
  });
  addRevisionToBatch(batch, projectCode, docType, 'en_progreso', snapshot, version, actor);
  await batch.commit();

  await updateMirrorBestEffort(projRef, {
    [`docStatus.${docType}`]: 'en_progreso' as DocStatus,
    updatedAt: now,
    updatedBy: actor,
  });
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
