#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
COUNTER=0
while [ $COUNTER -lt 5 ]; do
  if sh -c 'cat < /dev/null > /dev/tcp/postgres/5432' 2>/dev/null; then
    echo "PostgreSQL is up"
    break
  fi
  COUNTER=$((COUNTER + 1))
  echo "Attempt $COUNTER/30: PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "Running migrations..."
npx dotenv -e .env.development -- npx prisma migrate deploy
# Start the main application
exec "$@"