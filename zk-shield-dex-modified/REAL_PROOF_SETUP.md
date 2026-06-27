# Setting Up Real ZK Proofs

This document explains how to go from the codebase to a fully live system
with real Noir proofs and real Stellar Testnet transactions.

---

## What changed

| Component | Status |
|---|---|
| `zkProofService.ts` | Real `@noir-lang/noir_js` + Barretenberg UltraPlonk proof — no simulation |
| `stellarService.ts` | Throws on failure — no silent fallback. Soroban verification is real once `CONTRACT_ID` is set |
| `routes/trade.ts` | Both trade + transfer routes use real proofs end-to-end |
| `transfer/page.tsx` | Full flow calls backend: `/create-transfer-intent` → `/generate-transfer-proof` → `/submit-transfer` |

> **Note:** Nothing in this codebase is simulated or mocked. If a required environment variable is missing (e.g. `CONTRACT_ID`, `RELAYER_SECRET_KEY`) or the circuit artifact hasn't been compiled, the backend throws a clear error rather than falling back to fake data.

---

## Step 1 — Install Noir

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup                      # installs latest nargo
nargo --version             # confirm >= 0.31.0
```

## Step 2 — Compile the circuit

```bash
cd circuit
nargo compile
# Creates: circuit/target/trade_proof.json

# Copy the artifact where the backend expects it
mkdir -p ../backend/circuit
cp target/trade_proof.json ../backend/circuit/trade_proof.json
```

Or from the backend directory:

```bash
cd backend && npm run compile-circuit
```

## Step 3 — Install backend dependencies

```bash
cd backend
npm install
# Installs @noir-lang/noir_js and @noir-lang/backend_barretenberg
```

## Step 4 — Set up the relayer

Generate a Stellar keypair:

```bash
node -e "
const { Keypair } = require('@stellar/stellar-sdk');
const kp = Keypair.random();
console.log('Secret:', kp.secret());
console.log('Public:', kp.publicKey());
"
```

Fund the public key on testnet:
https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY

Add to `backend/.env`:

```
RELAYER_SECRET_KEY=S...your-secret...
```

## Step 5 — Deploy the Soroban contract

```bash
# From repo root
./deploy-contract.sh
# Outputs the CONTRACT_ID — add it to backend/.env
CONTRACT_ID=C...your-contract-id...
```

## Step 6 — Run

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

---

## How real proofs work

1. **`/create-transfer-intent`** — reads sender balance from Horizon; validates
   recipient exists on Stellar Testnet.

2. **`/generate-transfer-proof`** — calls `@noir-lang/noir_js`'s `generateProof()`
   with the real BN254 Barretenberg backend. The circuit enforces:
   - `balance >= amount` (without revealing either value)
   - `amount > 0`
   - The nullifier is correctly derived from `nullifier_secret` and `nonce`
   - The commitment binds all private inputs

3. **`verifyProofLocally`** — runs `@noir-lang/noir_js`'s `verifyProof()` before
   submission. If the proof is invalid, the request is rejected server-side.

4. **`/submit-transfer`** — sends the real UltraPlonk proof bytes to the Soroban
   contract via `soroban.sendTransaction()`. The contract re-verifies on-chain.
   Only if that passes does it execute the Stellar `payment` operation.

The recipient sees a real Stellar transaction. The chain sees only the nullifier,
commitment, and merkle root — not the amount, not the sender's balance, not the
recipient's address (it's inside the proof).

---

## Proof generation time

Barretenberg UltraPlonk on a modern CPU (no GPU):

| Circuit size (gates) | Approx time |
|---|---|
| ~2 000 (trade_proof) | 2–5 seconds |
| ~10 000 | 10–20 seconds |

For production: run the backend on a machine with multiple cores and pass
`{ threads: navigator.hardwareConcurrency }` to `BarretenbergBackend`.
