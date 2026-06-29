# Plan de remediación — Cota Cero

> Auditoría: 2026-06-28. Este doc es la fuente de verdad para ejecutar los fixes.
> Cada batch = una sesión nueva. Leer SOLO la sección del batch + los archivos que toca.

## Reglas para CUALQUIER sesión que ejecute un batch

1. **Next.js 16 tiene breaking changes.** Antes de escribir código, leé la guía relevante en `node_modules/next/dist/docs/`. No asumas APIs de memoria. `params` es `Promise`.
2. Tocá **solo** los archivos del batch. No refactorices fuera de alcance.
3. Al terminar: verificá (build/typecheck o el dev server vía preview), y actualizá el bloque "Estado" de este archivo + la memoria `project-cotacero-remediation`.
4. No commitees salvo que Pablo lo pida.

## Orden y dependencias

- **Batch 1 (fotos) → antes de → Batch 3 (forms)** (Batch 3 usa la nueva API de `lib/photos.ts`).
- Batches **2, 4, 5 son independientes** entre sí y de 1 → pueden ir en paralelo (Cowork/background).
- 1 y 3 tocan los 6 forms → van **secuenciales**, nunca en paralelo con otra sesión que toque forms.

| Batch | Tema | Modelo | Thinking | Hallazgos |
|-------|------|--------|----------|-----------|
| 1 | Subsistema de fotos | Sonnet (u Opus) | Sí | #2, #3 |
| 2 | Carga y ciclo de vida de datos | Sonnet | Ligero | #1, #4 |
| 3 | Barrido de formularios | Sonnet | No | #5, #6, a11y, confirmaciones, dead code |
| 4 | Reglas Firestore / seguridad | **Opus** | Sí | #7, lado-reglas de #5 |
| 5 | Limpieza + UX menor | Haiku (Sonnet para paginación) | No | typo, dead code, login #9, paginación #10, mensajes de error |
| 6 (opcional) | Audit log `revisions` | Sonnet | Sí | #8 (feature nueva, diferible) |

---

## Batch 1 — Subsistema de fotos  ·  Sonnet + extended thinking

**Problema raíz:** hay DOS escritores del array de fotos (`registroFotografico` / `firmaCliente.firma`): el `setDoc(merge)` del autosave del form y el `arrayUnion/arrayRemove` del flush. Eso causa:
- **#2** Se persiste `localBlob` (object URL `blob:`, válido solo en esa pestaña) en Firestore → otros clientes y la propia recarga ven `<img>` rotos (sin fallback, porque `useResolvedPhoto` prioriza `localBlob`).
- **#3** Carrera: `enqueuePhoto` corre `flushPhotoQueue()` ya, pero el autosave del array está debounced 800ms → el merge tardío pisa la versión subida y la foto queda "pendiente" para siempre.

**Fix (un solo rediseño cubre ambos):** hacer de `lib/photos.ts` el **único** escritor de campos de foto.
- El form NO autosava `registroFotografico` ni `firma`. Mantiene el preview en **estado local del componente** (`Map<id, objectURL>`), nunca en RHF/Firestore.
- `lib/photos.ts` escribe SIEMPRE vía `arrayUnion/arrayRemove` y **sin** `localBlob`:
  - al encolar: `arrayUnion({...clean, pending:true})` (sin localBlob) en el doc;
  - al subir (flush): `arrayRemove(pendingClean)` + `arrayUnion(uploadedClean)`.
- Para firmas (objeto, no array): exponer `setSignature(projectCode, 'AC', campo, photoRefClean)` que hace `updateDoc` puntual del campo, sin localBlob.
- `useResolvedPhoto` ya resuelve por `storagePath` cuando `pending:false`; con esto, un cliente remoto ve "pendiente" hasta que se sube. Correcto.

**Archivos:** `src/lib/photos.ts`, `src/components/docs/VTForm.tsx`, `src/components/docs/RFForm.tsx`, `src/components/docs/ACForm.tsx` (solo handlers de foto/firma + preview local). Revisar `src/hooks/useDoc.ts` solo si hace falta.

**Aceptación:** subir una foto online → en Firestore queda sin `localBlob`; tras subir, `pending:false` + `storagePath`; recargar muestra la foto; abrir el doc en otra sesión NO muestra imagen rota. No hay doble escritura del array.

**Prompt de arranque:**
```
Leé REMEDIATION.md, sección "Batch 1". Implementá ese fix (fotos: único escritor en lib/photos.ts, sin localBlob, preview en estado local del form). Respetá las "Reglas para cualquier sesión". Verificá con typecheck y, si podés, el dev server. No commitees.
```

---

