import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireUser, HttpError } from '@/lib/auth/requireAuth';
import type { AnyDoc, Client, DocType, Project } from '@/schemas';

const SAFE_CODE = /^[A-Za-z0-9_-]{1,64}$/;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

// El entregable se abre en una pestaña separada. La lectura se hace en el
// servidor para no depender del estado de la caché/persistencia de Firestore
// entre pestañas, pero sigue exigiendo una sesión válida del panel.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    await requireUser(req);

    const { code } = await params;
    if (!SAFE_CODE.test(code)) return response({ error: 'Código inválido' }, 400);

    const db = getAdminDb();
    const projectRef = db.doc(`projects/${code}`);
    const documentsRef = db.collection(`projects/${code}/documents`);
    const [projectSnap, documentsSnap] = await Promise.all([
      projectRef.get(),
      documentsRef.get(),
    ]);

    if (!projectSnap.exists) return response({ error: 'Obra no encontrada' }, 404);

    const project = projectSnap.data() as Project;
    const documents: Partial<Record<DocType, AnyDoc>> = {};
    for (const documentSnap of documentsSnap.docs) {
      documents[documentSnap.id as DocType] = documentSnap.data() as AnyDoc;
    }

    let client: Client | null = null;
    if (project.clienteId) {
      const clientSnap = await db.doc(`clients/${project.clienteId}`).get();
      if (clientSnap.exists) client = clientSnap.data() as Client;
    }

    return response({ project, documents, client });
  } catch (error) {
    if (error instanceof HttpError) {
      return response({ error: error.message }, error.status);
    }
    console.error('[deliverable]', error);
    return response({ error: 'No se pudo preparar el entregable' }, 500);
  }
}
