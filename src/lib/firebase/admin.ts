import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

// La clave llega en formatos distintos según dónde se configure: el loader de
// .env.local de Next quita las comillas envolventes, pero el dashboard de
// Vercel guarda el valor pegado tal cual (comillas y \n escapados incluidos).
// Sin esto, el PEM no parsea en prod: ERR_OSSL_UNSUPPORTED en cert().
function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

// Variante a prueba de dashboards: la clave como base64 de UNA sola línea
// (FIREBASE_ADMIN_PRIVATE_KEY_B64). Un valor de una línea no puede perder
// saltos ni ganar comillas al pegarlo. Tiene prioridad sobre el PEM crudo.
function resolvePrivateKey(): string | undefined {
  const b64 = process.env.FIREBASE_ADMIN_PRIVATE_KEY_B64;
  if (b64) {
    const decoded = Buffer.from(b64.trim(), 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) return decoded;
  }
  return normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
}

function getAdminApp(): App {
  if (getApps().length === 0) {
    adminApp = initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey:  resolvePrivateKey(),
      }),
    });
  } else {
    adminApp = getApps()[0];
  }
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
    // Mismo comportamiento que el cliente: omite campos undefined en vez de
    // lanzar "Cannot use undefined as a Firestore value". Debe llamarse antes
    // de cualquier uso de la instancia.
    adminDb.settings({ ignoreUndefinedProperties: true });
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

// Mismo bucket que usa el cliente (la env NEXT_PUBLIC_* también está disponible
// en el server). Lo usa /api/sign para subir la firma remota del cliente.
export function getAdminBucket() {
  return getStorage(getAdminApp()).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
}