## Batch 2 — Carga y ciclo de vida de datos  ·  Sonnet (thinking ligero)

- **#1 Loading infinito si el proyecto no existe.** `subscribeProject` (`src/lib/repo/projects.ts`) solo llama al callback `if (snap.exists())`, así que `useProject` nunca pone `loading=false` para un código inexistente → "Cargando…" eterno y la rama "Proyecto no encontrado" es inalcanzable.
  - Fix: `subscribeProject` callback con firma `(project: Project | null)` → `callback(snap.exists() ? snap.data() : null)`. En `useProject`, `setProject(p); setLoading(false)` en ambos casos.
- **#4 Print de doc individual no espera Auth.** `PrintLegajo` tiene el guard (`if (authLoading) return; if (!user)…`) pero `PrintDocument` no → al abrir `/print/[code]/[docType]` en pestaña nueva, `getProject` corre antes del token → `permission-denied` intermitente.
  - Fix: replicar el guard de `PrintLegajo` en `PrintDocument`. Bonus opcional: extraer un hook `usePrintData(code)` y usarlo en ambos (dedupe).

**Archivos:** `src/lib/repo/projects.ts`, `src/hooks/useProject.ts`, `src/components/print/PrintDocument.tsx` (y `PrintLegajo.tsx` si se hace el hook).

**Aceptación:** abrir `/projects/CODIGO-INEXISTENTE` muestra "Proyecto no encontrado" (no loading infinito). Abrir un print de doc en pestaña nueva carga de forma confiable.

**Prompt de arranque:**
```
Leé REMEDIATION.md, sección "Batch 2". Aplicá #1 y #4. Respetá las "Reglas para cualquier sesión". Verificá con typecheck. No commitees.
```

---

## Batch 3 — Barrido de formularios  ·  Sonnet  ·  (DEPENDE de Batch 1)

Una sola pasada por los 6 forms (`src/components/docs/*Form.tsx`) aplicando todo lo de forms a la vez (se leen una vez):

- **#6 Abrir doc vacío lo promueve a `en_progreso`.** El `reset()` de seed dispara el `watch(cb)` → autosave fantasma → `setDocStatus('en_progreso')` y proyecto a `en_curso`, sin que el usuario edite.
  - Fix: en el callback de `watch` de cada form, gatear el autosave en el **evento real de cambio**: `watch((values, { type }) => { if (type !== 'change') return; ... })`. **Verificar en runtime** que (a) abrir un doc vacío ya NO lo promueve y (b) editar sí guarda.
- **#5 (lado UI) Técnico en AC.** El editor de AC muestra la subida de "Firma del cliente" a cualquiera, pero las reglas solo dejan escribir AC al admin → escritura denegada + foto huérfana. Fix: en `ACForm`, mostrar el editor de AC como solo-lectura si `role !== 'admin'` (o esconder las subidas). Coordina con Batch 4 (lado reglas).
- **a11y:** asociar cada `<label>` de campo con su input vía `htmlFor`/`id` (hoy son hermanos sin asociar). Los checkboxes de arrays ya usan label envolvente (ok).
- **Confirmaciones en acciones destructivas/irreversibles:** `removePhoto` (borrar foto) y `handleLock`/`handleSign` (bloquear/firmar congela el doc) deberían pedir confirmación.
- **Dead code:** sacar el `openSections` muerto en `VTForm` (useState sin setter; `section()` devuelve `open` que `<Section>` no usa).

**Aceptación:** abrir un doc vacío no cambia su estado; un técnico no puede romper AC; labels asociados (clic en label enfoca el input); borrar foto y firmar piden confirmación.

**Prompt de arranque:**
```
Leé REMEDIATION.md, sección "Batch 3". Confirmá que Batch 1 ya está hecho (lib/photos.ts es el único escritor de fotos). Aplicá #6, #5(UI), a11y, confirmaciones y limpieza de dead code en los 6 forms. Respetá las "Reglas para cualquier sesión". Verificá #6 en runtime con el dev server. No commitees.
```

---

## Batch 4 — Reglas Firestore / seguridad  ·  Opus + extended thinking

Archivo aislado: `firestore.rules` (+ probar con el emulador si está disponible).

- **#7** Las reglas validan QUÉ claves cambia el técnico pero no los VALORES: un técnico (vía SDK) puede poner `docStatus.*` en cualquier cosa o `status:'entregado'` sin que los docs lo estén.
  - Fix: validar que cada valor de `docStatus` esté en el enum (`vacio|en_progreso|completo|firmado`); restringir las transiciones de `status` permitidas; considerar `get()` sobre el doc AC para no permitir `entregado` sin AC `firmado` (evaluar costo/lecturas).
