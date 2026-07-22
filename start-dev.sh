#!/usr/bin/env bash
# ── Arabclue local dev launcher — portable, self-healing ──
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Arabclue dev setup @ $ROOT"

# Ensure required folders exist (gitignored)
mkdir -p db uploads public/uploads .next

# Check bun / node
if ! command -v bun >/dev/null 2>&1; then
  echo "!! bun not found, falling back to npx"
  PKG_MGR="npm"
else
  PKG_MGR="bun"
fi

# Ensure .env exists
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "!! Edit .env before first run (BOOTSTRAP_ADMIN_PASSWORD, NEXTAUTH_SECRET, ARABCLUE_ENC_KEY)"
fi

# Check DATABASE_URL shape for SQLite
if grep -q "file:./db/custom.db" .env 2>/dev/null; then
  echo "==> Using local SQLite file:./db/custom.db"
else
  echo "==> DATABASE_URL custom, keep as-is"
fi

# Kill old dev servers on 3000 (port check, not global pkill)
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "==> Port 3000 busy, killing existing process..."
  lsof -i :3000 -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Prisma generate
echo "==> prisma generate"
if [ "$PKG_MGR" = "bun" ]; then
  bun run db:generate
else
  npx prisma generate
fi

# Only push if SQLite local db missing or requested
if [ ! -f db/custom.db ] || [ "${1:-}" = "--reset-db" ]; then
  echo "==> db push (creating/migrating local SQLite)"
  if [ "$PKG_MGR" = "bun" ]; then
    bun run db:push:dev || true
  else
    npx prisma db push || true
  fi
else
  echo "==> db/custom.db exists, skipping push (use --reset-db to force)"
fi

# Launch dev server detached if --daemon else foreground
if [ "${1:-}" = "--daemon" ] || [ "${2:-}" = "--daemon" ]; then
  echo "==> Launching dev server in background (daemon)..."
  pkill -f "next dev" 2>/dev/null || true
  sleep 1
  # use nohup + setsid portable
  nohup setsid ${PKG_MGR} run dev > dev.log 2>&1 < /dev/null &
  echo $! > dev.pid
  disown || true
  echo "==> PID $(cat dev.pid) — log tail:"
  sleep 2
  tail -n 40 dev.log || true
  echo ""
  echo "==> Running at http://localhost:3000 — admin: ${BOOTSTRAP_ADMIN_EMAIL:-admin@arabclue.sa}"
else
  echo "==> Starting dev server foreground @ http://localhost:3000"
  echo "    (Ctrl+C to stop, or run with --daemon for background)"
  if [ "$PKG_MGR" = "bun" ]; then
    bun run dev
  else
    npm run dev
  fi
fi
