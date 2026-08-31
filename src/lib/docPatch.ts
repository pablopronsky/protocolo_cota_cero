import type { AnyDoc } from '@/schemas';

// `data` suele venir de `watch()` de react-hook-form, que devuelve TODOS los
// valores del form — incluido `status`, sembrado una sola vez al montar (ver
// useDoc.ts) y nunca vuelto a sincronizar mientras el componente sigue vivo.
// Si un reopen u otro cambio externo mueve el estado real mientras el form
// sigue montado, ese `status` congelado viaja en `data`; un merge sin filtrar
// lo pisaría de vuelta. `status` solo lo cambian setDocStatus/reopenDoc
// (lib/repo/projects.ts), nunca un autosave de campo.
export function omitStatus(data: Partial<AnyDoc>): Partial<AnyDoc> {
  const { status: _status, ...rest } = data as Partial<AnyDoc> & { status?: unknown };
  return rest;
}
