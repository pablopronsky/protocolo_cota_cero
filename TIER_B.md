# Tier B — UX/UI audit, items #14–27

Plan de ejecución (no commiteado, doc de trabajo). Igual formato que `REMEDIATION.md`.
Verificado 2026-06-30: ninguno de los 14 está hecho (los íconos ✅/💡 de la tabla original
eran categoría del audit, no estado — se confirmó leyendo el código real).

## Mapa de archivos (de exploración inicial)
- Shell: `src/app/(app)/layout.tsx` (sidebar 188px fijo, sin breakpoints, top bar h-11)
- Forms: `src/components/docs/{VTForm,ACForm,EPForm,OTForm,RFForm,FMForm}.tsx` — grids fijos sin responsive, Section inline no compartido
- UI: `src/components/ui/ConfirmDialog.tsx` (único componente real hoy) + `src/hooks/useConfirm.ts`
- Doc host: `src/app/(app)/projects/[code]/[docType]/page.tsx`; autosave en `src/hooks/useDoc.ts`; `src/components/SaveIndicator.tsx`
- Lock: `setDocStatus` en `src/lib/repo/projects.ts` — unidireccional, sin reopen
- Listas: `src/app/(app)/projects/page.tsx`, `src/app/(app)/clients/page.tsx` — `<table>` plano, sin fallback mobile
- Cliente nuevo: `ClientPicker` inline en `src/app/(app)/projects/new/page.tsx` — hidden-input hack
- CSS: `src/app/globals.css` — Tailwind v4 `@theme inline`, tokens de color, sin reduced-motion
- Login: `src/app/login/page.tsx` — 100% inline styles, NO Tailwind todavía

## Batches

### Batch 1 — Fundacional (shell + tokens) — YO, secuencial primero
- #16 Capa de componentes UI (alcance acotado: Button/Field/Input/Select/Badge/Card en `components/ui/`; NO retrofit completo de los 6 forms ya existentes, se usan en trabajo nuevo)
- #14 Shell responsive (sidebar → top bar + drawer slide-in <lg)
- #23 Save/offline status persistente en header
- #26 prefers-reduced-motion + transition tokens
Archivos: `layout.tsx`, `globals.css`, nuevos `components/ui/*`

### Batch 2 — Forms (el batch más grande, un solo paso por cada form) — YO
- #15 Forms & tablas responsive (single-column ≤sm; tablas → cards en mobile)
- #17 Sticky action bar
- #18 Section progress/anchor rail
- #19 Admin unlock/reopen con audit trail
- #27 Confirm-on-leave en doc sucio
Archivos: 6 forms, doc host page, `lib/repo/projects.ts`, `projects/page.tsx`, `clients/page.tsx`

### Batch 3 — Sistemas globales — YO
- #21 Toast system (provider propio, sin dependencia nueva)
- #20 Skeleton loaders + empty states (projects, clients, doc host)

### Batch 4 — Independientes (candidatos a paralelizar) — background agent
- #22 New-client subform con validación (reemplaza hidden-input hack)
- #24 Búsqueda global en topbar (proyectos + clientes + códigos)
- #25 Login → Tailwind/tokens

## Estado
- [x] Batch 1 — `components/ui/{Button,Badge,Card}.tsx`, shell responsive (drawer <lg) en `layout.tsx`,
      `contexts/SaveStatusContext.tsx` + wiring en `useDoc.ts` (header muestra save/offline global),
      reduced-motion + transition tokens en `globals.css`, `UnsavedChangesGuard` (#27 acotado a
      beforeunload mientras `docState==='saving'`; NO intercepta navegación in-app, ver nota abajo).
      `npx tsc --noEmit` limpio.
- [x] Batch 2 — Componentes compartidos `components/docs/{Section,SectionNav,DocActionBar}.tsx`;
      `reopenDoc()` en `repo/projects.ts` + regla `isReopen()` en `firestore.rules` (admin puede
      reabrir un doc bloqueado SOLO como transición exacta a en_progreso, campos acotados);
      los 6 forms (VT/AC/EP/OT/RF/FM) migrados a `Section`, grids responsive (`grid-cols-1 sm:...`),
      filas de field-array con `flex-wrap`, `SectionNav` con heurística de completitud desde el doc
      persistido (no watch() en vivo, evita re-renders extra), `DocActionBar` sticky para el botón de
      lock/firma, botón "Reabrir" (admin, doc bloqueado) con confirm + writeRevision de auditoría.
      `projects/page.tsx` y `clients/page.tsx`: tabla oculta `sm:hidden`→cards apiladas en mobile,
      tabla real `hidden sm:block` con scroll horizontal de respaldo; filtros/paginación con flex-wrap.
      Doc host page (`[docType]/page.tsx`): título responsive, header wrap.
      `npx tsc --noEmit` limpio en cada paso.
      **Riesgo conocido sin mitigar:** reabrir un doc no re-valida downstream (ej. reabrir VT
      mientras EP ya está completo no lo desbloquea automáticamente ni avisa) — mismo alcance que
      pidió el audit (Med, 2d), sin cascada.
      **No verificado en browser** — no hay credenciales Firebase en este entorno para loguearse
      (ver [[project-cotacero-gotchas]]); solo se validó con `tsc --noEmit`.
