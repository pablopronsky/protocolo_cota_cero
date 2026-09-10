import { buildLockedSnapshot } from '@/lib/inheritance';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, getAdminBucket } from '@/lib/firebase/admin';
import { SubmitSignatureInput, SIGN_TOKEN_RE } from '@/schemas/inputs';
import { signEligibilityError } from '@/lib/signEligibility';
import type { SignRequest, DocAC, DocOT, DocType, AnyDoc, Project, PhotoRef } from '@/schemas';

// Endpoints PÚBLICOS (el cliente no tiene cuenta): la autorización es el token
// impredecible de la URL, con vencimiento y un solo uso. Todo pasa por el
// Admin SDK; las reglas de Firestore niegan signRequests a cualquier cliente.

class SignError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function loadValidRequest(token: string): Promise<SignRequest> {
  if (!SIGN_TOKEN_RE.test(token)) throw new SignError(404, 'Link inválido');
  const snap = await getAdminDb().doc(`signRequests/${token}`).get();
  if (!snap.exists) throw new SignError(404, 'Link inválido');
  const r = snap.data() as SignRequest;
  if (r.status === 'completed') throw new SignError(410, 'Esta acta ya fue firmada. ¡Gracias!');
  if (r.status === 'cancelled') throw new SignError(410, 'Este link fue cancelado. Pedile uno nuevo a COTA CERO.');
  if (r.expiresAt < Date.now()) throw new SignError(410, 'Este link venció. Pedile uno nuevo a COTA CERO.');
  return r;
}

// La elegibilidad se evalúa sobre los documentos reales, así que hace falta la
// colección entera y no solo el AC.
function toDocumentMap(
  snap: FirebaseFirestore.QuerySnapshot,
): Partial<Record<DocType, AnyDoc>> {
  const documents: Partial<Record<DocType, AnyDoc>> = {};
  for (const d of snap.docs) documents[d.id as DocType] = d.data() as AnyDoc;
  return documents;
}

