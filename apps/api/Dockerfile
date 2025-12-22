# syntax=docker/dockerfile:1
#
# Carioca Online API (NestJS) - Cloud Run ready
# - Uses npm workspaces from repo root
# - Builds only @carioca/api
#
FROM node:20-slim AS deps
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

# Install workspace deps (will only install what's in lockfile)
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

# Copy source (only what we need)
COPY apps/api ./apps/api

# Build API
RUN npm run build -w @carioca/api

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Cloud Run uses PORT=8080 by default
ENV PORT=8080

# Copy runtime artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

EXPOSE 8080

# Run the NestJS compiled output
CMD ["node", "apps/api/dist/main.js"]
