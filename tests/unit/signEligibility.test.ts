import { describe, it, expect } from 'vitest';
import { signEligibilityError } from '@/lib/signEligibility';
import type { AnyDoc, DocType, PhotoRef, Project } from '@/schemas';

type Docs = Partial<Record<DocType, AnyDoc>>;

const FIRMA: PhotoRef = {
  id: 'f1', storagePath: 'projects/COTA-2026-0001/AC/f1.jpg',
  takenAt: 1, uploadedBy: 'admin-uid',
};

function project(status: Project['status'] = 'en_curso') {
  return { status } as Pick<Project, 'status'>;
}

function docs(over: Record<string, Record<string, unknown>> = {}): Docs {
  const base: Record<string, Record<string, unknown>> = {
    VT: { docType: 'VT', status: 'completo' },
    EP: { docType: 'EP', status: 'completo' },
    OT: { docType: 'OT', status: 'completo' },
    RF: { docType: 'RF', status: 'firmado', aptoEntrega: true },
    AC: { docType: 'AC', status: 'en_progreso', firmaCliente: { firma: null } },
  };
  const merged: Docs = {};
  for (const [k, v] of Object.entries(base)) {
    if (over[k] === null as unknown as Record<string, unknown>) continue;
    merged[k as DocType] = { ...v, ...(over[k] ?? {}) } as unknown as AnyDoc;
  }
  return merged;
}

describe('signEligibilityError', () => {
  it('permite firmar con el protocolo completo y RF apta', () => {
    expect(signEligibilityError(project(), docs())).toBeNull();
  });

  it('rechaza si la obra está archivada', () => {
    expect(signEligibilityError(project('archivado'), docs()))
      .toContain('archivada');
  });

  it('rechaza si la RF no está apta para entrega', () => {
    expect(signEligibilityError(project(), docs({ RF: { aptoEntrega: false } })))
      .toContain('NO apta para entrega');
  });

  it('rechaza si la RF está abierta', () => {
    expect(signEligibilityError(project(), docs({ RF: { status: 'en_progreso' } })))
      .toContain('Completá RF');
  });

  it('rechaza si algún documento previo quedó abierto', () => {
    for (const dt of ['VT', 'EP', 'OT'] as const) {
      expect(signEligibilityError(project(), docs({ [dt]: { status: 'en_progreso' } })))
        .toContain(`Completá ${dt}`);
    }
  });

  it('rechaza si falta un documento previo', () => {
    const sinOT = docs();
    delete sinOT.OT;
    expect(signEligibilityError(project(), sinOT)).toContain('Falta el documento OT');
  });

  it('rechaza si el acta ya está firmada', () => {
    expect(signEligibilityError(project(), docs({ AC: { status: 'firmado' } })))
      .toContain('ya está firmada');
  });

  it('rechaza si el acta ya tiene la firma del cliente', () => {
    expect(signEligibilityError(project(), docs({ AC: { firmaCliente: { firma: FIRMA } } })))
      .toContain('ya tiene la firma del cliente');
  });

  it('rechaza si no se pudo leer el proyecto', () => {
    expect(signEligibilityError(null, docs())).toContain('No se pudo verificar');
  });

  it('rechaza si falta el acta', () => {
    const sinAC = docs();
    delete sinAC.AC;
    expect(signEligibilityError(project(), sinAC)).toContain('Falta el acta');
  });
});
