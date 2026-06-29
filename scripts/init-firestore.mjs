// Inicializa el contador de proyectos para el año actual
// node scripts/init-firestore.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.env.FIREBASE_SA_PATH;
if (!saPath) throw new Error('Definir FIREBASE_SA_PATH=<ruta al service-account.json> antes de correr este script.');
const sa = JSON.parse((await import('fs')).readFileSync(saPath, 'utf8'));

initializeApp({ credential: cert(sa) });
const db = getFirestore();

const year = new Date().getFullYear();
const counterRef = db.doc(`counters/${year}`);
const snap = await counterRef.get();

if (!snap.exists) {
  await counterRef.set({ lastSeq: 0 });
  console.log(`✓ Counter counters/${year} creado con lastSeq=0`);
} else {
  console.log(`→ Counter counters/${year} ya existe: lastSeq=${snap.data().lastSeq}`);
}

console.log('\n✅ Firestore inicializado.');
process.exit(0);
