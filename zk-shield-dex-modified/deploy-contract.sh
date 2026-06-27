#!/usr/bin/env bash
# deploy-contract.sh — Build and deploy ZkPrivacyDex to Stellar Testnet
# Usage: ./deploy-contract.sh

set -e

echo "🛡️  ZK Shield DEX — Contract Deployment"
echo "========================================="
echo ""

# ── Prerequisites check ────────────────────────────────────────────────────────
if ! command -v stellar &> /dev/null; then
  echo "❌ Stellar CLI not found. Install it:"
  echo "   cargo install --locked stellar-cli --features opt"
  exit 1
fi

if ! command -v cargo &> /dev/null; then
  echo "❌ Rust/Cargo not found. Install from https://rustup.rs"
  exit 1
fi

# ── Generate or load identity ──────────────────────────────────────────────────
echo "📋 Setting up Stellar identity..."

IDENTITY_NAME="zk-shield-deployer"
if ! stellar keys show "$IDENTITY_NAME" &> /dev/null; then
  stellar keys generate "$IDENTITY_NAME" --network testnet
  echo "✅ Generated new identity: $IDENTITY_NAME"
fi

PUBLIC_KEY=$(stellar keys address "$IDENTITY_NAME")
echo "   Public key: $PUBLIC_KEY"

# ── Fund via Friendbot ────────────────────────────────────────────────────────
echo ""
echo "💧 Funding via Friendbot (Testnet only)..."
curl -s "https://friendbot.stellar.org/?addr=$PUBLIC_KEY" | python3 -m json.tool | grep -E '"hash"|"successful"' || true
echo ""

# ── Build WASM ────────────────────────────────────────────────────────────────
echo "🔨 Building contract WASM..."
cd "$(dirname "$0")/contract"

rustup target add wasm32-unknown-unknown 2>/dev/null || true
cargo build --target wasm32-unknown-unknown --release --quiet

WASM_PATH="target/wasm32-unknown-unknown/release/zk_privacy_dex.wasm"
if [ ! -f "$WASM_PATH" ]; then
  echo "❌ WASM build failed. Check Rust version (requires >= 1.74)"
  exit 1
fi

WASM_SIZE=$(wc -c < "$WASM_PATH")
echo "   WASM size: ${WASM_SIZE} bytes"
echo "✅ Build successful"

# ── Deploy contract ────────────────────────────────────────────────────────────
echo ""
echo "🚀 Deploying to Stellar Testnet..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source "$IDENTITY_NAME" \
  --network testnet)

echo ""
echo "✅ Contract deployed!"
echo "   Contract ID: $CONTRACT_ID"

# ── Initialize contract ────────────────────────────────────────────────────────
echo ""
echo "🔧 Initializing contract..."

# Testnet placeholder VK hash — in production replace with the real
# Barretenberg UltraPlonk verification key hash for your compiled circuit.
VK_HASH="deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$IDENTITY_NAME" \
  --network testnet \
  -- initialize \
  --admin "$PUBLIC_KEY" \
  --vk_hash "$VK_HASH" \
  2>/dev/null && echo "✅ Contract initialized" || echo "⚠️  Already initialized or init skipped"

# ── Output env config ──────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE"
echo "════════════════════════════════════════════"
echo ""
echo "Add these to your backend/.env file:"
echo ""
echo "CONTRACT_ID=$CONTRACT_ID"
SECRET_KEY=$(stellar keys export "$IDENTITY_NAME" 2>/dev/null || echo "MANUAL_EXPORT_REQUIRED")
echo "RELAYER_SECRET_KEY=$SECRET_KEY"
echo ""
echo "Verify on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
echo ""

cd ..
