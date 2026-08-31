import { describe, it, expect } from 'vitest';
import { buildDocRows, isLegajoFinal, isDocLocked } from '@/lib/legajo';
import type { AnyDoc, DocType } from '@/schemas';

type Docs = Partial<Record<DocType, AnyDoc>>;

function d(docType: DocType, status: string, over: Record<string, unknown> = {}): AnyDoc {
  return { docType, status, version: 1, updatedAt: 1000, ...over } as unknown as AnyDoc;
}

// Legajo completo y real: los 6 documentos cerrados, RF firmado y AC firmado.
function realFinalDocs(): Docs {
  return {
    VT: d('VT', 'completo'),
    EP: d('EP', 'completo'),
    OT: d('OT', 'completo'),
    RF: d('RF', 'firmado'),
    AC: d('AC', 'firmado'),
    FM: d('FM', 'completo'),
  };
}

describe('buildDocRows', () => {
  it('deriva el status de cada fila del documento real, no de un mirror', () => {
    // buildDocRows no recibe project.docStatus en absoluto: no hay forma de
    // que un mirror mentiroso se cuele en el legajo impreso.
    const rows = buildDocRows(realFinalDocs());
    expect(rows.find((r) => r.docType === 'AC')?.status).toBe('firmado');
    expect(rows.every((r) => r.locked)).toBe(true);
  });

  it('un documento inexistente cuenta como vacío, nunca como final', () => {
    const rows = buildDocRows({});
    expect(rows.every((r) => r.status === 'vacio' && !r.locked)).toBe(true);
  });
});

describe('isLegajoFinal — caso COTA-2026-0002 (mirror final, documentos reales no)', () => {
  it('NO es final si AC/EP/FM reales siguen en_progreso, aunque el mirror dijera todo firmado/completo', () => {
    // Reproduce exactamente la divergencia encontrada en producción:
    // project.docStatus decía VT/OT completo, RF firmado, AC firmado, EP/FM
    // completo — pero documents/AC|EP|FM seguían en_progreso de verdad.
    const docsReales: Docs = {
      VT: d('VT', 'completo'),
      EP: d('EP', 'en_progreso'),
      OT: d('OT', 'completo'),
      RF: d('RF', 'firmado'),
      AC: d('AC', 'en_progreso'),
      FM: d('FM', 'en_progreso'),
    };
    const rows = buildDocRows(docsReales);
    expect(isLegajoFinal(rows)).toBe(false);
  });

  it('ES final cuando los documentos reales están todos cerrados, RF firmado y AC firmado', () => {
    const rows = buildDocRows(realFinalDocs());
    expect(isLegajoFinal(rows)).toBe(true);
  });

  it('NO es final si falta un docType (legajo incompleto)', () => {
    const { AC: _AC, ...rest } = realFinalDocs();
    const rows = buildDocRows(rest);
    expect(isLegajoFinal(rows)).toBe(false);
  });

  it('NO es final si AC está completo pero no firmado', () => {
    const rows = buildDocRows({ ...realFinalDocs(), AC: d('AC', 'completo') });
    expect(isLegajoFinal(rows)).toBe(false);
  });
});

describe('isDocLocked', () => {
  it('solo completo y firmado cuentan como cerrados', () => {
    expect(isDocLocked('completo')).toBe(true);
    expect(isDocLocked('firmado')).toBe(true);
    expect(isDocLocked('en_progreso')).toBe(false);
    expect(isDocLocked('vacio')).toBe(false);
    expect(isDocLocked(undefined)).toBe(false);
  });
});
