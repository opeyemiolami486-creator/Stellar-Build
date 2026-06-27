#!/usr/bin/env bash
# .devcontainer/setup.sh
# Runs once when the Codespace is created.
set -e

echo "🛡️  ZK Shield DEX — Codespace Setup"
echo "====================================="

# ── Install Node dependencies ─────────────────────────────────────────────────
echo ""
echo "📦 Installing backend dependencies..."
cd /workspaces/zk-shield-dex/backend
npm install

echo ""
echo "📦 Installing frontend dependencies..."
cd /workspaces/zk-shield-dex/frontend
npm install

# ── Copy env files if not already present ────────────────────────────────────
cd /workspaces/zk-shield-dex

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "✅ Created backend/.env from example"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  echo "✅ Created frontend/.env.local from example"
fi

# ── Install Rust wasm target for contract builds ──────────────────────────────
echo ""
echo "🦀 Setting up Rust WASM target..."
rustup target add wasm32-unknown-unknown 2>/dev/null || true

echo ""
echo "====================================="
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env — add your RELAYER_SECRET_KEY"
echo "     (generate: node -e \"const {Keypair}=require('@stellar/stellar-sdk');const k=Keypair.random();console.log(k.publicKey(),k.secret())\")"
echo "  2. Fund your relayer: curl https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY"
echo "  3. Start backend:   cd backend && npm run dev"
echo "  4. Start frontend:  cd frontend && npm run dev"
echo ""
