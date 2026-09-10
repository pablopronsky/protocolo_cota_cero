import { describe, it, expect } from 'vitest';
import { evaluateDeliverable, DRAFT_NOTICE } from '@/lib/deliverable';
import type { AnyDoc, DocType } from '@/schemas';

type Docs = Partial<Record<DocType, AnyDoc>>;

function rf(over: Record<string, unknown> = {}): AnyDoc {
  return { docType: 'RF', status: 'firmado', aptoEntrega: true, ...over } as unknown as AnyDoc;
}
function ac(over: Record<string, unknown> = {}): AnyDoc {
  return { docType: 'AC', status: 'firmado', ...over } as unknown as AnyDoc;
}

const prior: Docs = { VT: { status: 'completo' } as AnyDoc, EP: { status: 'completo' } as AnyDoc, OT: { status: 'completo' } as AnyDoc };

describe('evaluateDeliverable', () => {
  it('es final con RF cerrada y apta + AC firmada', () => {
    const gate = evaluateDeliverable({ ...prior, RF: rf(), AC: ac() } as Docs);
    expect(gate.final).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it('NO es final si el acta no está firmada', () => {
    for (const status of ['vacio', 'en_progreso', 'completo']) {
      const gate = evaluateDeliverable({ ...prior, RF: rf(), AC: ac({ status }) } as Docs);
      expect(gate.final).toBe(false);
      expect(gate.reasons.join(' ')).toContain('acta de conformidad');
    }
  });

  it('NO es final si la RF no marcó la obra como apta', () => {
    const gate = evaluateDeliverable({ ...prior, RF: rf({ aptoEntrega: false }), AC: ac() } as Docs);
    expect(gate.final).toBe(false);
    expect(gate.reasons.join(' ')).toContain('apta para entrega');
  });

  it('NO es final si aptoEntrega falta (undefined no es true)', () => {
    const gate = evaluateDeliverable({ ...prior, RF: rf({ aptoEntrega: undefined }), AC: ac() } as Docs);
    expect(gate.final).toBe(false);
  });

  it('NO es final si la RF está abierta aunque diga apta', () => {
    const gate = evaluateDeliverable({ ...prior, RF: rf({ status: 'en_progreso' }), AC: ac() } as Docs);
    expect(gate.final).toBe(false);
    expect(gate.reasons.join(' ')).toContain('todavía no está cerrada');
  });

  it('NO es final si faltan documentos', () => {
    expect(evaluateDeliverable({} as Docs).final).toBe(false);
    expect(evaluateDeliverable({ AC: ac() } as Docs).final).toBe(false);
    expect(evaluateDeliverable({ ...prior, RF: rf() } as Docs).final).toBe(false);
  });

  it('ignora project.docStatus: solo mira los documentos reales', () => {
    // Un docStatus mentiroso no puede colarse: la función ni siquiera lo recibe.
    const gate = evaluateDeliverable({
      ...prior, RF: rf({ status: 'en_progreso', aptoEntrega: false }),
      AC: ac({ status: 'vacio' }),
    } as Docs);
    expect(gate.final).toBe(false);
    expect(gate.reasons).toHaveLength(3);
  });

  it('el rótulo de borrador es inequívoco y no dice "apto"', () => {
    expect(DRAFT_NOTICE).toBe('BORRADOR — NO VÁLIDO PARA ENTREGA');
    expect(DRAFT_NOTICE.toLowerCase()).not.toContain('apto para entrega');
  });
});
