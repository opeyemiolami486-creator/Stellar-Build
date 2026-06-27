#!/usr/bin/env bash
# start.sh — Start backend + frontend together
# Usage: bash start.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colour helpers
ESC=$'\033'
GREEN="${ESC}[32m"; YELLOW="${ESC}[33m"; CYAN="${ESC}[36m"; RESET="${ESC}[0m"; BOLD="${ESC}[1m"

echo ""
echo "  ${BOLD}${CYAN}🛡️  ZK Shield DEX${RESET}"
echo "  Starting backend + frontend..."
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "  ${YELLOW}⚠ backend/.env not found. Creating from example...${RESET}"
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "  ${YELLOW}  Edit backend/.env and add RELAYER_SECRET_KEY before trading.${RESET}"
fi

if [ ! -f "$ROOT/frontend/.env.local" ]; then
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env.local"
fi

# ── Install if needed ─────────────────────────────────────────────────────────
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "  📦 Installing backend deps..."
  (cd "$ROOT/backend" && npm install --silent)
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "  📦 Installing frontend deps..."
  (cd "$ROOT/frontend" && npm install --silent)
fi

# ── Detect Codespaces and set correct URLs ────────────────────────────────────
if [ -n "${CODESPACE_NAME:-}" ]; then
  BACKEND_URL="https://${CODESPACE_NAME}-3001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  # Update frontend .env.local with the codespace backend URL
  if grep -q "NEXT_PUBLIC_BACKEND_URL" "$ROOT/frontend/.env.local"; then
    sed -i "s|NEXT_PUBLIC_BACKEND_URL=.*|NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}|" "$ROOT/frontend/.env.local"
  else
    echo "NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}" >> "$ROOT/frontend/.env.local"
  fi
  echo "  ${GREEN}✓ Codespace detected — backend URL set to:${RESET}"
  echo "    ${CYAN}${BACKEND_URL}${RESET}"
fi

echo ""
echo "  ${GREEN}Starting servers...${RESET}"
echo "  ${BOLD}Backend:  http://localhost:3001${RESET}"
echo "  ${BOLD}Frontend: http://localhost:3000${RESET}"
echo ""
echo "  Press Ctrl+C to stop both."
echo ""

# ── Run both ──────────────────────────────────────────────────────────────────
trap 'kill 0' EXIT INT TERM

(
  cd "$ROOT/backend"
  npm run dev 2>&1 | sed "s/^/  ${CYAN}[backend]${RESET} /"
) &

(
  cd "$ROOT/frontend"
  npm run dev 2>&1 | sed "s/^/  ${GREEN}[frontend]${RESET} /"
) &

wait
