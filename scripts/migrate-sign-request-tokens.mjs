/**
 * Removes legacy remoteSign.token mirrors from AC documents without touching
 * signRequests/{token}. Existing public links therefore keep working.
 *
 * Safe rollout: deploy the new app, run --dry-run, run the migration, then
 * deploy Firestore rules. Never print or log a token.
 *
 * Usage:
 *   FIREBASE_SA_PATH=./service-account.json node scripts/migrate-sign-request-tokens.mjs --dry-run
 *   FIREBASE_SA_PATH=./service-account.json node scripts/migrate-sign-request-tokens.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const dryRun = process.argv.includes('--dry-run');
const serviceAccountPath = process.env.FIREBASE_SA_PATH;
if (!serviceAccountPath) {
  throw new Error('Definir FIREBASE_SA_PATH=<ruta al service-account.json>');
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snapshot = await db.collectionGroup('documents')
  .where('docType', '==', 'AC')
  .get();
const legacy = snapshot.docs.filter((document) => {
  const remoteSign = document.data().remoteSign;
  return remoteSign && typeof remoteSign.token === 'string';
});

console.log(`Actas con mirror legacy a sanear: ${legacy.length}`);
if (dryRun || legacy.length === 0) {
  console.log(dryRun ? '[DRY RUN] Sin escrituras.' : 'Nada que migrar.');
  process.exit(0);
}

let batch = db.batch();
let pending = 0;
let migrated = 0;
for (const document of legacy) {
  const remoteSign = document.data().remoteSign;
  batch.update(document.ref, {
    remoteSign: {
      createdAt: remoteSign.createdAt,
      expiresAt: remoteSign.expiresAt,
    },
  });
  pending += 1;
  migrated += 1;
  if (pending >= 450) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}
if (pending > 0) await batch.commit();
console.log(`Actas saneadas: ${migrated}`);