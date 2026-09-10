import { describe, it, expect } from 'vitest';
import { sequencingError } from '@/lib/sequencing';
import type { DocStatus, DocRF } from '@/schemas';

type DocStatusMap = Partial<Record<string, DocStatus>>;

const EMPTY: DocStatusMap = {
  VT: 'vacio', EP: 'vacio', OT: 'vacio', RF: 'vacio', AC: 'vacio', FM: 'vacio',
};

const ALL_COMPLETE: DocStatusMap = {
  VT: 'completo', EP: 'completo', OT: 'completo',
  RF: 'completo', AC: 'completo', FM: 'completo',
};

// â”€â”€ Non-closing transitions (autosave, draft) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Non-closing transitions always allowed', () => {
  it('vacio â†’ en_progreso is always ok', () => {
    expect(sequencingError('EP', 'en_progreso', EMPTY)).toBeNull();
  });

  it('vacio â†’ en_progreso ok even with empty protocol', () => {
    expect(sequencingError('AC', 'en_progreso', EMPTY)).toBeNull();
  });

  it('en_progreso â†’ en_progreso ok', () => {
    expect(sequencingError('RF', 'en_progreso', { ...EMPTY, RF: 'en_progreso' })).toBeNull();
  });
});

// â”€â”€ VT (no predecessor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('VT sequencing', () => {
  it('can close VT regardless of prior state', () => {
    expect(sequencingError('VT', 'completo', EMPTY)).toBeNull();
  });

  it('can sign VT regardless of prior state', () => {
    expect(sequencingError('VT', 'firmado', EMPTY)).toBeNull();
  });
});

// â”€â”€ EP requires VT closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('EP sequencing', () => {
  it('cannot close EP if VT is vacio', () => {
    expect(sequencingError('EP', 'completo', EMPTY)).not.toBeNull();
  });

  it('cannot close EP if VT is en_progreso', () => {
    expect(sequencingError('EP', 'completo', { ...EMPTY, VT: 'en_progreso' })).not.toBeNull();
  });

  it('can close EP when VT is completo', () => {
    expect(sequencingError('EP', 'completo', { ...EMPTY, VT: 'completo' })).toBeNull();
  });

  it('can close EP when VT is firmado', () => {
    expect(sequencingError('EP', 'completo', { ...EMPTY, VT: 'firmado' })).toBeNull();
  });

  it('error message references the blocking doc', () => {
    const error = sequencingError('EP', 'completo', EMPTY);
    expect(error).toContain('VT');
  });
});

// â”€â”€ OT requires EP closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('OT sequencing', () => {
  it('cannot close OT if EP is not closed', () => {
    expect(sequencingError('OT', 'completo', { ...EMPTY, VT: 'completo' })).not.toBeNull();
  });

  it('can close OT when EP is completo', () => {
    expect(
      sequencingError('OT', 'completo', { ...EMPTY, VT: 'completo', EP: 'completo' }),
    ).toBeNull();
  });
});

// â”€â”€ RF requires OT closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('RF sequencing', () => {
  it('cannot close RF if OT is not closed', () => {
    expect(
      sequencingError('RF', 'completo', { ...EMPTY, VT: 'completo', EP: 'completo' }),
    ).not.toBeNull();
  });

  it('can close RF when OT is closed', () => {
    expect(
      sequencingError('RF', 'completo', { ...EMPTY, VT: 'completo', EP: 'completo', OT: 'completo' }),
    ).toBeNull();
  });
});

// â”€â”€ AC requires RF closed + aptoEntrega â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('AC sequencing', () => {
  const rfCompleto = { ...ALL_COMPLETE, AC: 'vacio', FM: 'vacio' } as DocStatusMap;

  it('cannot sign AC if RF is not closed', () => {
    expect(
      sequencingError('AC', 'firmado', { ...EMPTY, VT: 'completo', EP: 'completo', OT: 'completo' }),
    ).not.toBeNull();
  });

  it('can close AC without upstream when RF is closed', () => {
    // status completo (not firmado) â€” upstream not required
    expect(sequencingError('AC', 'completo', rfCompleto)).toBeNull();
  });

  it('cannot sign AC when RF marks obra NOT apto', () => {
    const rf = { aptoEntrega: false } as unknown as DocRF;
    expect(sequencingError('AC', 'firmado', rfCompleto, { VT: { status: 'completo' } as never, EP: { status: 'completo' } as never, OT: { status: 'completo' } as never, RF: { ...rf, status: 'completo' } })).not.toBeNull();
  });

  it('can sign AC when RF is apto', () => {
    const rf = { aptoEntrega: true } as unknown as DocRF;
    expect(sequencingError('AC', 'firmado', rfCompleto, { VT: { status: 'completo' } as never, EP: { status: 'completo' } as never, OT: { status: 'completo' } as never, RF: { ...rf, status: 'completo' } })).toBeNull();
  });

  it('error message for non-apto RF mentions RF', () => {
    const rf = { aptoEntrega: false } as unknown as DocRF;
    const error = sequencingError('AC', 'firmado', rfCompleto, { VT: { status: 'completo' } as never, EP: { status: 'completo' } as never, OT: { status: 'completo' } as never, RF: { ...rf, status: 'completo' } });
    expect(error).toContain('RF');
  });

  it('fails closed when RF upstream is missing', () => {
    const error = sequencingError('AC', 'firmado', rfCompleto, { VT: { status: 'completo' } as never, EP: { status: 'completo' } as never, OT: { status: 'completo' } as never });
    expect(error).not.toBeNull();
    expect(error).toContain('RF');
  });
});

// â”€â”€ FM requires AC closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('FM sequencing', () => {
  it('cannot close FM if AC is not closed', () => {
    expect(sequencingError('FM', 'completo', { ...ALL_COMPLETE, FM: 'vacio', AC: 'vacio' })).not.toBeNull();
  });

  it('can close FM when AC is firmado', () => {
    expect(sequencingError('FM', 'completo', ALL_COMPLETE)).toBeNull();
  });
});

// â”€â”€ Edge cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Edge cases', () => {
  it('handles vacio status map gracefully', () => {
    expect(sequencingError('VT', 'completo', {})).toBeNull();
  });

  it('returns null for any doc going to en_progreso regardless of state', () => {
    for (const docType of ['VT', 'EP', 'OT', 'RF', 'AC', 'FM'] as const) {
      expect(sequencingError(docType, 'en_progreso', EMPTY)).toBeNull();
    }
  });
});
