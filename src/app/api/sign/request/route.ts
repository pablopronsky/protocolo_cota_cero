import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin, HttpError } from '@/lib/auth/requireAuth';
import { CreateSignRequestInput } from '@/schemas/inputs';
import type { DocAC, SignRequest } from '@/schemas';

const EXPIRY_DAYS = 7;

// Crea una solicitud de firma remota del acta: un token único con vencimiento,
// espejado en el doc AC (remoteSign) para que el form la muestre en vivo.
// Un solo link activo por acta: los pendientes anteriores se cancelan.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const { projectCode } = CreateSignRequestInput.parse(await req.json());
    const db = getAdminDb();

    const acRef = db.doc(`projects/${projectCode}/documents/AC`);
    const acSnap = await acRef.get();
    if (!acSnap.exists) {
      return NextResponse.json({ error: 'Acta no encontrada' }, { status: 404 });
    }
    const ac = acSnap.data() as DocAC;
    if (ac.status === 'firmado') {
      return NextResponse.json({ error: 'El acta ya está firmada' }, { status: 409 });
    }
    if (ac.firmaCliente?.firma) {
      return NextResponse.json({ error: 'El acta ya tiene la firma del cliente' }, { status: 409 });
    }

    const prev = await db.collection('signRequests')
      .where('projectCode', '==', projectCode)
      .where('status', '==', 'pending')
      .get();

    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const batch = db.batch();
    prev.docs.forEach((d) => batch.update(d.ref, { status: 'cancelled' }));
    batch.set(db.doc(`signRequests/${token}`), {
      token, projectCode, status: 'pending', createdAt: now, createdBy: user.uid, expiresAt,
    } satisfies SignRequest);
    batch.update(acRef, { remoteSign: { token, createdAt: now, expiresAt }, updatedAt: now });
    await batch.commit();

    return NextResponse.json({ token, expiresAt, url: `${req.nextUrl.origin}/firmar/${token}` });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[sign request create]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Cancela la solicitud de firma activa del acta (invalida el link enviado).
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { projectCode } = CreateSignRequestInput.parse(await req.json());
    const db = getAdminDb();

    const acRef = db.doc(`projects/${projectCode}/documents/AC`);
    const acSnap = await acRef.get();
    if (!acSnap.exists) {
      return NextResponse.json({ error: 'Acta no encontrada' }, { status: 404 });
    }
    const ac = acSnap.data() as DocAC;
    if (!ac.remoteSign?.token) {
      return NextResponse.json({ error: 'No hay un link de firma activo' }, { status: 404 });
    }

    const batch = db.batch();
    // set+merge: no falla si el doc de la solicitud no existe (estado raro).
    batch.set(db.doc(`signRequests/${ac.remoteSign.token}`), { status: 'cancelled' }, { merge: true });
    batch.update(acRef, { remoteSign: FieldValue.delete(), updatedAt: Date.now() });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[sign request cancel]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
