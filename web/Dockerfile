FROM node:22.16.0-alpine AS base

WORKDIR /usr/src/app
# Mirrors api/Dockerfile's corepack pin (ADR-0006: pnpm is the sole dependency manager).
RUN npm install -g corepack@0.36.0 && corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/app/package.json packages/app/package.json
COPY packages/admin/package.json packages/admin/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .

# --- App dev server (Vite, HMR) ---
FROM base AS app-dev
EXPOSE 5173
# ^ documentation only (default WEB_APP_PORT) — the real port is docker-compose.yml's
# WEB_APP_PORT-derived host+container mapping; may differ from 5173, see ADR-0009.
CMD ["pnpm", "--filter", "app", "run", "dev"]

# --- Admin dev server (Vite, HMR) ---
FROM base AS admin-dev
EXPOSE 5174
# ^ documentation only (default WEB_ADMIN_PORT) — see the app-dev target's note above.
CMD ["pnpm", "--filter", "admin", "run", "dev"]
