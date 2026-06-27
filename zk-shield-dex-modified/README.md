# 🛡️ ZK Shield DEX — Stellar Privacy Trading Layer

> Zero-knowledge private trading on Stellar Testnet. Prove your trade is valid without revealing your amount, balance, or strategy.

[![Stellar Testnet](https://img.shields.io/badge/Stellar-Testnet-blue)](https://testnet.stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-purple)](https://soroban.stellar.org)
[![Noir](https://img.shields.io/badge/ZK-Noir%20UltraPlonk-green)](https://noir-lang.org)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ /connect     │   │ /trade       │   │ /status          │    │
│  │ Wallet setup │──▶│ Enter intent │──▶│ Show result      │    │
│  └──────────────┘   └──────┬───────┘   └──────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │ POST /api/create-trade-intent
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js)                           │
│                                                                 │
│  1. Read balance from Stellar Horizon API (real on-chain data)  │
│  2. Validate: balance >= amount, amount > 0                     │
│  3. Generate ZK circuit witness (private inputs)                │
│  4. Run zkProofService → produce proof + public signals         │
│  5. Submit proof to Soroban contract via RPC                    │
│  6. Execute DEX trade via Stellar path payment                  │
└────────────────────────┬───────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌─────────────────┐          ┌──────────────────────┐
│  STELLAR HORIZON│          │  SOROBAN RPC          │
│  horizon-testnet│          │  soroban-testnet      │
│  .stellar.org   │          │  .stellar.org         │
│                 │          │                       │
│  • Load account │          │  ZkPrivacyDex contract│
│  • Balances     │          │  • submit_proof()     │
│  • Path payment │          │  • execute_trade()    │
│  • TX submit    │          │  • get_trade_status() │
└─────────────────┘          └──────────────────────┘

ZK PROOF FLOW (inside backend):
  Private inputs → [Noir Circuit] → Proof bytes + Public signals
  
  Private (NEVER leaves server):     Public (on-chain):
  • wallet_balance                   • nullifier (H(secret,nonce))
  • trade_amount                     • commitment (H(balance,amount,...))
  • asset_secret                     • nonce
  • nullifier_secret                 • has_price_limit
  • price_limit                      • merkle_root
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| ZK Circuit | Noir (UltraPlonk / BN254) |
| Smart Contract | Soroban (Rust) on Stellar Testnet |
| Stellar SDK | @stellar/stellar-sdk v12 |

---

## Project Structure

```
zk-shield-dex/
├── frontend/                    # Next.js App Router frontend
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # Landing / hero page
│       │   ├── connect/         # Wallet connection page
│       │   ├── trade/           # Trade intent + ZK proof UI
│       │   └── status/          # Trade result page
│       ├── components/
│       │   └── NavBar.tsx
│       └── lib/
│           ├── api.ts           # Backend API client
│           └── wallet.tsx       # Wallet context
│
├── backend/                     # Express API server
│   └── src/
│       ├── index.ts             # Server entrypoint
│       ├── routes/
│       │   └── trade.ts         # API routes
│       └── services/
│           ├── stellarService.ts  # Horizon + Soroban integration
│           └── zkProofService.ts  # ZK proof generation
│
├── contract/                    # Soroban smart contract (Rust)
│   ├── Cargo.toml
│   └── src/lib.rs               # ZkPrivacyDex contract
│
├── circuit/                     # Noir ZK circuit
│   ├── Nargo.toml
│   └── src/main.nr              # Trade validity circuit
│
├── deploy-contract.sh           # One-click Testnet deploy
├── fund-relayer.sh              # Friendbot funder
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Rust + Cargo (for contract)
- [Stellar CLI](https://github.com/stellar/stellar-cli) (`cargo install --locked stellar-cli --features opt`)
- [Nargo](https://noir-lang.org/getting_started/installation) (`noirup`)

### 1. Backend Setup

```bash
cd backend
cp .env.example .env

# Generate a relayer keypair
node -e "
  const { Keypair } = require('@stellar/stellar-sdk');
  const kp = Keypair.random();
  console.log('Public:', kp.publicKey());
  console.log('Secret:', kp.secret());
"

# Fund via Friendbot
curl "https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY"
# Or visit: https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY in your browser

# Edit .env with your secret key
# RELAYER_SECRET_KEY=S...your_key

npm install
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

### 3. (Optional) Deploy Soroban Contract

```bash
# From project root:
./deploy-contract.sh

# Copy CONTRACT_ID output to backend/.env
# CONTRACT_ID=C...your_contract_id
```

Without a deployed contract the backend will throw a clear error and refuse to process any trade or transfer — it does not fall back to simulation. Deploy the contract first.

---

## User Flow (Demo)

### 1. Connect Wallet
- Open http://localhost:3000/connect
- Click "Connect with Freighter" (requires [Freighter](https://freighter.app))
- Or enter a Testnet public key manually
- Or click a demo wallet

**Get testnet XLM:** https://friendbot.stellar.org/?addr=YOUR_KEY

### 2. Enter Trade
- Select XLM → USDC (or reverse)
- Enter amount (kept private)
- Optional: set max price limit (also private)
- Click **"Generate ZK Proof & Trade"**

### 3. Watch ZK Proof Generation
The UI shows each step:
```
✓ Reading on-chain balance (Horizon API)
✓ Preparing ZK circuit witness
✓ Computing nullifier & commitment hashes
● Generating UltraPlonk proof (Noir)   ← running
○ Running local proof verification
● Submitting proof → Soroban contract
```

### 4. View Result
- Trade hash shown (opaque — no details)
- Before/After ZK comparison panel
- Explorer links to Testnet TXs

---

## ZK Circuit Details

**File:** `circuit/src/main.nr`

### What the circuit proves (without revealing):
```
1. trade_amount > 0
2. wallet_balance >= trade_amount  
3. values fit in 64-bit range
4. nullifier = H(nullifier_secret, nonce)     ← double-spend prevention
5. commitment = H(balance, amount, asset_secret, nullifier_secret)
6. if has_price_limit: price_limit > 0
7. merkle_root != 0 (asset registry check)
```

### Public signals (safe to put on-chain):
- `nullifier` — spend tag, prevents replay
- `commitment` — binds all private inputs
- `nonce` — timestamp/epoch
- `has_price_limit` — 0 or 1
- `merkle_root` — valid asset set root

### To compile and generate a real proof (requires Nargo):
```bash
cd circuit
nargo compile
nargo prove --witness-name trade_witness
nargo verify
```

---

## Soroban Contract

**File:** `contract/src/lib.rs`

### Functions

| Function | Description |
|----------|-------------|
| `initialize(admin, vk_hash)` | Deploy with admin + verification key |
| `submit_proof(submitter, proof)` | Verify ZK proof, record commitment |
| `execute_trade(trade_hash)` | Mark verified trade as settled |
| `get_trade_status(trade_hash)` | 0=unknown, 1=verified, 2=settled |
| `is_nullifier_used(nullifier)` | Double-spend check |
| `trade_count()` | Total private trades |

### What's stored on-chain (privacy-preserving):
```rust
struct TradeRecord {
    nullifier: BytesN<32>,   // spend tag only
    commitment: BytesN<32>,  // binding hash only
    status: u32,             // 0/1/2
    ledger: u32,             // sequence number
    trade_hash: BytesN<32>,  // H(nullifier, commitment)
}
// ❌ amount NOT stored
// ❌ balance NOT stored  
// ❌ asset details NOT stored
// ❌ wallet address NOT stored
```

---

## API Reference

### `POST /api/create-trade-intent`
```json
{
  "walletAddress": "GABC...XYZ",
  "fromAsset": "XLM",
  "toAsset": "USDC",
  "amountXlm": "100",
  "priceLimitXlm": "0.09"
}
```
Response: `{ "intentId": "uuid", "status": "ready" }`

### `POST /api/generate-proof`
```json
{ "intentId": "uuid" }
```
Response: `{ "proofId": "uuid", "publicInputs": { nullifier, commitment, nonce, ... }, "generationTimeMs": 850 }`

### `POST /api/submit-proof`
```json
{ "proofId": "uuid" }
```
Response: `{ "status": "settled", "tradeHash": "0x...", "verificationTxHash": "...", "executionTxHash": "...", "ledger": 123456 }`

### `GET /api/wallet/:address`
Returns XLM and USDC balances from Stellar Testnet Horizon.

### `GET /health`
Returns service status and contract mode.

---

## ZK Proof Implementation

`zkProofService.ts` already uses real Noir proofs — there is no simulated fallback. It dynamically imports `@noir-lang/noir_js` and `@noir-lang/backend_barretenberg` at runtime and runs a genuine BN254 UltraPlonk proof through the Barretenberg backend.

The only prerequisite is that the circuit artifact exists at `backend/circuit/trade_proof.json`. If it is missing, the service throws a clear error telling you to compile it — it never silently returns fake data.

Similarly, Soroban contract verification is not simulated. If `CONTRACT_ID` is not set in `backend/.env`, the backend throws immediately and refuses to process any trade or transfer. There is no silent fallback.

---

## Testnet Resources

| Resource | URL |
|----------|-----|
| Friendbot (get XLM) | https://friendbot.stellar.org/?addr=YOUR_KEY |
| Stellar Expert | https://stellar.expert/explorer/testnet |
| Horizon API | https://horizon-testnet.stellar.org |
| Soroban RPC | https://soroban-testnet.stellar.org |
| Freighter Wallet | https://freighter.app |

---

## Security Notes

- **Testnet only** — no real funds at risk
- The relayer submits transactions, so the user's wallet is not directly linked to on-chain trades
- Nullifiers prevent double-spending without revealing trade details
- The Soroban contract verifies the real UltraPlonk proof on-chain — this is not simulated

---

## Hackathon Demo Script (< 3 minutes)

1. **(30s)** Open the app, show the landing page — explain the concept
2. **(30s)** Connect demo wallet, show Testnet XLM balance loaded from Horizon
3. **(45s)** Go to Trade page, enter amount — show "🔒 This value will be hidden"
4. **(30s)** Click "Generate ZK Proof & Trade" — watch the 5-step proof pipeline animate
5. **(30s)** Show Status page: Before/After ZK toggle — highlight that only hashes appear on-chain
6. **(15s)** Click explorer link — show the Testnet transaction exists but reveals no trade details

**Key talking points:**
- Real Stellar Testnet data (Horizon API balance reads)
- ZK proof cryptographically prevents amount/balance leakage
- Soroban contract verifies proof and records only opaque hashes
- Double-spend protection via nullifiers
- Relayer pattern hides user identity from on-chain observers
