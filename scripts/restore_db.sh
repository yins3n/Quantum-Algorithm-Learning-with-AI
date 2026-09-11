#!/usr/bin/env sh
set -eu
BACKUP="${1:-}"
DB_PATH="${QUANTUM_DB:-data/platform.db}"
if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "Usage: $0 path/to/backup.db" >&2
  exit 1
fi
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$BACKUP" "PRAGMA integrity_check;" | grep -qx "ok"
sqlite3 "$BACKUP" ".backup '${DB_PATH}.restored'"
mv "${DB_PATH}.restored" "$DB_PATH"
echo "Restored $BACKUP to $DB_PATH"
