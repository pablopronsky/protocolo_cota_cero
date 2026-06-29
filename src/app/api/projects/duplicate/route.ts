import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin, HttpError } from '@/lib/auth/requireAuth';
import { DuplicateProjectInput } from '@/schemas/inputs';
import { buildCode } from '@/lib/ids';
import { DOC_ORDER } from '@/schemas';
import type { Project, DocType, DocStatus, AnyDoc } from '@/schemas';

// Campos que se resetean al duplicar (datos del proyecto anterior)
const FIELDS_TO_RESET: Partial<Record<DocType, string[]>> = {
  VT: ['fechaVisita', 'tecnico', 'ambientes', 'm2Total', 'humedad', 'nivelacion',
       'registroFotografico', 'dictamen', 'dictamenDetalle', 'observaciones'],
  EP: ['desnivelMm', 'humedadPct', 'espesorMm', 'reparacionesPrevias',
       'tiemposSecadoEstimados', 'observaciones'],
  OT: ['equipo', 'fechaInicio', 'fechaFinEstimada', 'alcance',
       'registroIncidencias', 'observaciones'],
  RF: ['cumpleEP', 'desviosEP', 'cumpleOT', 'desviosOT', 'checklistCalidad',
       'registroFotografico', 'observaciones', 'aptoEntrega', 'revisadoPor', 'fechaRevision'],
  AC: ['fechaActa', 'conformidad', 'observacionesCliente', 'firmaCliente', 'firmaCotaCero'],
  FM: ['observaciones'],
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const { originCode } = DuplicateProjectInput.parse(await req.json());

    const db = getAdminDb();
    const year = new Date().getFullYear();
    const counterRef = db.doc(`counters/${year}`);
    let newCode: string;

    // Leer origen antes de la transacción
    const originSnap = await db.doc(`projects/${originCode}`).get();
    if (!originSnap.exists) return NextResponse.json({ error: 'Proyecto origen no encontrado' }, { status: 404 });
    const origin = originSnap.data() as Project;

    const docSnaps = await Promise.all(
      DOC_ORDER.map((dt) => db.doc(`projects/${originCode}/documents/${dt}`).get()),
    );
    const originDocs = Object.fromEntries(
      DOC_ORDER.map((dt, i) => [dt, docSnaps[i].exists ? docSnaps[i].data() as AnyDoc : null]),
    ) as Partial<Record<DocType, AnyDoc>>;

    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastSeq = (counterSnap.exists ? counterSnap.data()?.lastSeq : 0) ?? 0;
      const nextSeq = lastSeq + 1;
      newCode = buildCode(year, nextSeq);
      const now = Date.now();

      const docStatus = Object.fromEntries(
        DOC_ORDER.map((dt) => [dt, 'vacio' as DocStatus]),
      ) as Record<DocType, DocStatus>;

      const newProject: Project = {
        ...origin,
        code: newCode,
        year,
        seq: nextSeq,
        status: 'borrador',
        docStatus,
        duplicatedFrom: originCode,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      };

      tx.create(db.doc(`projects/${newCode}`), newProject);
      tx.set(counterRef, { lastSeq: nextSeq }, { merge: true });

      for (const docType of DOC_ORDER) {
        const src = originDocs[docType];
        const resetFields = FIELDS_TO_RESET[docType] ?? [];

        // Construye el doc copiado sin los campos reset
        const copiedDoc: Record<string, unknown> = src ? { ...src } : {};
        for (const f of resetFields) delete copiedDoc[f];

        tx.set(db.doc(`projects/${newCode}/documents/${docType}`), {
          ...copiedDoc,
          docType,
          projectCode: newCode,
          status: 'vacio',
          lockedSnapshot: null,
          lockedAt: null,
          lockedBy: null,
          createdAt: now,
          updatedAt: now,
          updatedBy: user.uid,
          version: 0,
        });
      }
    });

    return NextResponse.json({ code: newCode! });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[duplicate project]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
