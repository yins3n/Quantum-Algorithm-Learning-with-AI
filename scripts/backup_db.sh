#!/usr/bin/env sh
set -eu
DB_PATH="${QUANTUM_DB:-data/platform.db}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"
if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/platform-$(date -u +%Y%m%dT%H%M%SZ).db'"
