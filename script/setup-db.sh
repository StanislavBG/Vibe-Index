#!/bin/bash
# Ensure PostgreSQL is running and the database schema is up-to-date.
# This script is idempotent and safe to run on every startup.

set -e

echo "[setup-db] Checking PostgreSQL status..."

# Start PostgreSQL if not running
if ! pg_isready -q 2>/dev/null; then
  echo "[setup-db] Starting PostgreSQL..."
  pg_ctlcluster 16 main start 2>/dev/null || true
  # Wait for it to be ready
  for i in 1 2 3 4 5; do
    if pg_isready -q 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

if ! pg_isready -q 2>/dev/null; then
  echo "[setup-db] WARNING: PostgreSQL is not running. Skipping DB setup."
  exit 0
fi

echo "[setup-db] PostgreSQL is running."

# Create the database if it doesn't exist
DB_NAME="vibeindex"
if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "[setup-db] Creating database '$DB_NAME'..."
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null
fi

# Set DATABASE_URL if not already set
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/vibeindex}"

echo "[setup-db] Pushing schema to database..."
npx drizzle-kit push 2>&1 || {
  echo "[setup-db] WARNING: drizzle-kit push failed. The app may encounter errors."
}

echo "[setup-db] Database setup complete."
