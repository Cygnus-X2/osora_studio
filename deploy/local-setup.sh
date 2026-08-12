#!/usr/bin/env bash
# =============================================================================
# Set up a full-fidelity local environment.
#
# "Full fidelity" means the same Postgres major version, the real ffmpeg, and
# the same providers as the server — so that a thing which works locally is
# actually likely to work deployed. A local setup that differs from production
# in the ways that matter is worse than no local setup, because it moves the
# bugs later instead of removing them.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ ffmpeg"
command -v ffmpeg >/dev/null || { echo "  missing. brew install ffmpeg" >&2; exit 1; }
echo "  $(ffprobe -version | head -1)"

echo "→ postgres"
if ! command -v pg_isready >/dev/null; then
  echo "  missing. brew install postgresql@16 && brew services start postgresql@16" >&2
  exit 1
fi
pg_isready -q || brew services start postgresql@16
createdb osora 2>/dev/null || true
echo "  $(psql -d osora -tAc 'select version()' | cut -d, -f1)"

echo "→ .env.local"
[ -f .env.local ] || cp .env.example .env.local
grep -q '^DATABASE_URL=' .env.local || echo "DATABASE_URL=postgres://$USER@localhost:5432/osora" >> .env.local
grep -q '^AUDIO_STORAGE_DIR=' .env.local || echo "AUDIO_STORAGE_DIR=$PWD/.audio-local" >> .env.local
echo "  ready — add ELEVENLABS_API_KEY and set TTS_PROVIDER=elevenlabs to match the server"

echo "→ schema and knowledge base"
set -a; . ./.env.local; set +a
npm run db:migrate
npm run db:seed

cat <<'DONE'

Local environment ready.

  npm run dev        → http://localhost:3000
  npm run db:status  → what is in the database

Verify here first. Deploy when it works:

  rsync -az --exclude node_modules --exclude .next --exclude .git \
    --exclude '.env.local' --exclude '.env.production' \
    ./ root@<server>:/srv/osora/
  ssh root@<server> 'cd /srv/osora && \
    docker compose --env-file .env.production \
      -f deploy/docker-compose.behind-proxy.yml up -d --build app'
DONE
