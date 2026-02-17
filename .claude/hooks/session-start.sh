#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "[session-start] Installing npm dependencies..."
cd "$CLAUDE_PROJECT_DIR"
npm install

echo "[session-start] Checking PostgreSQL status..."
if ! pg_isready -q 2>/dev/null; then
  echo "[session-start] Starting PostgreSQL..."
  pg_ctlcluster 16 main start 2>/dev/null || true
  for i in 1 2 3 4 5; do
    if pg_isready -q 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

# Create the database if it doesn't exist
DB_NAME="vibeindex"
if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "[session-start] Creating database '$DB_NAME'..."
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || true
fi

# Set DATABASE_URL for drizzle-kit and the session
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vibeindex"
echo "export DATABASE_URL=\"$DATABASE_URL\"" >> "$CLAUDE_ENV_FILE"

echo "[session-start] Pushing database schema..."
npx drizzle-kit push 2>&1 || echo "[session-start] WARNING: drizzle-kit push failed"

echo "[session-start] Setup complete."
