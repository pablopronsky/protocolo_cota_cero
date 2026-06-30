/**
 * Migración: projects.cliente (embebido) → colección clients + project.clienteId
 *
 * Uso:
 *   FIREBASE_SA_PATH=./service-account.json node scripts/migrate-clients.mjs [--dry-run]
 *
 * Es IDEMPOTENTE: proyectos que ya tienen clienteId se saltean.
 * --dry-run imprime el plan sin escribir nada.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

const saPath = process.env.FIREBASE_SA_PATH;
if (!saPath) throw new Error('Definir FIREBASE_SA_PATH=<ruta al service-account.json>');
const sa = JSON.parse(readFileSync(saPath, 'utf8'));

initializeApp({ credential: cert(sa) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// ── Misma lógica de clientKey que usaba lib/clients.ts para agrupar ──────────
function clientKey(c) {
  const dni = (c.dni_cuit ?? '').replace(/\D/g, '');
  if (dni) return `dni:${dni}`;
  const email = (c.email ?? '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = c.nombre.trim().toLowerCase().replace(/\s+/g, ' ');
  return `name:${name}`;
}

// ── Leer todos los proyectos ──────────────────────────────────────────────────
const projectsSnap = await db.collection('projects').get();
const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`Proyectos totales: ${projects.length}`);

// Separar los que ya migraron
const migrated  = projects.filter((p) => p.clienteId);
const pending   = projects.filter((p) => !p.clienteId);
console.log(`Ya migrados: ${migrated.length}  |  Pendientes: ${pending.length}`);
if (pending.length === 0) { console.log('Nada que migrar. ✓'); process.exit(0); }

// ── Agrupar los pendientes por identidad de cliente ───────────────────────────
const groups = new Map(); // key → { cliente, projects[] }
for (const p of pending) {
  if (!p.cliente) { console.warn(`⚠  Proyecto ${p.id} sin campo cliente, saltear`); continue; }
  const key = clientKey(p.cliente);
  const group = groups.get(key);
  if (group) group.projects.push(p);
  else groups.set(key, { cliente: p.cliente, projects: [p] });
}

// Para cada grupo, tomar los datos del proyecto más reciente
for (const [, group] of groups) {
  group.projects.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  group.cliente = group.projects[0].cliente;
}

console.log(`\nClientes únicos a crear: ${groups.size}`);

// ── Verificar cuáles ya existen en la colección clients ──────────────────────
// (puede pasar si se corrió parcialmente antes)
const existingSnap = await db.collection('clients').get();
const existingByKey = new Map(); // key → clientId
for (const d of existingSnap.docs) {
  const c = d.data();
  existingByKey.set(clientKey(c), d.id);
}

// ── Plan ─────────────────────────────────────────────────────────────────────
let totalWrites = 0;
const plan = []; // { key, clienteId, newClient, projectIds }

for (const [key, { cliente, projects: ps }] of groups) {
  const existingId = existingByKey.get(key);
  plan.push({
    key,
    clienteId: existingId ?? null, // null = crear nuevo
    newClient: existingId ? null : cliente,
    projectIds: ps.map((p) => p.id),
  });
  totalWrites += ps.length + (existingId ? 0 : 1);
}

console.log(`\nTotal escrituras estimadas: ${totalWrites}`);
plan.forEach((p) => {
  const action = p.clienteId ? `usar existente ${p.clienteId}` : 'crear nuevo';
  console.log(`  ${p.key} → ${action} → ${p.projectIds.length} proyectos`);
});

if (DRY_RUN) { console.log('\n[DRY RUN] Sin cambios escritos.'); process.exit(0); }

// ── Ejecutar en batches de 500 ────────────────────────────────────────────────
const now = Date.now();
let batch = db.batch();
let opsInBatch = 0;

async function flush() {
  if (opsInBatch > 0) {
    await batch.commit();
    console.log(`  ✓ Batch de ${opsInBatch} escrituras commiteado`);
    batch = db.batch();
    opsInBatch = 0;
  }
}

async function addOp(ref, data, mode = 'set') {
  if (mode === 'set')    batch.set(ref, data);
  if (mode === 'update') batch.update(ref, data);
  opsInBatch++;
  if (opsInBatch >= 490) await flush();
}

for (const item of plan) {
  let { clienteId } = item;

  if (!clienteId) {
    const c = item.newClient;
    const ref = db.collection('clients').doc();
    clienteId = ref.id;
    const clientDoc = {
      id: clienteId,
      nombre:   c.nombre,
      contacto: c.contacto,
      telefono: c.telefono,
      ...(c.email    && { email:    c.email }),
      ...(c.dni_cuit && { dni_cuit: c.dni_cuit }),
      createdAt: now,
      updatedAt: now,
    };
    await addOp(ref, clientDoc, 'set');
  }

  for (const projectId of item.projectIds) {
    const ref = db.doc(`projects/${projectId}`);
    // Obtener el nombre canónico del cliente (del doc que acabamos de crear o del existente)
    const clienteNombre = item.newClient?.nombre ??
      (await db.doc(`clients/${clienteId}`).get()).data()?.nombre ?? '';
    await addOp(ref, {
      clienteId,
      clienteNombre,
      // Mantener el campo antiguo por si hay snapshots bloqueados que lo referencian
      // directamente (los forms leen del snapshot, no del proyecto).
      // Se puede limpiar en una segunda migración después de verificar.
      updatedAt: FieldValue.serverTimestamp(),
    }, 'update');
  }
}

await flush();

console.log('\n✓ Migración completada.');
console.log('Próximo paso: verificar un par de proyectos en Firestore y luego');
console.log('desplegar las nuevas reglas (firestore.rules) con: firebase deploy --only firestore:rules');
