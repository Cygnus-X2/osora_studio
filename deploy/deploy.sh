#!/usr/bin/env bash
# =============================================================================
# Build and start Osora Studio. Run from the repository root on the server:
#
#   ./deploy/deploy.sh
#
# Refuses to finish quietly if the container comes up without a working audio
# toolchain — a studio that cannot measure cannot mark anything ready, so a
# green "started" message would be misleading.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.example and fill it in." >&2
  exit 1
fi

# Compose needs OSORA_DOMAIN at interpolation time, not just inside the app.
set -a
# shellcheck disable=SC1091
source .env.production
set +a

if [[ -z "${OSORA_DOMAIN:-}" ]]; then
  echo "! OSORA_DOMAIN is not set — Caddy will serve plain HTTP on :80."
  echo "  Set it to a hostname pointed at this server to get automatic TLS."
fi

echo "→ Building"
docker compose build

echo "→ Starting"
docker compose up -d

echo "→ Waiting for health"
for attempt in $(seq 1 40); do
  status="$(docker compose ps --format json app 2>/dev/null \
    | sed -n 's/.*"Health":"\([a-z]*\)".*/\1/p' | head -1)"
  if [[ "$status" == "healthy" ]]; then
    echo "  healthy after ${attempt} checks"
    break
  fi
  if [[ "$status" == "unhealthy" ]]; then
    echo "! Container reported unhealthy." >&2
    docker compose logs --tail 60 app >&2
    exit 1
  fi
  sleep 3
done

echo "→ Verifying the audio toolchain inside the container"
docker compose exec -T app node -e "
fetch('http://127.0.0.1:3000/api/health')
  .then(r => r.json())
  .then(d => {
    const c = d.checks;
    console.log('  ffprobe:', c.ffprobe, '| ffmpeg:', c.ffmpeg, '| storage writable:', c.storageWritable, '| persistent:', c.storagePersistent);
    if (!c.ffprobe || !c.ffmpeg) {
      console.error('  ffmpeg is missing in the runtime image. Nothing can be measured, so nothing can be published.');
      process.exit(1);
    }
    if (!c.storagePersistent) {
      console.error('  AUDIO_STORAGE_DIR is unset — audio would not survive a restart.');
      process.exit(1);
    }
  })
  .catch(e => { console.error('  health check failed:', e.message); process.exit(1); });
"

echo
echo "Deployed. ${OSORA_DOMAIN:+https://${OSORA_DOMAIN}}${OSORA_DOMAIN:-http://<server-ip>}"
docker compose ps
