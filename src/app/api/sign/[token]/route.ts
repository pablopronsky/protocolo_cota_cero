import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, getAdminBucket } from '@/lib/firebase/admin';
import { SubmitSignatureInput, SIGN_TOKEN_RE } from '@/schemas/inputs';
import type { SignRequest, DocAC, DocOT, Project, PhotoRef } from '@/schemas';

// Endpoints PÚBLICOS (el cliente no tiene cuenta): la autorización es el token
// impredecible de la URL, con vencimiento y un solo uso. Todo pasa por el
// Admin SDK; las reglas de Firestore niegan signRequests a cualquier cliente.

class SignError extends Error {
  constructor(public status: number, message: string) { super(message); }
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

function errorResponse(err: unknown) {
  if (err instanceof SignError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }
  console.error('[sign public]', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
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

    const [projSnap, otSnap, acSnap] = await Promise.all([
      db.doc(`projects/${r.projectCode}`).get(),
      db.doc(`projects/${r.projectCode}/documents/OT`).get(),
      db.doc(`projects/${r.projectCode}/documents/AC`).get(),
    ]);
    if (!projSnap.exists) throw new SignError(404, 'Link inválido');
    const project = projSnap.data() as Project;
    const ac = acSnap.exists ? (acSnap.data() as DocAC) : null;
    if (ac && (ac.status === 'firmado' || ac.firmaCliente?.firma)) {
      throw new SignError(410, 'Esta acta ya fue firmada. ¡Gracias!');
    }

    const d = project.domicilioObra;
    return NextResponse.json({
      clienteNombre: project.clienteNombre,
      domicilio: `${d.calle} ${d.numero}, ${d.localidad}`,
      obraEjecutada: otSnap.exists ? ((otSnap.data() as DocOT).alcance ?? '') : '',
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
  try {
    const { token } = await params;
    const r = await loadValidRequest(token);
    const input = SubmitSignatureInput.parse(await req.json());
    const db = getAdminDb();

    // Subir la firma a Storage antes de la transacción: si la transacción
    // falla queda un archivo huérfano inofensivo; nunca un acta sin imagen.
    const id = randomUUID();
    const storagePath = `projects/${r.projectCode}/AC/${id}.jpg`;
    const base64 = input.firmaDataUrl.slice('data:image/jpeg;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 100) throw new SignError(400, 'La firma llegó vacía. Probá de nuevo.');
    await getAdminBucket().file(storagePath).save(buffer, {
      contentType: 'image/jpeg',
      resumable: false,
    });

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

    await db.runTransaction(async (tx) => {
      // Revalidar DENTRO de la transacción: un solo uso, sin carreras entre
      // dos envíos simultáneos o contra una firma presencial.
      const [reqSnap, acSnap, projSnap] = await Promise.all([
        tx.get(reqRef), tx.get(acRef), tx.get(projRef),
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
      const now = Date.now();

      tx.update(reqRef, { status: 'completed', signedAt: now });
      tx.update(acRef, {
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
