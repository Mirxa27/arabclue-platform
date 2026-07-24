#!/usr/bin/env bash
# ── Arabclue local dev launcher ──
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPOSITORY_ROOT"

echo "==> Arabclue dev setup @ $REPOSITORY_ROOT"

# Ensure required folders exist (gitignored)
mkdir -p db uploads public/uploads

# This repository is locked and tested with Bun.
if ! command -v bun >/dev/null 2>&1; then
  echo "!! bun is required. Install it or add ~/.bun/bin to PATH."
  exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "!! Configure an isolated PostgreSQL/Neon URL and secrets in .env, then rerun."
  exit 1
fi

# Never kill an unrelated process implicitly.
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "!! Port 3000 is already in use. Stop that process explicitly and retry."
  exit 1
fi

# Generate the client only. Schema changes require a reviewed migration against
# an isolated branch; this launcher never runs db push or migrate.
echo "==> prisma generate"
bun run db:generate

# Launch dev server detached if --daemon else foreground
if [ "${1:-}" = "--daemon" ]; then
  echo "==> Launching dev server in background (daemon)..."
  nohup bun run dev > dev.log 2>&1 < /dev/null &
  echo $! > dev.pid
  disown || true
  echo "==> PID $(cat dev.pid) — log tail:"
  sleep 2
  tail -n 40 dev.log || true
  echo ""
  echo "==> Running at http://localhost:3000"
else
  echo "==> Starting dev server foreground @ http://localhost:3000"
  echo "    (Ctrl+C to stop, or run with --daemon for background)"
  bun run dev
fi
