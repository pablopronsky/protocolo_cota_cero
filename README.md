# Protocolo Cota Cero

Aplicación interna para gestionar obras, documentos VT → EP → OT → RF → AC → FM, evidencias, firma presencial/remota e impresión del legajo. Next.js, React y Firebase. Versión actual: **2.6.7**, centralizada en `package.json` y `src/lib/version.ts`.

## Desarrollo

Usar Node **22.x**, ejecutar `npm ci`, configurar las variables Firebase locales y ejecutar `npm run dev`. Las credenciales del Admin SDK pertenecen exclusivamente al servidor y nunca se agregan a Git. No habilitar emuladores en Vercel.

## Verificación completa

Requisitos: Node 22, Java 21, Firebase CLI 15.28.2 y Chromium de Playwright.

```sh
npm ci
npm install -g firebase-tools@15.28.2
npx playwright install chromium
npm run lint
npm run typecheck
npm run test:all:emu
npm run build
```

`test:all:emu` usa exclusivamente `cotacero-test`: Firestore 18080, Auth 19099 y Storage 19199. Ejecuta Vitest (unidad, reglas y API), imágenes y seis recorridos de navegador. El navegador usa una build independiente `.next-test`, usuarios ficticios y datos sembrados con Admin SDK. Un fallo devuelve un código distinto de cero. `npm test` requiere los emuladores ya disponibles; `test:unit` puede ejecutarse sin ellos. Los tests de Playwright no se importan en Vitest.

## Integridad de documentos

El autoguardado conserva la cola offline y escribe el usuario actual. Los cierres, reaperturas, capturas/descartes de firma y revisiones pasan por `/api/projects/document`, con autenticación y validaciones de servidor. Cerrar requiere conexión. Documento, revisión y estado de obra cambian en una transacción. La firma aceptada conserva el contenido y el contexto de obra; el archivo ya subido no puede reemplazarse. El cierre del acta sigue siendo definitivo.

## Publicación

La rama de producción confirmada es **master**. Publicar únicamente después de verificar todo. Vercel construye la aplicación al recibir el push. Las reglas Firebase requieren un despliegue separado: publicar primero la aplicación y luego `firebase deploy --only firestore:rules,storage --project cota-cero-protocolo`. Un push no actualiza reglas por sí solo. Verificar ambos resultados antes de declarar la entrega completa.

Ver [CHANGELOG.md](CHANGELOG.md), [REVISION-2026-09-10.md](REVISION-2026-09-10.md) y [RUNBOOK.md](RUNBOOK.md). `AUDIT.md` es una auditoría histórica y no representa el estado actual.
