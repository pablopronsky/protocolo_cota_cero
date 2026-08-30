import { describe, it, expect } from 'vitest';
import {
  collectPhotoRefs, pendingPhotoRefs, pendingUploadsError,
} from '@/lib/pendingUploads';
import type { PhotoRef } from '@/schemas';

function photo(id: string, pending?: boolean): PhotoRef {
  return {
    id,
    storagePath: `projects/COTA-2026-0001/VT/${id}.jpg`,
    takenAt: 1000,
    uploadedBy: 'tec-uid',
    ...(pending === undefined ? {} : { pending }),
  };
}

describe('collectPhotoRefs', () => {
  it('encuentra fotos dentro de un array (VT/RF)', () => {
    const doc = { registroFotografico: [photo('a'), photo('b')] };
    expect(collectPhotoRefs(doc).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('encuentra firmas anidadas como campo escalar (AC)', () => {
    const doc = {
      firmaCliente: { nombreAclaratorio: 'X', dni: '1', firma: photo('cli') },
      firmaCotaCero: { uid: 'u', firma: photo('cc') },
    };
    expect(collectPhotoRefs(doc).map((p) => p.id).sort()).toEqual(['cc', 'cli']);
  });

  it('no cuenta dos veces la misma foto repetida en el lockedSnapshot', () => {
    const p = photo('a', true);
    const payload = {
      extra: { registroFotografico: [p] },
      revisionSnapshot: { registroFotografico: [p] },
    };
    expect(collectPhotoRefs(payload)).toHaveLength(1);
  });

  it('dedupe por id aunque sean objetos distintos', () => {
    const payload = { a: [photo('x')], b: { firma: photo('x') } };
    expect(collectPhotoRefs(payload)).toHaveLength(1);
  });

  it('ignora firmas nulas y campos que no son PhotoRef', () => {
    const doc = {
      firmaCliente: { nombreAclaratorio: 'X', dni: '1', firma: null },
      ambientes: [{ nombre: 'living', m2: 20 }],
      observaciones: 'texto',
      version: 3,
    };
    expect(collectPhotoRefs(doc)).toEqual([]);
  });

  it('no entra en bucle con referencias cíclicas', () => {
    const doc: Record<string, unknown> = { registroFotografico: [photo('a')] };
    doc.self = doc;
    expect(collectPhotoRefs(doc)).toHaveLength(1);
  });
});

describe('pendingPhotoRefs', () => {
  it('solo devuelve las que tienen pending === true', () => {
    const doc = {
      registroFotografico: [photo('subida', false), photo('encolada', true), photo('sinflag')],
    };
    expect(pendingPhotoRefs(doc).map((p) => p.id)).toEqual(['encolada']);
  });
});

describe('pendingUploadsError', () => {
  it('devuelve null cuando todo está sincronizado', () => {
    const doc = { registroFotografico: [photo('a', false), photo('b')] };
    expect(pendingUploadsError(doc)).toBeNull();
  });

  it('bloquea con una sola imagen pendiente, en singular', () => {
    const doc = { registroFotografico: [photo('a', true)] };
    expect(pendingUploadsError(doc))
      .toBe('Esperá a que terminen de subir 1 imagen antes de cerrar el documento.');
  });

  it('bloquea con varias imágenes pendientes, en plural', () => {
    const doc = { registroFotografico: [photo('a', true), photo('b', true), photo('c', false)] };
    expect(pendingUploadsError(doc))
      .toBe('Esperá a que terminen de subir 2 imágenes antes de cerrar el documento.');
  });

  it('bloquea el cierre del acta si la firma del cliente sigue encolada', () => {
    const ac = {
      firmaCliente: { nombreAclaratorio: 'Juan', dni: '30111222', firma: photo('firma-cli', true) },
      firmaCotaCero: { uid: 'admin-uid', firma: photo('firma-cc', false) },
    };
    expect(pendingUploadsError(ac))
      .toBe('Esperá a que terminen de subir 1 imagen antes de cerrar el documento.');
  });

  it('cuenta una sola vez la foto pendiente que ya está en el snapshot', () => {
    const p = photo('a', true);
    expect(pendingUploadsError({ extra: { fotos: [p] }, revisionSnapshot: { fotos: [p] } }))
      .toBe('Esperá a que terminen de subir 1 imagen antes de cerrar el documento.');
  });
});

// #P1 — Cerrar el documento con un adjunto que falló de forma permanente.
//
// Sin el estado de la cola el mensaje decía "esperá a que termine de subir",
// que para una imagen ya rechazada por Storage es una espera infinita.
describe('cierre de documento con adjuntos fallados', () => {
  const doc = {
    registroFotografico: [
      { id: 'ok-1', storagePath: 'p/1.jpg', takenAt: 1, uploadedBy: 'u', pending: false },
      { id: 'roto', storagePath: 'p/2.jpg', takenAt: 1, uploadedBy: 'u', pending: true },
    ],
  };

  it('sin estado de cola conserva el mensaje de espera', () => {
    expect(pendingUploadsError(doc)).toMatch(/Esperá a que terminen de subir/);
  });

  it('con la foto marcada en error pide reintentar o eliminar', () => {
    const queue = new Map([['roto', { state: 'error' as const }]]);
    expect(pendingUploadsError(doc, queue)).toMatch(/no se pudieron subir/);
    expect(pendingUploadsError(doc, queue)).toMatch(/Reintentá o eliminalas/);
  });

  it('con la foto todavía en camino mantiene el mensaje de espera', () => {
    const queue = new Map([['roto', { state: 'pending' as const }]]);
    expect(pendingUploadsError(doc, queue)).toMatch(/Esperá a que terminen de subir/);
  });

  it('sin adjuntos pendientes no bloquea, haya o no cola', () => {
    const clean = { registroFotografico: [doc.registroFotografico[0]] };
    expect(pendingUploadsError(clean, new Map())).toBeNull();
  });
});
