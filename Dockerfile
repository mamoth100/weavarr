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

# su-exec: the entrypoint starts as root only long enough to fix ownership of
# the mounted folders, then switches to the weavarr user for the app itself.
RUN apk add --no-cache su-exec \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 weavarr \
    && mkdir -p /app/data /app/config \
    && chown weavarr:nodejs /app/data /app/config

COPY --from=builder /app/public ./public
COPY --from=builder --chown=weavarr:nodejs /app/.next/standalone ./
COPY --from=builder --chown=weavarr:nodejs /app/.next/static ./.next/static

# /app/data holds the SQLite DB, poster cache, and small JSON state files -
# mount a volume here so it survives container restarts/image updates.
VOLUME /app/data

# /app/config holds the settings file (.env.local). It is a directory, not a
# single-file mount, so a fresh install with no file yet just works: Docker
# creates the empty folder and the app writes the file on the first save.
ENV CONFIG_DIR=/app/config

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 6767, following the same "subtract 1 from each digit" pattern as
# Radarr (7878) and Sonarr (8989).
EXPOSE 6767
ENV PORT=6767
ENV HOSTNAME="0.0.0.0"

# The commit this image was built from - .git is dockerignored, so the host
# passes it in (docker-compose.yml wires GIT_SHA from the environment).
# Drives the version display and the update check in Settings > Status.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# Runs as root just long enough to chown the mounted folders, then drops to
# the weavarr user (see docker-entrypoint.sh). No USER directive on purpose.
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
