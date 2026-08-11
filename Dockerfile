# syntax=docker/dockerfile:1
# =============================================================================
# Osora Studio
#
# ffmpeg is installed in the runtime stage, not just at build time. This is the
# whole reason the app runs on a container rather than on a serverless
# platform: without ffprobe, no audio asset can ever be marked ready, so the
# binary is a hard runtime dependency rather than a build convenience.
# =============================================================================

# --- deps --------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- build -------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# ffmpeg brings ffprobe with it. Both are required at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AUDIO_STORAGE_DIR=/data/audio

RUN groupadd --system --gid 1001 osora \
  && useradd --system --uid 1001 --gid osora osora \
  && mkdir -p /data/audio \
  && chown -R osora:osora /data

# Next's standalone output ships only the files the server actually needs.
COPY --from=build --chown=osora:osora /app/.next/standalone ./
COPY --from=build --chown=osora:osora /app/.next/static ./.next/static
COPY --from=build --chown=osora:osora /app/public ./public

USER osora
EXPOSE 3000
VOLUME ["/data/audio"]

# Reports unhealthy when ffprobe is missing or storage is not writable — a
# studio that cannot measure is broken, not merely degraded.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
