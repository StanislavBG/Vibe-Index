#!/bin/bash
# Ensure the database schema is up-to-date.
# This script is idempotent and safe to run on every startup.

set -e

echo "[setup-db] Checking database connectivity..."

# Quick connectivity check using DATABASE_URL
if ! timeout 5 node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => { console.log('OK'); pool.end(); process.exit(0); }).catch(e => { console.error(e.message); pool.end(); process.exit(1); });
" 2>/dev/null; then
  echo "[setup-db] WARNING: Cannot connect to database. Skipping schema push."
  echo "[setup-db] The app will start and attempt to connect on its own."
  exit 0
fi

echo "[setup-db] Database is accessible."
echo "[setup-db] Pushing schema to database..."
yes | npx drizzle-kit push 2>&1 || {
  echo "[setup-db] WARNING: drizzle-kit push failed (non-fatal). The app may encounter errors."
}

echo "[setup-db] Database setup complete."
