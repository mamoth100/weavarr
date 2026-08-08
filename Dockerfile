# Multi-stage build: keeps the final image to just the pruned standalone
# server output, not the full node_modules/dev toolchain used to build it.
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 weavarr \
    && mkdir -p /app/data \
    && chown weavarr:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=weavarr:nodejs /app/.next/standalone ./
COPY --from=builder --chown=weavarr:nodejs /app/.next/static ./.next/static

# /app/data holds the SQLite DB, poster cache, and small JSON state files -
# mount a volume here so it survives container restarts/image updates.
VOLUME /app/data

USER weavarr
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
