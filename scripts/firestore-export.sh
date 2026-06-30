#!/usr/bin/env bash
# Firestore export script — manual or scheduled via Cloud Scheduler.
# Usage: PROJECT_ID=your-project ./scripts/firestore-export.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID env var}"
BUCKET="gs://cotacero-backups"
DATE=$(date +%Y-%m-%d)
DESTINATION="${BUCKET}/${DATE}"

echo "[$(date -Iseconds)] Starting Firestore export to ${DESTINATION}"

gcloud firestore export "${DESTINATION}" \
  --project="${PROJECT_ID}" \
  --async

echo "[$(date -Iseconds)] Export job submitted. Verify with:"
echo "  gsutil ls ${DESTINATION}"
