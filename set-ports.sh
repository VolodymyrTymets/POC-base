#!/bin/sh
# Derives a non-colliding set of ports from one base PORT and writes them into
# the local (gitignored) env files docker-compose and the web apps read.
# Usage: ./set-ports.sh <BASE_PORT>
# Run from the repo root, same as move-env.sh.

if [ -z "$1" ]; then
  echo "Usage: ./set-ports.sh <BASE_PORT>" >&2
  echo "Derives WEB_APP_PORT (=BASE), API_PORT (=BASE+1), WEB_ADMIN_PORT (=BASE+2)," >&2
  echo "POSTGRES_PORT (=BASE+3) and REDIS_PORT (=BASE+4), and writes them into" >&2
  echo "./.env, api/.env, web/packages/app/.env and web/packages/admin/.env" >&2
  exit 1
fi

BASE_PORT=$1

WEB_APP_PORT=$((BASE_PORT))
API_PORT=$((BASE_PORT + 1))
WEB_ADMIN_PORT=$((BASE_PORT + 2))
POSTGRES_PORT=$((BASE_PORT + 3))
REDIS_PORT=$((BASE_PORT + 4))

# Sets KEY=VALUE in FILE: replaces an existing KEY= line, appends otherwise.
# Single awk pass (not append-then-rewrite) so a file whose last line lacks a
# trailing newline doesn't get the appended key silently merged into it.
set_kv() {
  file="$1"
  key="$2"
  value="$3"
  touch "$file"
  awk -v k="$key" -v v="$value" '
    BEGIN { FS = OFS = "=" }
    $1 == k { $0 = k "=" v; found = 1 }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

echo "Deriving ports from base $BASE_PORT:"
echo "  WEB_APP_PORT=$WEB_APP_PORT"
echo "  API_PORT=$API_PORT"
echo "  WEB_ADMIN_PORT=$WEB_ADMIN_PORT"
echo "  POSTGRES_PORT=$POSTGRES_PORT"
echo "  REDIS_PORT=$REDIS_PORT"

echo "Writing $PWD/.env (docker-compose host-port interpolation)..."
set_kv "$PWD/.env" API_PORT "$API_PORT"
set_kv "$PWD/.env" POSTGRES_PORT "$POSTGRES_PORT"
set_kv "$PWD/.env" REDIS_PORT "$REDIS_PORT"
# web-app/web-admin map host==container port (both driven by this same var,
# see docker-compose.yml), so the root .env needs these too, not just each
# app's own .env (which the container's Vite process reads via env_file).
set_kv "$PWD/.env" WEB_APP_PORT "$WEB_APP_PORT"
set_kv "$PWD/.env" WEB_ADMIN_PORT "$WEB_ADMIN_PORT"

echo "Writing $PWD/api/.env (local, non-docker api run)..."
set_kv "$PWD/api/.env" PORT "$API_PORT"

echo "Writing $PWD/web/packages/app/.env..."
set_kv "$PWD/web/packages/app/.env" WEB_APP_PORT "$WEB_APP_PORT"
set_kv "$PWD/web/packages/app/.env" VITE_GRAPHQL_URL "http://localhost:$API_PORT/graphql"

echo "Writing $PWD/web/packages/admin/.env..."
set_kv "$PWD/web/packages/admin/.env" WEB_ADMIN_PORT "$WEB_ADMIN_PORT"
set_kv "$PWD/web/packages/admin/.env" VITE_GRAPHQL_URL "http://localhost:$API_PORT/graphql"

echo "Done."
