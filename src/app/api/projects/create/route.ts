import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin, HttpError } from '@/lib/auth/requireAuth';
import { CreateProjectInput } from '@/schemas/inputs';
import { buildCode } from '@/lib/ids';
import { DOC_ORDER } from '@/schemas';
import type { Project, DocType, DocStatus } from '@/schemas';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const data = CreateProjectInput.parse(await req.json());

    const db = getAdminDb();
    const year = new Date().getFullYear();
    const counterRef = db.doc(`counters/${year}`);

    let code: string;

    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastSeq = (counterSnap.exists ? counterSnap.data()?.lastSeq : 0) ?? 0;
      const nextSeq = lastSeq + 1;
      code = buildCode(year, nextSeq);

      const now = Date.now();
      const docStatus = Object.fromEntries(
        DOC_ORDER.map((dt) => [dt, 'vacio' as DocStatus]),
      ) as Record<DocType, DocStatus>;

      const project: Project = {
        code,
        year,
        seq: nextSeq,
        cliente: {
          nombre:   data.clienteNombre,
          contacto: data.clienteContacto,
          telefono: data.clienteTelefono,
          email:    data.clienteEmail,
          dni_cuit: data.clienteDniCuit,
        },
        domicilioObra: {
          calle:      data.calle,
          numero:     data.numero,
          localidad:  data.localidad,
          referencia: data.referencia,
        },
        tipoEspacio: data.tipoEspacio,
        modalidad:   data.modalidad,
        materialInstalado: {
          tipo:        data.materialTipo,
          descripcion: data.materialDescripcion,
          m2Estimados: data.materialM2,
        },
        presupuestoRef:       data.presupuestoRef,
        status:               'borrador',
        docStatus,
        // Identidad derivada del token verificado, no del body.
        responsableComercial: user.uid,
        responsableTecnico:   data.responsableTecnico ?? '',
        createdAt:   now,
        createdBy:   user.uid,
        updatedAt:   now,
        updatedBy:   user.uid,
      };

      // create() falla si el código ya existe: evita pisar un legajo por
      // desincronización del contador.
      tx.create(db.doc(`projects/${code}`), project);
      tx.set(counterRef, { lastSeq: nextSeq }, { merge: true });

      // Inicializar los 6 documentos vacíos
      for (const docType of DOC_ORDER) {
        tx.set(db.doc(`projects/${code}/documents/${docType}`), {
          docType,
          projectCode: code,
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

    return NextResponse.json({ code: code! });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    console.error('[create project]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
