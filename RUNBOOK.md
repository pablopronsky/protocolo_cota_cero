# COTA CERO — Runbook de recuperación de datos

*Audience: administrador de la cuenta Firebase (pablopronsky@gmail.com)*

---

## 1. Habilitar PITR (Point-in-Time Recovery)

PITR permite restaurar Firestore a cualquier instante dentro de los **últimos 7 días**.
Se habilita **una sola vez** en la consola o con `gcloud`.

### Via Firebase Console

1. Ir a **Firebase Console → Firestore → Data → Configuración (⚙) → Point-in-time recovery**
2. Activar **Enable PITR**
3. Confirmar. La ventana de recuperación aparece después de ~30 min.

### Via gcloud CLI

```bash
# Reemplazá PROJECT_ID por el id del proyecto Firebase
gcloud firestore databases update \
  --project=PROJECT_ID \
  --enable-pitr \
  --database='(default)'
```

> **Estado actual (2026-06-29):** PITR NO está activado. Activarlo es prioridad
> antes de la próxima operación de firma de acta.

---

## 2. Exportaciones programadas a Cloud Storage

Las exportaciones automáticas crean un backup completo que puede restaurarse
incluso **fuera de la ventana de 7 días de PITR**.

### Paso 1 — Crear un bucket de backups

```bash
gsutil mb -p PROJECT_ID -l SOUTHAMERICA-EAST1 gs://cotacero-backups
```

### Paso 2 — Otorgar permisos al service account de Firestore

```bash
FIRESTORE_SA="service-$(gcloud projects describe PROJECT_ID \
  --format='value(projectNumber)')@gcp-sa-firestore.iam.gserviceaccount.com"

gsutil iam ch serviceAccount:${FIRESTORE_SA}:objectAdmin gs://cotacero-backups
```

### Paso 3 — Exportación manual (on-demand)

```bash
gcloud firestore export gs://cotacero-backups/$(date +%Y-%m-%d) \
  --project=PROJECT_ID
```

### Paso 4 — Exportación automática con Cloud Scheduler

```bash
# Crear Cloud Function (Node.js) que dispara el export
# Ver: scripts/firestore-export.sh para los comandos completos

gcloud scheduler jobs create http cotacero-daily-backup \
  --location=southamerica-east1 \
  --schedule="0 3 * * *" \
  --time-zone="America/Argentina/Buenos_Aires" \
  --uri="https://firestore.googleapis.com/v1/projects/PROJECT_ID/databases/(default):exportDocuments" \
  --message-body='{"outputUriPrefix":"gs://cotacero-backups/daily"}' \
  --oauth-service-account-email=PROJECT_NUMBER-compute@developer.gserviceaccount.com
```

---

## 3. Verificar backups existentes

```bash
# Listar exportaciones disponibles
gsutil ls gs://cotacero-backups/

# Ver tamaño de la última exportación
gsutil du -sh gs://cotacero-backups/$(date +%Y-%m-%d)
```

---

## 4. Procedimiento de restauración

### 4a. Restaurar con PITR (dentro de los 7 días)

```bash
# Restaurar a un timestamp específico (ISO 8601)
# ATENCIÓN: esto sobreescribe la base de datos de destino
gcloud firestore databases restore \
  --project=PROJECT_ID \
  --source-database='(default)' \
  --destination-database='cotacero-restore-test' \
  --snapshot-time='2026-06-28T10:00:00Z'
```

**Verificación post-restauración:**

```bash
# Listar proyectos en la base restaurada
gcloud firestore documents list \
  --database=cotacero-restore-test \
  --collection-id=projects \
  --project=PROJECT_ID
```

### 4b. Restaurar desde exportación en Cloud Storage

```bash
# Importar desde el backup del 28-Jun-2026
gcloud firestore import gs://cotacero-backups/2026-06-28 \
  --project=PROJECT_ID \
  --database='(default)'
```

> ⚠️ **La importación es aditiva** — no borra documentos existentes.
> Para una restauración completa, importá en una base de datos limpia.

### 4c. Restaurar en entorno de test (sin afectar producción)

```bash
# 1. Crear base de datos alternativa
gcloud firestore databases create \
  --project=PROJECT_ID \
  --database=cotacero-recovery-$(date +%Y%m%d) \
  --location=southamerica1

# 2. Importar backup
gcloud firestore import gs://cotacero-backups/2026-06-28 \
  --project=PROJECT_ID \
  --database=cotacero-recovery-$(date +%Y%m%d)

# 3. Validar datos antes de pisar producción
# (conectar el emulador local a la base alternativa y revisar documentos clave)
```

---

## 5. Checklist post-incidente

- [ ] Identificar el timestamp del último estado válido conocido
- [ ] Restaurar en base de datos de test (paso 4c)
- [ ] Validar que los proyectos firmados (`status: firmado`) están íntegros
- [ ] Validar que `lockedSnapshot` en documentos AC firmados no fue mutado
- [ ] Comunicar el incidente a los técnicos involucrados en proyectos afectados
- [ ] Restaurar en producción solo cuando el test sea validado
- [ ] Crear revisión (`/revisions`) documentando la restauración

---

## 6. Alertas recomendadas

Configurar en **Firebase Alerting** o **Cloud Monitoring**:

| Alerta | Umbral | Canal |
|---|---|---|
| Error rate en `projects` writes > 5% | 5 min | Email |
| Firestore quota > 80% | Diario | Email |
| Backup fallido (Cloud Scheduler) | Inmediato | Email |

---

*Última actualización: 2026-06-29*
