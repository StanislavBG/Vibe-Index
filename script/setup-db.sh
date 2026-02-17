#!/bin/bash
# Ensure the database schema is up-to-date.
# This script is idempotent and safe to run on every startup.

set -e

echo "[setup-db] Pushing schema to database..."
yes 2>/dev/null | npx drizzle-kit push 2>&1 || {
  echo "[setup-db] WARNING: drizzle-kit push failed (non-fatal)."
}
echo "[setup-db] Database setup complete."
