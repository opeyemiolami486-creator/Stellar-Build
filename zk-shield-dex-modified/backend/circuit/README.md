# Circuit Artifact

This directory holds the compiled Noir circuit artifact (`trade_proof.json`) that the backend loads at runtime to generate and verify ZK proofs.

## How to generate it

```bash
# From the repo root
cd circuit
nargo compile
# Creates: circuit/target/trade_proof.json

cp target/trade_proof.json ../backend/circuit/trade_proof.json
```

Or from the backend directory:

```bash
npm run compile-circuit
```

The backend will throw a clear error on startup if this file is missing — it does not fall back to simulation.

## Requirements

- Nargo >= 0.31.0 — install via `noirup`: https://noir-lang.org/docs/getting_started/installation/