- **#5 (lado reglas)** Confirmar/ajustar que la política de AC sea coherente con el guard de UI del Batch 3 (¿AC es admin-only? definir y reflejar en reglas).

**Aceptación:** un técnico no puede saltar pasos ni marcar entregado fuera de flujo; los tests/emulador (si hay) pasan.

**Prompt de arranque:**
```
Leé REMEDIATION.md, sección "Batch 4". Endurecé firestore.rules (#7 y lado-reglas de #5). Respetá las "Reglas para cualquier sesión". Si hay emulador de Firebase, probá las reglas. No commitees.
```

---

## Batch 5 — Limpieza + UX menor  ·  Haiku (Sonnet para paginación)

Archivos sueltos, en su mayoría mecánicos:

- **typo** `src/app/(app)/projects/page.tsx`: "Buscor por cliente" → "Buscar".
- **dead code** misma página: `STATUS_BADGE.planificacion` (estado inexistente).
- **#9 login** `src/app/login/page.tsx`: controles muertos. Default recomendado: cablear "Recordarme" a `setPersistence` (local vs session); implementar "¿Olvidaste tu contraseña?" con `sendPasswordResetEmail`; **quitar** el botón "Ingresar con SSO" (no hay provider). *(Confirmar con Pablo si prefiere otra cosa.)*
- **mensajes de error** `src/hooks/useDoc.ts`: hoy todo error de guardado se muestra como "Sin conexión"; distinguir permiso denegado / error real de offline.
- **#10 paginación/conteo** (→ **Sonnet**): "N proyectos activos" y "Mostrando X–Y de Z" cuentan solo lo cargado, no el total real. Para un tool interno con pocos proyectos: cargar todo y filtrar/paginar client-side (conteos exactos), o corregir los textos para no afirmar totales. Decidir e implementar.

**Prompt de arranque (parte mecánica, Haiku):**
```
Leé REMEDIATION.md, sección "Batch 5". Hacé solo lo mecánico: typo "Buscor", quitar STATUS_BADGE.planificacion, login #9 (cablear Recordarme + forgot password, quitar SSO), y distinguir error denegado/offline en useDoc. Respetá las "Reglas para cualquier sesión". No commitees.
```
**Prompt de arranque (paginación, Sonnet):**
```
Leé REMEDIATION.md, sección "Batch 5", ítem #10. Corregí la paginación/conteo en projects/page.tsx para que los totales sean exactos. No commitees.
```

---

## Batch 6 (opcional, diferible) — Audit log `revisions`  ·  Sonnet + thinking

Las reglas ya tienen `projects/{code}/revisions` append-only, pero ningún código escribe ahí. Para un sistema con firmas legales conviene: en cada `handleLock`/`handleSign`, además del doc, hacer `addDoc(revisions, { snapshot, version, by, at })`. Feature nueva; no es bug. Diferir hasta que Pablo lo pida.

---

## Estado

- [x] Batch 1 — fotos (2026-06-28) · verificado por Opus: typecheck OK, único escritor, race cerrada, sin localBlob en Firestore
- [x] Batch 2 — carga/ciclo de vida (2026-06-28) · typecheck OK · #1 subscribeProject null-aware · #4 auth guard en PrintDocument · verificado por Opus
- [x] Batch 3 — forms (2026-06-28) · typecheck OK · #6 watch gateado en type==='change' · #5(UI) ACForm isLocked incluye role!=='admin' · confirmaciones en removePhoto/handleLock/handleSign · dead code openSections+section() en VTForm · a11y htmlFor/id en los 6 forms · verificado por Opus (runtime de #6 pendiente de prueba manual)
- [x] Batch 4 — reglas (2026-06-28) · #7: validDocStatusMap (enum por slot) · validProjectStatusTransition (sin saltos ni retrocesos) · acEstaFirmado get() guard (no entregado sin AC firmado) · #5-reglas: AC/FM ya excluidos para técnico, comentado explícitamente · bonus: status de documento también validado contra enum
- [x] Batch 5 — limpieza/UX (2026-06-28) · typecheck OK · typo "Buscar" · STATUS_BADGE.planificacion eliminado · #9 login (Recordarme→setPersistence, forgot password con sendPasswordResetEmail, SSO+IconSSO eliminados) · useDoc distingue denied/offline/error · #10 paginación: listAllProjects + paginación client-side (conteos exactos) — completado e IconSSO+#10 hechos por Opus en esta sesión
- [x] Batch 6 — revisions (2026-06-28) · writeRevision en projects.ts (addDoc → projects/{code}/revisions) · llamada después de setDocStatus en los 6 forms (handleLock/handleSign) · typecheck OK