function errorResponse(err: unknown) {
  if (err instanceof SignError) {
    return response({ error: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    return response({ error: err.issues[0]?.message ?? 'Datos invalidos' }, 400);
  }
  console.error('[sign public]', err);
  return response({ error: 'Error interno' }, 500);
}

// Datos mínimos para que el cliente reconozca su obra en la página de firma.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const r = await loadValidRequest(token);
    const db = getAdminDb();

    const [projSnap, documentsSnap] = await Promise.all([
      db.doc(`projects/${r.projectCode}`).get(),
      db.collection(`projects/${r.projectCode}/documents`).get(),
    ]);
    if (!projSnap.exists) throw new SignError(404, 'Link inválido');
    const project = projSnap.data() as Project;
    const documents = toDocumentMap(documentsSnap);
    const ac = documents.AC as DocAC | undefined;
    if (ac && (ac.status === 'firmado' || ac.firmaCliente?.firma)) {
      throw new SignError(410, 'Esta acta ya fue firmada. ¡Gracias!');
    }
    // #P0-5 — Lo que era cierto al emitir el link puede haber dejado de serlo.
    // Si la obra ya no está en condiciones, no se le pide la firma al cliente.
    const notEligible = signEligibilityError(project, documents);
    if (notEligible) throw new SignError(409, notEligible);
    const otDoc = documents.OT as DocOT | undefined;

    const d = project.domicilioObra;
    return response({
      projectCode: project.code,
      clienteNombre: project.clienteNombre,
      domicilio: `${d.calle} ${d.numero}, ${d.localidad}`,
      obraEjecutada: otDoc?.alcance ?? '',
      materialTipo: project.materialInstalado.tipo,
      materialDescripcion: project.materialInstalado.descripcion,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// Recibe la conformidad + firma del cliente y la registra en el acta. El
// contenido queda congelado con la firma (mismo contrato #22 del flujo
// presencial: firmaCliente.firma presente ⇒ acta no editable).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  let uploadedPath: string | null = null;
  try {
    const { token } = await params;
    const r = await loadValidRequest(token);
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 1_100_000) throw new SignError(413, 'Solicitud demasiado pesada');
    const input = SubmitSignatureInput.parse(await req.json());
    const db = getAdminDb();

    // Subir la firma a Storage antes de la transacción: si la transacción
    // falla queda un archivo huérfano inofensivo; nunca un acta sin imagen.
    const id = randomUUID();
    const storagePath = `projects/${r.projectCode}/AC/${id}.jpg`;
    const base64 = input.firmaDataUrl.slice('data:image/jpeg;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    const isJpeg = buffer.length >= 100
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff
      && buffer[buffer.length - 2] === 0xff
      && buffer[buffer.length - 1] === 0xd9;
    if (!isJpeg) throw new SignError(400, 'La firma no es un JPEG valido');
    await getAdminBucket().file(storagePath).save(buffer, {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: { cacheControl: 'private, no-store, max-age=0' },
    });
    uploadedPath = storagePath;

    const firma: PhotoRef = {
      id,
      storagePath,
      takenAt: Date.now(),
      uploadedBy: 'cliente_remoto',
      pending: false,
    };
    const hoy = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }); // YYYY-MM-DD

    const reqRef = db.doc(`signRequests/${token}`);
    const acRef = db.doc(`projects/${r.projectCode}/documents/AC`);
    const projRef = db.doc(`projects/${r.projectCode}`);
    const documentsRef = db.collection(`projects/${r.projectCode}/documents`);
    const pendingQuery = db.collection('signRequests')
      .where('projectCode', '==', r.projectCode)
      .where('status', '==', 'pending');

    await db.runTransaction(async (tx) => {
      // Revalidar DENTRO de la transacción: un solo uso, sin carreras entre
      // dos envíos simultáneos o contra una firma presencial.
      const [reqSnap, acSnap, projSnap, documentsSnap, pendingSnap] = await Promise.all([
        tx.get(reqRef), tx.get(acRef), tx.get(projRef), tx.get(documentsRef), tx.get(pendingQuery),
      ]);
      if (!reqSnap.exists || !acSnap.exists || !projSnap.exists) {
        throw new SignError(404, 'Link inválido');
      }
      const liveReq = reqSnap.data() as SignRequest;
      if (liveReq.status !== 'pending' || liveReq.expiresAt < Date.now()) {
        throw new SignError(410, 'Este link ya no está vigente.');
      }
      const ac = acSnap.data() as DocAC;
      if (ac.status === 'firmado' || ac.firmaCliente?.firma) {
        throw new SignError(409, 'Esta acta ya fue firmada.');
      }
      const project = projSnap.data() as Project;
      // #P0-5 — Revalidar DENTRO de la transacción, contra los documentos
      // reales: entre la emisión del link y este POST la RF pudo reabrirse y
      // marcarse NO apta, o la obra pudo archivarse. El link no es un permiso
      // permanente para firmar.
      const notEligible = signEligibilityError(project, toDocumentMap(documentsSnap));
      if (notEligible) throw new SignError(409, notEligible);
      const now = Date.now();

      pendingSnap.docs.forEach((requestDoc) => {
        tx.update(requestDoc.ref, requestDoc.id === token
          ? { status: 'completed', signedAt: now }
          : { status: 'cancelled' });
      });
      tx.update(acRef, {
        acceptedSnapshot: buildLockedSnapshot(project, toDocumentMap(documentsSnap), {
          ...ac, conformidad: input.conformidad, observacionesCliente: input.observacionesCliente,
        }),
        conformidad: input.conformidad,
        observacionesCliente: input.observacionesCliente,
        fechaActa: ac.fechaActa || hoy,
        firmaCliente: {
          nombreAclaratorio: input.nombreAclaratorio,
          dni: input.dni,
          firma,
        },
        remoteSign: FieldValue.delete(),
        status: ac.status === 'vacio' ? 'en_progreso' : ac.status,
        updatedAt: now,
        updatedBy: 'cliente_remoto',
      });
      // Mismos mirrors que setDocStatus en el cliente.
      if (ac.status === 'vacio') {
        tx.update(projRef, {
          'docStatus.AC': 'en_progreso',
          ...(project.status === 'borrador' ? { status: 'en_curso' } : {}),
          updatedAt: now,
        });
      }
    });
    uploadedPath = null;

    return response({ ok: true });
  } catch (err) {
    if (uploadedPath) {
      try {
        await getAdminBucket().file(uploadedPath).delete({ ignoreNotFound: true });
      } catch (cleanupError) {
        console.error('[sign public] orphan cleanup failed', cleanupError);
      }
    }
    return errorResponse(err);
  }
}
