FROM node:22.16.0-alpine AS base

WORKDIR /usr/src/app
COPY package*.json ./

# --- Development Stage (API) ---
FROM base AS development
RUN yarn install
COPY . .
RUN chmod +x ./docker-prisma-migration.sh
RUN npx prisma generate
ENTRYPOINT ["./docker-prisma-migration.sh"]
EXPOSE 3001
CMD ["yarn", "start"]

# --- Worker Stage ---
FROM base AS worker
RUN yarn install
COPY . .
RUN chmod +x ./docker-prisma-migration.sh
RUN npx prisma generate
CMD ["yarn", "worker:start:dev"]