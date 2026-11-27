#!/usr/bin/env bash
# Resets the public demo (docker-compose.prod.yml) to a known-good state. Run from the repo folder on the server.
#
#   scripts/reset-demo.sh save      # after a successful seed: snapshot the demo data (MongoDB, Qdrant, PDFs)
#   scripts/reset-demo.sh           # put that snapshot back (takes seconds; the app is down for ~30 s)
#   scripts/reset-demo.sh reseed    # no snapshot? delete the demo notebook and seed it again (slow on a CPU)
#
# The demo account is read-only, so visitors can't change much, but this gets back to a clean demo after
# anything odd (a half-written lesson, an experiment of your own). Nightly, from cron:
#   15 4 * * * cd /home/ubuntu/examlens && scripts/reset-demo.sh >> reset-demo.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
PROJECT=examlens-prod # the "name:" in docker-compose.prod.yml; volumes are <project>_<volume>
VOLUMES=(mongo_data qdrant_data uploads)
DATA_SERVICES=(server ai-service mongo qdrant) # stopped while files are copied, so the copy is consistent
SNAPSHOT_DIR="$PWD/backups/demo-snapshot"

log() { echo "[reset-demo] $(date '+%F %T') $*"; }

save() {
  mkdir -p "$SNAPSHOT_DIR"
  log "stopping ${DATA_SERVICES[*]}"
  "${COMPOSE[@]}" stop "${DATA_SERVICES[@]}"
  for v in "${VOLUMES[@]}"; do
    log "saving $v"
    docker run --rm -v "${PROJECT}_$v:/v:ro" -v "$SNAPSHOT_DIR:/b" alpine tar czf "/b/$v.tgz" -C /v .
  done
  "${COMPOSE[@]}" up -d
  log "snapshot saved in $SNAPSHOT_DIR ($(du -sh "$SNAPSHOT_DIR" | cut -f1))"
}

restore() {
  for v in "${VOLUMES[@]}"; do
    [[ -f "$SNAPSHOT_DIR/$v.tgz" ]] || { log "no snapshot at $SNAPSHOT_DIR/$v.tgz: run '$0 save' after seeding, or '$0 reseed'"; exit 1; }
  done
  log "stopping ${DATA_SERVICES[*]}"
  "${COMPOSE[@]}" stop "${DATA_SERVICES[@]}"
  for v in "${VOLUMES[@]}"; do
    log "restoring $v"
    docker run --rm -v "${PROJECT}_$v:/v" -v "$SNAPSHOT_DIR:/b:ro" alpine \
      sh -c "find /v -mindepth 1 -delete && tar xzf /b/$v.tgz -C /v"
  done
  "${COMPOSE[@]}" up -d
  log "demo restored"
}

reseed() {
  log "deleting the demo notebook and seeding it again (hours with local models on a CPU)"
  "${COMPOSE[@]}" --profile demo run --rm seed node scripts/seed-demo.mjs --reset
}

case "${1:-restore}" in
  save) save ;;
  restore) restore ;;
  reseed) reseed ;;
  *) echo "usage: $0 [save|restore|reseed]"; exit 1 ;;
esac
