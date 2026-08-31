import { describe, it, expect } from 'vitest';
import { omitStatus } from '@/lib/docPatch';

describe('omitStatus', () => {
  it('quita status del patch, sin tocar el resto de los campos', () => {
    const patch = { observaciones: 'listo', status: 'firmado', m2Total: 18 };
    expect(omitStatus(patch as never)).toEqual({ observaciones: 'listo', m2Total: 18 });
  });

  it('no falla si el patch no trae status', () => {
    const patch = { observaciones: 'listo' };
    expect(omitStatus(patch as never)).toEqual({ observaciones: 'listo' });
  });

  it('protege contra un status congelado (stale) viajando en un autosave de campo', () => {
    // Escenario real: un form seedeado con status='vacio' al montar, luego
    // reabierto externamente a 'en_progreso' sin que el form se remonte — el
    // siguiente autosave de cualquier campo seguiría trayendo status:'vacio'
    // en `values`. omitStatus asegura que saveDoc() nunca pueda escribirlo.
    const staleAutosavePayload = { status: 'vacio', observaciones: 'nueva nota' };
    const sanitized = omitStatus(staleAutosavePayload as never);
    expect(sanitized).not.toHaveProperty('status');
    expect(sanitized).toEqual({ observaciones: 'nueva nota' });
  });
});
