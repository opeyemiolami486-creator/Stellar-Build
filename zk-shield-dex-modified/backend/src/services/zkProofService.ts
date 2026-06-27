/**
 * ZK Proof Service — Real Noir UltraPlonk proofs
 *
 * Uses @noir-lang/noir_js + @noir-lang/backend_barretenberg to generate
 * genuine BN254 UltraPlonk proofs from the trade_proof circuit.
 *
 * SETUP (one-time):
 *   cd circuit && nargo compile
 *   cp target/trade_proof.json ../backend/circuit/trade_proof.json
 *
 * The circuit artifact must exist at backend/circuit/trade_proof.json.
 * If it is missing the service throws a clear error — it never silently
 * returns fake data.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface TradeIntent {
  walletAddress: string;
  walletBalance: bigint;   // in stroops (1 XLM = 10_000_000 stroops)
  tradeAmount: bigint;     // in stroops
  assetCode: string;       // e.g. "XLM", "USDC"
  priceLimitStroops: bigint; // 0 = no limit
}

export interface ZkPublicInputs {
  nullifier: string;      // hex-encoded 32 bytes (Pedersen hash output)
  commitment: string;     // hex-encoded 32 bytes (Pedersen hash output)
  nonce: bigint;
  hasPriceLimit: number;
  merkleRoot: string;     // hex-encoded 32 bytes
}

export interface ZkProofResult {
  proofBytes: string;         // hex-encoded real UltraPlonk proof
  publicInputs: ZkPublicInputs;
  proofId: string;
  generatedAt: number;
}

// ── Noir circuit artifact ─────────────────────────────────────────────────────

const CIRCUIT_PATH = path.resolve(__dirname, "../../circuit/trade_proof.json");

function loadCircuit(): object {
  if (!fs.existsSync(CIRCUIT_PATH)) {
    throw new Error(
      `Circuit artifact not found at ${CIRCUIT_PATH}.\n` +
      `Compile it first:\n` +
      `  cd circuit && nargo compile\n` +
      `  cp target/trade_proof.json ../backend/circuit/trade_proof.json`
    );
  }
  return JSON.parse(fs.readFileSync(CIRCUIT_PATH, "utf-8"));
}

// ── Merkle root for testnet asset registry ────────────────────────────────────
// In production: computed from the on-chain asset registry at each epoch.
// For testnet: a fixed non-zero root that the Soroban contract also expects.
const TESTNET_ASSET_MERKLE_ROOT =
  "0x" + "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";

// ── Proof generation ──────────────────────────────────────────────────────────

export async function generateZkProof(intent: TradeIntent): Promise<ZkProofResult> {
  // ── Validate inputs ────────────────────────────────────────────────────────
  if (intent.tradeAmount <= 0n) {
    throw new Error("Trade amount must be greater than 0");
  }
  if (intent.walletBalance < intent.tradeAmount) {
    throw new Error("Insufficient balance for trade");
  }
  if (intent.walletBalance > 2n ** 63n) {
    throw new Error("Balance exceeds 63-bit range");
  }

  // ── Generate random secrets ────────────────────────────────────────────────
  const assetSecret  = randomField();
  const nullifierSecret = randomField();
  const nonce = BigInt(Date.now()); // monotonic; replace with chain epoch in production

  // ── Compute public inputs using Pedersen hashes ────────────────────────────
  // These are computed INSIDE the Noir circuit as constraints.
  // We pre-compute them here to build the public inputs struct that goes
  // on-chain and to cross-check against the proof's public outputs.
  //
  // nullifier = pedersen_hash([nullifier_secret, nonce])
  // commitment = pedersen_hash([wallet_balance, trade_amount, asset_secret, nullifier_secret])
  //
  // Because we cannot run the Barretenberg Pedersen hash in plain Node.js
  // without the WASM backend, we derive the public inputs by running the
  // circuit itself (the backend extracts them from the witness after proving).
  // We pass placeholders here; the real values come from noirResult.publicInputs.

  // ── Load and run the Noir circuit ─────────────────────────────────────────
  // Dynamic import so the module is only loaded when actually needed.
  let Noir: any, BarretenbergBackend: any;
  try {
    ({ Noir } = await import("@noir-lang/noir_js"));
    ({ BarretenbergBackend } = await import("@noir-lang/backend_barretenberg"));
  } catch {
    throw new Error(
      "Noir WASM packages not installed.\n" +
      "Run: cd backend && npm install @noir-lang/noir_js @noir-lang/backend_barretenberg"
    );
  }

  const circuit = loadCircuit();

  const backend = new BarretenbergBackend(circuit, { threads: 4 });
  const noir    = new Noir(circuit, backend);

  // Build the full witness (private + public inputs) as Noir field elements.
  // Noir fields are BN254 scalars; bigints fit if < BN254 prime.
  const witness = {
    // Private
    wallet_balance:   intent.walletBalance.toString(),
    trade_amount:     intent.tradeAmount.toString(),
    asset_secret:     assetSecret.toString(),
    nullifier_secret: nullifierSecret.toString(),
    price_limit:      intent.priceLimitStroops.toString(),
    // Public — Noir will compute and verify nullifier + commitment internally;
    // we supply nonce, has_price_limit, merkle_root.
    // nullifier and commitment are derived by the circuit from the secrets above
    // so we pass them as 0 and the circuit writes the correct values.
    // (Noir's noir_js API accepts computed public inputs as part of the witness.)
    nullifier:        "0",  // circuit constraint derives this; overridden by prove()
    commitment:       "0",  // same
    nonce:            nonce.toString(),
    has_price_limit:  (intent.priceLimitStroops > 0n ? 1 : 0).toString(),
    merkle_root:      BigInt(TESTNET_ASSET_MERKLE_ROOT).toString(),
  };

  // generateProof returns { proof: Uint8Array, publicInputs: string[] }
  const { proof: proofBytes, publicInputs: rawPublicInputs } =
    await noir.generateProof(witness);

  await backend.destroy();

  // rawPublicInputs = [nullifier, commitment, nonce, has_price_limit, merkle_root]
  // order matches the `pub` parameters in main.nr top-to-bottom
  const [nullifierField, commitmentField, nonceField, hasPriceLimitField, merkleRootField] =
    rawPublicInputs as string[];

  const publicInputs: ZkPublicInputs = {
    nullifier:    fieldToHex32(nullifierField),
    commitment:   fieldToHex32(commitmentField),
    nonce:        BigInt(nonceField),
    hasPriceLimit: Number(hasPriceLimitField),
    merkleRoot:   fieldToHex32(merkleRootField),
  };

  const proofHex = "0x" + Buffer.from(proofBytes).toString("hex");
  const proofId  = crypto.randomUUID();

  return {
    proofBytes: proofHex,
    publicInputs,
    proofId,
    generatedAt: Date.now(),
  };
}

// ── Local pre-check before submitting to Soroban ──────────────────────────────

export async function verifyProofLocally(proof: ZkProofResult): Promise<boolean> {
  if (!proof.proofBytes || proof.proofBytes.length < 34) return false;

  const { nullifier, commitment, nonce, merkleRoot } = proof.publicInputs;
  if (!nullifier.startsWith("0x")  || nullifier.length  !== 66) return false;
  if (!commitment.startsWith("0x") || commitment.length !== 66) return false;
  if (nonce <= 0n) return false;
  if (!merkleRoot.startsWith("0x") || merkleRoot.length !== 66) return false;
  if (nullifier === commitment) return false;

  // Full cryptographic verification using Barretenberg
  try {
    let Noir: any, BarretenbergBackend: any;
    ({ Noir } = await import("@noir-lang/noir_js"));
    ({ BarretenbergBackend } = await import("@noir-lang/backend_barretenberg"));

    const circuit  = loadCircuit();
    const backend  = new BarretenbergBackend(circuit, { threads: 4 });
    const noir     = new Noir(circuit, backend);

    const proofBytes = Buffer.from(proof.proofBytes.replace("0x", ""), "hex");

    const publicInputs = [
      fieldFromHex32(proof.publicInputs.nullifier),
      fieldFromHex32(proof.publicInputs.commitment),
      proof.publicInputs.nonce.toString(),
      proof.publicInputs.hasPriceLimit.toString(),
      fieldFromHex32(proof.publicInputs.merkleRoot),
    ];

    const valid = await noir.verifyProof({ proof: proofBytes, publicInputs });
    await backend.destroy();
    return valid;
  } catch (err) {
    console.error("Local proof verification error:", err);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomField(): bigint {
  // BN254 prime — our random secrets must be < p
  const BN254_PRIME =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const bytes = crypto.randomBytes(32);
  let val = 0n;
  for (const b of bytes) val = (val << 8n) | BigInt(b);
  return val % BN254_PRIME;
}

/** Convert a decimal field string from Noir to 0x-prefixed 32-byte hex. */
function fieldToHex32(field: string): string {
  const n = BigInt(field);
  const buf = Buffer.alloc(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return "0x" + buf.toString("hex");
}

/** Convert a 0x-hex string back to a decimal field string for Noir. */
function fieldFromHex32(hex: string): string {
  return BigInt(hex).toString();
}
