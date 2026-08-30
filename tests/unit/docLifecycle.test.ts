import { describe, it, expect } from 'vitest';
import { isReopenable } from '@/lib/docLifecycle';

describe('isReopenable', () => {
  it('el acta FIRMADA no se puede reabrir', () => {
    expect(isReopenable('AC', 'firmado')).toBe(false);
  });

  it('un acta cerrada pero sin firmar todavía se puede reabrir', () => {
    expect(isReopenable('AC', 'completo')).toBe(true);
  });

  it('una RF firmada NO apta sigue siendo reabrible (circuito de corrección)', () => {
    expect(isReopenable('RF', 'firmado')).toBe(true);
  });

  it('los documentos completos se pueden reabrir', () => {
    for (const dt of ['VT', 'EP', 'OT', 'RF', 'FM'] as const) {
      expect(isReopenable(dt, 'completo')).toBe(true);
    }
  });

  it('un documento abierto no se "reabre"', () => {
    expect(isReopenable('VT', 'en_progreso')).toBe(false);
    expect(isReopenable('VT', 'vacio')).toBe(false);
    expect(isReopenable('VT', undefined)).toBe(false);
  });
});
