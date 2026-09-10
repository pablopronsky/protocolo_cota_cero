# Cambios

## 2.6.7 — 2026-09-10

- Corrige autor y metadatos del autoguardado entre usuarios (H01).
- Congela contenido/contexto al capturar la firma; descarte auditado y protección del archivo, incluida recuperación de confirmaciones perdidas (H02).
- Valida toda la secuencia con documentos reales; genera snapshots y revisiones desde el servidor en una transacción (H03–H05).
- CI con Node 22, Java 21, Firestore, Storage, Auth, API, imágenes y navegador obligatorio; separa Playwright de Vitest (H06, H07, H09).
- Repara estados derivados automáticamente y restaura entregada al desarchivar (H08, H10).
- Centraliza versión y reemplaza README inicial (M01).

## 2.6.6 — base a97868a (2026-08-31)

Versión identificada en la auditoría inicial. Ver el informe para los defectos reproducidos antes de las correcciones.
