FROM node:22.16.0-alpine AS base

WORKDIR /usr/src/app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --- Development Stage (API) ---
FROM base AS development
RUN pnpm install --frozen-lockfile
COPY . .
RUN chmod +x ./docker-prisma-migration.sh
RUN npx prisma generate
ENTRYPOINT ["./docker-prisma-migration.sh"]
EXPOSE 3001
CMD ["pnpm", "start"]

# --- Worker Stage ---
FROM base AS worker
RUN pnpm install --frozen-lockfile
COPY . .
RUN chmod +x ./docker-prisma-migration.sh
RUN npx prisma generate
CMD ["pnpm", "worker:start:dev"]
