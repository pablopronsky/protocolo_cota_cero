import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { clientEnv } from '@/lib/env';

const firebaseConfig = {
  apiKey:            clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};

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
  if (!auth) auth = getAuth(getFirebaseApp());
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
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}
