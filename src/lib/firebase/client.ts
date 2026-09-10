import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { clientEnv } from '@/lib/env';

const firebaseConfig = {
  apiKey:            clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1';
if (useEmulators && firebaseConfig.projectId !== 'cotacero-test') throw new Error('El modo de prueba requiere cotacero-test.');

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getFirebaseApp(), {
      // Muchos campos del modelo son opcionales (email, m2Estimados, metodoNivelacion…).
      // Sin esto, cualquier escritura con un opcional sin valor crashea con
      // "Unsupported field value: undefined". Los dropea en silencio.
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 18080);
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
    if (useEmulators) connectStorageEmulator(storage, '127.0.0.1', 19199);
  }
  return storage;
}