- [x] Batch 3 — `contexts/ToastContext.tsx` (provider propio, sin dependencia nueva) montado en
      `(app)/layout.tsx`; wireado en los 6 handleReopen (era el único punto donde `lockErrors` iba a
      un banner que nunca se renderiza estando el doc bloqueado — bug real que el toast corrige).
      `components/ui/{Skeleton,EmptyState}.tsx`; loading skeletons en projects/clients/doc-host;
      empty states con ícono + CTA ("+ Nuevo Proyecto" si no hay proyectos y sos admin).
      `npx tsc --noEmit` limpio.
- [x] Batch 4 (parcial) — #22 New-client subform: estado (`newClient`, `showNewClient`) subido de
      `ClientPicker` al padre (`projects/new/page.tsx`), `validateNewClient()` con errores inline por
      campo, sin hidden-inputs ni `FormData` para los datos del cliente. Grids del form responsive.
      #24 Búsqueda global: `components/GlobalSearch.tsx` (carga perezosa de proyectos+clientes al
      primer foco, filtro client-side, dropdown de resultados con Link a /projects/{code} o
      /clients/{id}); montada en el header, oculta `<md` (topbar ya crowded en mobile con
      hamburger+logo+save+salir).
      `npx tsc --noEmit` limpio. Verificado en browser (server ya corría en :3000, reusado).
- [ ] #25 Login → Tailwind/tokens — **diferido**. Verificado en vivo (screenshot desktop 1280x800):
      el login YA está visualmente terminado y coincide con `public/rediseño/login.png`, y su
      responsive ya funciona (`@media max-width:1023px` oculta el panel de foto). Lo que pide el
      audit es puramente consolidar el sistema de estilos (590 líneas de `style={{}}` inline →
      Tailwind), no un fix visible — es el ítem de menor impacto del Tier B (★★) y el de mayor
      riesgo de regresión (reescritura mecánica grande, sin captura de referencia pixel-a-pixel).
      Se decidió no arriesgar una página que ya funciona bien al cierre de una sesión larga.
      Pendiente para una sesión dedicada y acotada.

## Resumen de decisiones de alcance (para no repreguntar)
- #18 completitud del rail es heurística (campos representativos, no exhaustiva) — la validación
  real sigue en `handleLock`/`handleSign`.
- #19 reabrir un doc NO revalida en cascada los documentos posteriores del protocolo.
- #27 solo cubre `beforeunload` (cerrar/recargar), no intercepta navegación in-app (Next.js App
  Router no tiene equivalente a `usePrompt` de React Router).
- #16 la capa de componentes UI es acotada (`Button`, `Badge`, `Card`, `Skeleton`, `EmptyState`,
  `Section`, `SectionNav`, `DocActionBar`) — no hubo retrofit de `Input`/`Select`/`Field` porque la
  convención `.field-input` de `globals.css` ya daba consistencia visual suficiente.

### Nota de alcance — #27 confirm-on-leave
Next.js App Router no tiene un equivalente a React Router `usePrompt` para bloquear
navegación in-app. Implementado solo `beforeunload` (cubre cerrar pestaña/recargar,
el caso de "3G flaky" que menciona el audit). Interceptar clicks en `<Link>` in-app
globalmente se consideró pero se descartó por riesgo/alcance (Low eff, 1d en el audit).

## Verificación
`npx tsc --noEmit` después de cada batch. Sin emulador Firestore (Java ausente) — no se pueden correr tests de reglas si algo cambia ahí (no debería, este tier es UI).

**Pendiente de deploy manual:** `firestore.rules` cambió (`isReopen()`, #19). Sin desplegar, el botón
"Reabrir" de los 6 forms va a fallar con `permission-denied` (el toast de error lo va a mostrar, así
que no rompe silenciosamente, pero no funciona hasta el deploy):
`firebase deploy --only "firestore:rules" --project cota-cero-protocolo`
