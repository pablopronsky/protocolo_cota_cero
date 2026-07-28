import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin, HttpError } from '@/lib/auth/requireAuth';
import { CreateSignRequestInput } from '@/schemas/inputs';
import type { DocAC, SignRequest } from '@/schemas';

const EXPIRY_DAYS = 7;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) return response({ error: err.message }, err.status);
  if (err instanceof ZodError) {
    return response({ error: err.issues[0]?.message ?? 'Datos invalidos' }, 400);
  }
  console.error('[sign request]', err);
  return response({ error: 'Error interno' }, 500);
}

function activeRequest(requests: SignRequest[], now: number): SignRequest | null {
  return requests
    .filter((request) => request.status === 'pending' && request.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

function publicUrl(req: NextRequest, token: string) {
  return `${req.nextUrl.origin}/firmar/${token}`;
}

// Crea un unico link activo. Reintentos y POST concurrentes reutilizan el link
// vigente; la escritura del AC serializa las transacciones y evita TOCTOU.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const { projectCode } = CreateSignRequestInput.parse(await req.json());
    const db = getAdminDb();
    const candidateToken = randomBytes(24).toString('base64url');

    const result = await db.runTransaction(async (tx) => {
      const acRef = db.doc(`projects/${projectCode}/documents/AC`);
      const pendingQuery = db.collection('signRequests')
        .where('projectCode', '==', projectCode)
        .where('status', '==', 'pending');
      const acSnap = await tx.get(acRef);
      const pendingSnap = await tx.get(pendingQuery);

      if (!acSnap.exists) throw new HttpError(404, 'Acta no encontrada');
      const ac = acSnap.data() as DocAC;
      if (ac.status === 'firmado') throw new HttpError(409, 'El acta ya esta firmada');
      if (ac.firmaCliente?.firma) throw new HttpError(409, 'El acta ya tiene la firma del cliente');

      const now = Date.now();
      const pending = pendingSnap.docs.map((doc) => doc.data() as SignRequest);
      const current = activeRequest(pending, now);
      const token = current?.token ?? candidateToken;
      const createdAt = current?.createdAt ?? now;
      const expiresAt = current?.expiresAt ?? now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      for (const requestDoc of pendingSnap.docs) {
        if (requestDoc.id !== token) tx.update(requestDoc.ref, { status: 'cancelled' });
      }
      if (!current) {
        tx.create(db.doc(`signRequests/${token}`), {
          token,
          projectCode,
          status: 'pending',
          createdAt,
          createdBy: user.uid,
          expiresAt,
        } satisfies SignRequest);
      }
      // El token-capability nunca se replica en un documento legible por tecnicos.
      tx.update(acRef, {
        remoteSign: { createdAt, expiresAt },
        updatedAt: now,
        updatedBy: user.uid,
      });
      return { token, expiresAt };
    });

    return response({
      expiresAt: result.expiresAt,
      url: publicUrl(req, result.token),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// Recupera el link vigente solo para administradores. Mantiene funcionales los
// links heredados aunque el token ya no se replique en el documento AC.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { projectCode } = CreateSignRequestInput.parse({
      projectCode: req.nextUrl.searchParams.get('projectCode'),
    });
    const snap = await getAdminDb().collection('signRequests')
      .where('projectCode', '==', projectCode)
      .where('status', '==', 'pending')
      .get();
    const current = activeRequest(snap.docs.map((doc) => doc.data() as SignRequest), Date.now());
    if (!current) return response({ error: 'No hay un link de firma activo' }, 404);
    return response({ expiresAt: current.expiresAt, url: publicUrl(req, current.token) });
  } catch (err) {
    return errorResponse(err);
  }
}

// La cancelacion es transaccional e idempotente: reintentar DELETE deja todas
// las solicitudes pendientes canceladas y el AC sin el mirror de estado.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const { projectCode } = CreateSignRequestInput.parse(await req.json());
    const db = getAdminDb();

    await db.runTransaction(async (tx) => {
      const acRef = db.doc(`projects/${projectCode}/documents/AC`);
      const pendingQuery = db.collection('signRequests')
        .where('projectCode', '==', projectCode)
        .where('status', '==', 'pending');
      const acSnap = await tx.get(acRef);
      const pendingSnap = await tx.get(pendingQuery);
      if (!acSnap.exists) throw new HttpError(404, 'Acta no encontrada');

      pendingSnap.docs.forEach((requestDoc) => {
        tx.update(requestDoc.ref, { status: 'cancelled' });
      });
      tx.update(acRef, {
        remoteSign: FieldValue.delete(),
        updatedAt: Date.now(),
        updatedBy: user.uid,
      });
    });

    return response({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}