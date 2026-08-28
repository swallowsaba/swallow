#!/usr/bin/env bash
# RAW Studio — one-shot setup for WSL2 Ubuntu (and plain Linux).
#
# Prefers Docker if available (docker compose --profile dev). Otherwise falls
# back to a native Node setup (installs deps, starts the Vite dev server).
# Re-runnable and safe: it only installs what's missing.
#
#   ./scripts/setup.sh          # auto: Docker if present, else native
#   ./scripts/setup.sh docker   # force Docker
#   ./scripts/setup.sh native   # force native Node
#   ./scripts/setup.sh build    # native production build into ./dist
set -euo pipefail

# Resolve repo root (this script lives in scripts/).
cd "$(dirname "$0")/.."

MODE="${1:-auto}"
NODE_MIN_MAJOR=20

log()  { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

start_docker() {
  if ! have docker; then
    err "Docker not found. Install Docker Desktop (with WSL2 integration) or run: ./scripts/setup.sh native"
    exit 1
  fi
  # 'docker compose' (v2) or legacy 'docker-compose'.
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif have docker-compose; then
    DC="docker-compose"
  else
    err "docker compose not found. Update Docker, or run: ./scripts/setup.sh native"
    exit 1
  fi
  log "Starting dev server in Docker on http://localhost:5173 (Ctrl+C to stop)…"
  exec $DC --profile dev up --build
}

check_node() {
  if ! have node; then
    err "Node.js not found. Install Node ${NODE_MIN_MAJOR}+ (e.g. via nvm) then re-run."
    err "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    err "  nvm install ${NODE_MIN_MAJOR}"
    exit 1
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt "$NODE_MIN_MAJOR" ]; then
    err "Node ${major} is too old; need ${NODE_MIN_MAJOR}+. Use: nvm install ${NODE_MIN_MAJOR}"
    exit 1
  fi
  log "Node $(node -v) OK."
}

install_deps() {
  check_node
  if [ -f package-lock.json ]; then
    log "Installing dependencies (npm ci)…"
    npm ci
  else
    log "Installing dependencies (npm install)…"
    npm install
  fi
}

start_native() {
  install_deps
  log "Starting Vite dev server on http://localhost:5173 (Ctrl+C to stop)…"
  # --host makes it reachable from the Windows browser under WSL2.
  VITE_BASE=/ exec npm run dev -- --host 0.0.0.0 --port 5173
}

build_native() {
  install_deps
  log "Building production bundle into ./dist …"
  VITE_BASE=/ npm run build
  log "Done. Serve ./dist with any static server that sets COOP/COEP headers."
  log "  (e.g. 'docker compose --profile prod up --build' serves it with the right headers on :8080)"
}

case "$MODE" in
  auto)
    if have docker; then
      log "Docker detected — using the Docker dev workflow."
      start_docker
    else
      warn "Docker not found — falling back to native Node."
      start_native
    fi
    ;;
  docker) start_docker ;;
  native) start_native ;;
  build)  build_native ;;
  *) err "Unknown mode '$MODE'. Use: auto | docker | native | build"; exit 1 ;;
esac
