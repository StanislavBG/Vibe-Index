#!/bin/bash
# Ensure the database schema is up-to-date.
# This script is idempotent and safe to run on every startup.

set -e

find_pg_bin() {
  for bin in pg_ctl initdb psql createdb pg_isready; do
    if ! command -v "$bin" &>/dev/null; then
      local found
      found=$(find /nix/store -maxdepth 3 -name "$bin" -path "*/bin/$bin" 2>/dev/null | head -1)
      if [ -n "$found" ]; then
        export PATH="$(dirname "$found"):$PATH"
      fi
    fi
  done
}

find_pg_bin

PGDATA="$HOME/.pg_data"
SOCKET_DIR="$PGDATA/sockets"
PGLOG="$HOME/.pg_log"
DB_NAME="vibeindex"

start_postgres() {
  echo "[setup-db] Ensuring PostgreSQL is running..."

  if ! command -v pg_ctl &>/dev/null; then
    echo "[setup-db] WARNING: pg_ctl not found. Cannot start PostgreSQL."
    return 1
  fi

  if [ ! -d "$PGDATA" ]; then
    echo "[setup-db] Initializing database cluster..."
    initdb -D "$PGDATA" -U postgres --auth=trust 2>&1
    mkdir -p "$SOCKET_DIR"
    cat >> "$PGDATA/postgresql.conf" <<EOF
unix_socket_directories = '$SOCKET_DIR'
listen_addresses = 'localhost'
EOF
  fi

  mkdir -p "$SOCKET_DIR"

  if pg_isready -h "$SOCKET_DIR" -U postgres -q 2>/dev/null; then
    echo "[setup-db] PostgreSQL is already running."
    return 0
  fi

  rm -f "$PGDATA/postmaster.pid"

  pg_ctl -D "$PGDATA" -l "$PGLOG" -o "-k $SOCKET_DIR" start 2>&1

  for i in $(seq 1 10); do
    if pg_isready -h "$SOCKET_DIR" -U postgres -q 2>/dev/null; then
      echo "[setup-db] PostgreSQL is ready."
      return 0
    fi
    sleep 1
  done

  echo "[setup-db] WARNING: PostgreSQL did not become ready in time."
  tail -10 "$PGLOG" 2>/dev/null
  return 1
}

create_database() {
  if ! psql -h "$SOCKET_DIR" -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "[setup-db] Creating database '$DB_NAME'..."
    createdb -h "$SOCKET_DIR" -U postgres "$DB_NAME" 2>&1
  else
    echo "[setup-db] Database '$DB_NAME' already exists."
  fi
}

push_schema() {
  echo "[setup-db] Pushing schema to database..."
  export DATABASE_URL="postgresql://postgres@localhost:5432/$DB_NAME?host=$SOCKET_DIR"
  yes 2>/dev/null | npx drizzle-kit push 2>&1 || {
    echo "[setup-db] WARNING: drizzle-kit push failed (non-fatal)."
  }
}

if start_postgres; then
  create_database
  push_schema
  echo "[setup-db] Database setup complete."
else
  echo "[setup-db] WARNING: Could not start PostgreSQL. Skipping schema push."
  echo "[setup-db] The app will start and attempt to connect on its own."
fi
