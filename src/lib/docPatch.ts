import type { AnyDoc } from '@/schemas';

const PROTECTED = new Set([
  'status', 'docType', 'projectCode', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
  'version', 'lockedSnapshot', 'lockedAt', 'lockedBy', 'reopenedAt', 'reopenedBy',
  'acceptedSnapshot', 'remoteSign', '__proto__', 'constructor', 'prototype',
]);

// Los formularios contienen metadatos sembrados antes de un cambio de usuario
// o reapertura. Ninguno debe volver a persistirse como contenido editable.
export function editableDocPatch(data: Partial<AnyDoc>): Partial<AnyDoc> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !PROTECTED.has(key)));
}

export function omitStatus(data: Partial<AnyDoc>): Partial<AnyDoc> {
  const { status: _status, ...rest } = data;
  return rest;
}
