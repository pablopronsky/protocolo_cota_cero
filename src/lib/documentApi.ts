import { getFirebaseAuth } from './firebase/client';

export async function documentAction(body: Record<string, unknown>): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sesión no disponible. Volvé a iniciar sesión.');
  const token = await user.getIdToken();
  const res = await fetch('/api/projects/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'No se pudo guardar el documento.'), {
    code: res.status >= 500 ? 'unavailable' : res.status === 401 ? 'unauthenticated' : 'permission-denied',
  });
}
