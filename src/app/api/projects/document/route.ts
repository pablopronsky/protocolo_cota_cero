import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, getAdminBucket } from '@/lib/firebase/admin';
import { requireUser, HttpError } from '@/lib/auth/requireAuth';
import { editableDocPatch } from '@/lib/docPatch';
import { buildLockedSnapshot } from '@/lib/inheritance';
import { sequencingError } from '@/lib/sequencing';
import { pendingUploadsError } from '@/lib/pendingUploads';
import { isReopenable } from '@/lib/docLifecycle';
import { documentStatuses, effectiveProjectStatus } from '@/lib/projectState';
import { DOC_ORDER, type Project, type AnyDoc, type DocAC, type DocType, type PhotoRef } from '@/schemas';

const Input = z.object({
  projectCode: z.string().regex(/^COTA-\d{4}-\d{4}$/),
  action: z.enum(['close', 'reopen', 'capture-signature', 'discard-signature', 'reconcile', 'archive', 'unarchive']),
  docType: z.enum(['VT', 'EP', 'OT', 'RF', 'AC', 'FM']).optional(),
  status: z.enum(['completo', 'firmado']).optional(),
  expectedVersion: z.number().int().min(0).optional(),
  values: z.record(z.string(), z.unknown()).default({}),
  signature: z.object({ id: z.string().uuid(), storagePath: z.string(), takenAt: z.number(), uploadedBy: z.string(), pending: z.literal(true) }).optional(),
});

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new HttpError(413, 'Documento demasiado grande.');
    const input = Input.parse(JSON.parse(raw));
    const db = getAdminDb();
    await db.runTransaction(async tx => {
      const projectRef = db.doc(`projects/${input.projectCode}`);
      const docsRef = projectRef.collection('documents');
      const [projectSnap, docsSnap] = await Promise.all([tx.get(projectRef), tx.get(docsRef)]);
      if (!projectSnap.exists) throw new HttpError(404, 'Obra no encontrada.');
      const project = projectSnap.data() as Project;
      const docs: Partial<Record<DocType, AnyDoc>> = {};
      docsSnap.forEach(d => { docs[d.id as DocType] = d.data() as AnyDoc; });
      const now = Date.now();
      const mirror = (archived = project.status === 'archivado') => ({
        docStatus: documentStatuses(docs), status: effectiveProjectStatus(docs, archived), updatedAt: now, updatedBy: actor.uid,
      });
      if (input.action === 'reconcile') {
        // No se inventan slots ante un legajo incompleto/corrupto.
        if (!DOC_ORDER.every(type => docs[type])) throw new HttpError(409, 'El legajo está incompleto.');
        const expected = mirror();
        if (project.status !== expected.status || DOC_ORDER.some(type => project.docStatus[type] !== expected.docStatus[type])) tx.update(projectRef, expected);
        return;
      }
      if (input.action === 'archive' || input.action === 'unarchive') {
        if (actor.role !== 'admin') throw new HttpError(403, 'Requiere administrador.');
        tx.update(projectRef, mirror(input.action === 'archive'));
        return;
      }
      if (project.status === 'archivado') throw new HttpError(409, 'La obra está archivada.');
      const type = input.docType;
      if (!type || !docs[type]) throw new HttpError(404, 'Documento no encontrado.');
      if ((type === 'AC' || type === 'FM' || input.action !== 'close') && actor.role !== 'admin') throw new HttpError(403, 'Requiere administrador.');
      const current = docs[type]!;
      const ac = current as DocAC;
      const ref = docsRef.doc(type);
      const revision = (action: string, snapshot: unknown, version: number) => {
        tx.create(projectRef.collection('revisions').doc(), {
          projectCode: input.projectCode, docType: type, action, snapshot, version, by: actor.uid, at: FieldValue.serverTimestamp(),
        });
      };
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) throw new HttpError(409, 'El documento cambió. Recargá antes de continuar.');
      const closed = current.status === 'completo' || current.status === 'firmado';
      if (input.action === 'reopen') {
        if (!isReopenable(type, current.status)) throw new HttpError(409, 'Este documento no se puede reabrir.');
        if (docs.AC?.status === 'firmado' && type !== 'FM') throw new HttpError(409, 'El acta firmada congela el legajo técnico.');
        const next = { ...current, status: 'en_progreso' as const, lockedSnapshot: null, lockedAt: null, lockedBy: null,
          version: current.version + 1, updatedAt: now, updatedBy: actor.uid, reopenedAt: now, reopenedBy: actor.uid };
        tx.set(ref, next);
        revision('en_progreso', current, next.version);
        docs[type] = next;
        tx.update(projectRef, mirror());
        return;
      }
      if (closed) throw new HttpError(409, 'El documento ya está cerrado.');
      if (input.action === 'discard-signature') {
        if (type !== 'AC') throw new HttpError(400, 'Solo el acta admite esta operación.');
        if (!ac.firmaCliente?.firma) return;
        revision('firma_descartada', current, current.version);
        tx.update(ref, { 'firmaCliente.firma': null, acceptedSnapshot: FieldValue.delete(), updatedAt: now, updatedBy: actor.uid });
        return;
      }
      if (input.action === 'capture-signature') {
        const signature = input.signature;
        if (type !== 'AC' || !signature || signature.storagePath !== `projects/${input.projectCode}/AC/${signature.id}.jpg` || signature.uploadedBy !== actor.uid) throw new HttpError(400, 'Firma inválida.');
        if (ac.firmaCliente?.firma) {
          if (ac.firmaCliente.firma.id === signature.id) return; // reintento de la misma cola
          throw new HttpError(409, 'El acta ya tiene una firma. Descartala antes de reemplazarla.');
        }
        const patch = editableDocPatch(input.values) as Partial<DocAC>;
        const next = { ...current, fechaActa: patch.fechaActa ?? ac.fechaActa ?? '', conformidad: patch.conformidad ?? ac.conformidad ?? '',
          observacionesCliente: patch.observacionesCliente ?? ac.observacionesCliente ?? '',
          firmaCliente: { nombreAclaratorio: patch.firmaCliente?.nombreAclaratorio ?? ac.firmaCliente?.nombreAclaratorio ?? '',
            dni: patch.firmaCliente?.dni ?? ac.firmaCliente?.dni ?? '', firma: signature as PhotoRef },
          status: 'en_progreso' as const, updatedAt: now, updatedBy: actor.uid };
        tx.set(ref, { ...next, acceptedSnapshot: buildLockedSnapshot(project, docs, next as AnyDoc) });
        docs.AC = next as AnyDoc;
        tx.update(projectRef, mirror());
        revision('firma_capturada', next, current.version);
        return;
      }
      if (!input.status) throw new HttpError(400, 'Falta el estado de cierre.');
      if (type === 'AC' && input.status !== 'firmado') throw new HttpError(400, 'El cierre del acta debe ser firmado.');
      const sequence = sequencingError(type, input.status, documentStatuses(docs), docs);
      if (sequence) throw new HttpError(409, sequence);
      const patch = editableDocPatch(input.values) as Record<string, unknown>;
      // Las fotos y firmas son autoritativas en Firestore, nunca en el form.
      delete patch.registroFotografico; delete patch.firmaCliente; delete patch.firmaCotaCero;
      const next = { ...current, ...(type === 'AC' && ac.firmaCliente?.firma ? {} : patch),
        status: input.status, version: current.version + 1, lockedAt: now, lockedBy: actor.uid, updatedAt: now, updatedBy: actor.uid } as AnyDoc;
      const { acceptedSnapshot: accepted, ...withoutAccepted } = next as AnyDoc & { acceptedSnapshot?: Record<string, unknown> };
      const pending = pendingUploadsError({ ...withoutAccepted, lockedSnapshot: null });
      if (pending) throw new HttpError(409, pending);
      if (type === 'AC') {
        if (!ac.fechaActa || !ac.conformidad || !ac.firmaCliente?.nombreAclaratorio?.trim() || !ac.firmaCliente?.dni?.trim()) throw new HttpError(400, 'Completá fecha, conformidad y datos del cliente.');
        const signature = ac.firmaCliente?.firma;
        if (!signature || signature.pending || !signature.storagePath.startsWith(`projects/${input.projectCode}/AC/`) || signature.storagePath.split('/').length !== 4) throw new HttpError(409, 'Falta una firma subida del cliente.');
        const [exists] = await getAdminBucket().file(signature.storagePath).exists();
        if (!exists) throw new HttpError(409, 'El archivo de firma todavía no está disponible.');
      }
      const snapshot = buildLockedSnapshot(project, docs, withoutAccepted as AnyDoc);
      // Los datos de obra aceptados no se recalculan al cerrar administrativamente.
      if (type === 'AC' && accepted) {
        for (const key of ['cliente', 'domicilioObra', 'obraEjecutada']) if (key in accepted) snapshot[key] = accepted[key];
      }
      next.lockedSnapshot = snapshot;
      tx.set(ref, next);
      revision(input.status, snapshot, next.version);
      docs[type] = next;
      tx.update(projectRef, mirror());
    });
    return response({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return response({ error: error.message }, error.status);
    if (error instanceof ZodError || error instanceof SyntaxError) return response({ error: 'Datos inválidos.' }, 400);
    console.error('[document lifecycle]', error);
    return response({ error: 'No se pudo completar la operación.' }, 500);
  }
}
