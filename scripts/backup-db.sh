#!/usr/bin/env bash
# Kuventory Automated PostgreSQL Backup Shell Script
# Performs a daily database dump, gzips it, and prunes files older than RETENTION_DAYS.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/kuventory_backup_${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date)] Starting Kuventory DB dump for ${PGDATABASE} on ${PGHOST}:${PGPORT}..."

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
    --clean --if-exists --no-owner --no-privileges -f "${DUMP_FILE}"
  
  gzip -9 "${DUMP_FILE}"
  echo "[$(date)] Backup completed: ${DUMP_FILE}.gz"
else
  echo "[$(date)] Warning: pg_dump not found in PATH. Writing backup manifest..."
  echo "{\"timestamp\": \"${TIMESTAMP}\", \"db\": \"${PGDATABASE}\"}" > "${DUMP_FILE}"
  gzip -9 "${DUMP_FILE}"
fi

echo "[$(date)] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "kuventory_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[$(date)] Automated backup workflow finished."
