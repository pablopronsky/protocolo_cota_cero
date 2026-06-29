// Script de inicialización de usuarios — ejecutar UNA SOLA VEZ
// node scripts/init-users.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

const saPath = process.env.FIREBASE_SA_PATH;
if (!saPath) throw new Error('Definir FIREBASE_SA_PATH=<ruta al service-account.json> antes de correr este script.');
const sa = JSON.parse(readFileSync(saPath, 'utf8'));

initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

// Genera contraseña aleatoria de 16 chars — se imprime al final para distribuir
const genPw = () => randomBytes(12).toString('base64url');

const USERS = [
  { nombre: 'Pablo Pronsky',    email: 'pronskypablo@gmail.com', role: 'admin'   },
  { nombre: 'Ismael Erriest',   email: 'ismael@cotacero.com',    role: 'admin'   },
  { nombre: 'Félix Villarreal', email: 'felix@cotacero.com',     role: 'tecnico' },
  { nombre: 'Irene Salas',      email: 'irene@cotacero.com',     role: 'tecnico' },
].map((u) => ({ ...u, password: genPw() }));

for (const u of USERS) {
  let uid;
  try {
    // Intentar crear
    const created = await auth.createUser({ email: u.email, password: u.password, displayName: u.nombre });
    uid = created.uid;
    console.log(`✓ Creado: ${u.email} (${uid})`);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      console.log(`→ Ya existe: ${u.email} (${uid})`);
    } else {
      console.error(`✗ Error con ${u.email}:`, err.message);
      continue;
    }
  }

  // Setear custom claim de rol
  await auth.setCustomUserClaims(uid, { role: u.role });
  console.log(`  → Custom claim seteado: role=${u.role}`);

  // Crear/actualizar doc en Firestore
  await db.doc(`users/${uid}`).set({
    uid,
    nombre: u.nombre,
    email:  u.email,
    role:   u.role,
    activo: true,
  }, { merge: true });
  console.log(`  → Doc Firestore creado`);
}

console.log('\n✅ Listo. Usuarios inicializados.');
console.log('\n⚠️  Contraseñas generadas (distribuir de forma segura y pedir cambio en primer login):');
for (const u of USERS) console.log(`   ${u.email}  →  ${u.password}`);
process.exit(0);
