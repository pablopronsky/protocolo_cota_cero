import type { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';

// Error con status HTTP, para que las routes devuelvan el código correcto
// (401/403) en vez de un 500 genérico.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface AuthUser {
  uid: string;
  role: 'admin' | 'tecnico' | undefined;
}

// Verifica el ID token del header Authorization: Bearer <token>.
// La identidad SIEMPRE sale del token verificado, nunca del body.
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const authz = req.headers.get('authorization');
  if (!authz?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Falta token de autenticación');
  }
  const token = authz.slice('Bearer '.length).trim();
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, role: decoded.role as AuthUser['role'] };
  } catch (err) {
    // El motivo real (aud mismatch, credencial rota, red) solo se ve en los
    // logs del server; al cliente siempre le llega el 401 genérico.
    console.error('[requireUser] verifyIdToken failed:', err);
    throw new HttpError(401, 'Token inválido o expirado');
  }
}

// Igual que requireUser pero exige rol admin (crear/duplicar proyectos).
export async function requireAdmin(req: NextRequest): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'Requiere rol admin');
  return user;
}
