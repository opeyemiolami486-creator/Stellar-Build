#!/usr/bin/env bash
# fund-relayer.sh — Fund the relayer wallet via Stellar Testnet Friendbot
# Usage: ./fund-relayer.sh <PUBLIC_KEY>
# Or:    ./fund-relayer.sh   (reads from backend/.env)

set -e

if [ -n "$1" ]; then
  PUBLIC_KEY="$1"
else
  # Try to read from .env
  ENV_FILE="$(dirname "$0")/backend/.env"
  if [ -f "$ENV_FILE" ]; then
    SECRET=$(grep RELAYER_SECRET_KEY "$ENV_FILE" | cut -d= -f2)
    if command -v node &> /dev/null && [ -n "$SECRET" ]; then
      PUBLIC_KEY=$(node -e "
        const { Keypair } = require('@stellar/stellar-sdk');
        console.log(Keypair.fromSecret('$SECRET').publicKey());
      " 2>/dev/null)
    fi
  fi
fi

if [ -z "$PUBLIC_KEY" ]; then
  echo "Usage: $0 <STELLAR_PUBLIC_KEY>"
  echo "Or set RELAYER_SECRET_KEY in backend/.env"
  exit 1
fi

echo "💧 Funding $PUBLIC_KEY via Friendbot..."
RESPONSE=$(curl -s "https://friendbot.stellar.org/?addr=$PUBLIC_KEY")
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo ""
echo "Check balance:"
echo "  https://stellar.expert/explorer/testnet/account/$PUBLIC_KEY"
