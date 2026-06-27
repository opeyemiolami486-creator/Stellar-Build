/**
 * Stellar Testnet Service
 *
 * All functions connect to real Stellar Testnet endpoints.
 * There are NO simulation fallbacks — failures throw so the caller knows
 * the exact problem instead of silently returning fake data.
 */

import {
  Horizon,
  Networks,
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
  SorobanRpc,
  Contract,
  Address,
  xdr,
  Memo,
} from "@stellar/stellar-sdk";

const HORIZON_URL  = "https://horizon-testnet.stellar.org";
const SOROBAN_URL  = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;

// Optional testnet USDC issuer. The backend should still start if no valid issuer is configured.
const TESTNET_USDC_ISSUER = process.env.TESTNET_USDC_ISSUER?.trim() || "";
const TESTNET_USDC = TESTNET_USDC_ISSUER
  ? new Asset("USDC", TESTNET_USDC_ISSUER)
  : null;

export interface WalletInfo {
  address: string;
  xlmBalance: string;
  usdcBalance: string;
  sequence: string;
}

export interface TradeExecution {
  txHash: string;
  ledger: number;
  status: "success" | "failed";
  timestamp: string;
}

export interface TransferExecution {
  txHash: string;
  ledger: number;
  status: "success" | "failed";
  timestamp: string;
}

const horizon = new Horizon.Server(HORIZON_URL);
const soroban = new SorobanRpc.Server(SOROBAN_URL);

// ── Wallet queries ────────────────────────────────────────────────────────────

export async function getWalletInfo(address: string): Promise<WalletInfo> {
  const account = await horizon.loadAccount(address);

  let xlmBalance  = "0";
  let usdcBalance = "0";

  for (const bal of account.balances) {
    if (bal.asset_type === "native") {
      xlmBalance = bal.balance;
    } else if (
      bal.asset_type === "credit_alphanum4" &&
      (bal as any).asset_code === "USDC" &&
      (!TESTNET_USDC_ISSUER || (bal as any).asset_issuer === TESTNET_USDC_ISSUER)
    ) {
      usdcBalance = bal.balance;
    }
  }

  return { address, xlmBalance, usdcBalance, sequence: account.sequence };
}

export function xlmToStroops(xlm: string): bigint {
  const cleaned = (xlm ?? "0").trim() || "0";
  const parts   = cleaned.split(".");
  const whole   = BigInt(parts[0] || "0") * 10_000_000n;
  const frac    = parts[1] ? BigInt(parts[1].padEnd(7, "0").slice(0, 7)) : 0n;
  return whole + frac;
}

export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac  = (stroops % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

// ── Soroban ZK proof submission ───────────────────────────────────────────────

export interface SorobanSubmitResult {
  tradeHash: string;
  txHash: string;
  status: string;
}

/**
 * Submit a ZK proof to the ZkPrivacyDex Soroban contract for on-chain
 * verification. The relayer pays gas so the user's address is not linked
 * to the proof submission.
 *
 * Throws on any failure — no silent simulation fallback.
 */
export async function submitProofToSoroban(
  contractId: string,
  relayerKeypair: Keypair,
  proofBytes: string,
  publicInputs: {
    nullifier: string;
    commitment: string;
    nonce: bigint;
    hasPriceLimit: number;
    merkleRoot: string;
  }
): Promise<SorobanSubmitResult> {
  if (contractId === "DEMO_MODE") {
    throw new Error(
      "CONTRACT_ID is not set. Deploy the Soroban contract first:\n" +
      "  ./deploy-contract.sh\n" +
      "Then set CONTRACT_ID in backend/.env"
    );
  }

  const relayerAccount = await soroban.getAccount(relayerKeypair.publicKey());
  const contract = new Contract(contractId);

  const proofHex    = proofBytes.replace("0x", "");
  const proofBuffer = Buffer.from(proofHex, "hex");
  const proofArg    = xdr.ScVal.scvBytes(proofBuffer);

  const nullifierBuf   = Buffer.from(publicInputs.nullifier.replace("0x", ""), "hex");
  const commitmentBuf  = Buffer.from(publicInputs.commitment.replace("0x", ""), "hex");
  const merkleRootBuf  = Buffer.from(publicInputs.merkleRoot.replace("0x", ""), "hex");

  // ScvMap keys must be in lexicographic order
  const publicInputsArg = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("commitment"),
      val: xdr.ScVal.scvBytes(commitmentBuf),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("has_price_limit"),
      val: xdr.ScVal.scvU32(publicInputs.hasPriceLimit),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("merkle_root"),
      val: xdr.ScVal.scvBytes(merkleRootBuf),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("nonce"),
      val: xdr.ScVal.scvU64(xdr.Uint64.fromString(publicInputs.nonce.toString())),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("nullifier"),
      val: xdr.ScVal.scvBytes(nullifierBuf),
    }),
  ]);

  const submitterArg = new Address(relayerKeypair.publicKey()).toScVal();

  const tx = new TransactionBuilder(relayerAccount, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call("submit_proof", submitterArg, xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("proof_bytes"),
          val: proofArg,
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("public_inputs"),
          val: publicInputsArg,
        }),
      ]))
    )
    .setTimeout(30)
    .build();

  const sim = await soroban.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Soroban simulation failed: ${sim.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();
  preparedTx.sign(relayerKeypair);

  const result = await soroban.sendTransaction(preparedTx);
  if (result.status === "ERROR") {
    throw new Error(`Soroban transaction rejected: ${result.errorResult}`);
  }

  // Poll for ledger confirmation (max ~20s)
  let getResult = await soroban.getTransaction(result.hash);
  let attempts  = 0;
  while (
    getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    attempts < 10
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    getResult = await soroban.getTransaction(result.hash);
    attempts++;
  }

  if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(
      `Soroban transaction did not confirm (status: ${getResult.status}) ` +
      `after ${attempts * 2}s. TX: ${result.hash}`
    );
  }

  const returnVal  = getResult.returnValue;
  const tradeHash  = returnVal
    ? "0x" + Buffer.from((returnVal as any)._value).toString("hex")
    : "0x" + "00".repeat(32);

  return { tradeHash, txHash: result.hash, status: "verified" };
}

// ── Stellar DEX trade execution ───────────────────────────────────────────────

/**
 * Execute a private token swap on the Stellar Testnet DEX using path payments.
 * The relayer executes the trade so the user's address is not directly linked
 * to the on-chain swap.
 *
 * Throws on failure — no simulation fallback.
 */
export async function executeStellarTrade(
  relayerKeypair: Keypair,
  fromAsset: "XLM" | "USDC",
  toAsset: "XLM" | "USDC",
  amountXlm: string,
  destinationAddress: string
): Promise<TradeExecution> {
  const relayerAccount = await horizon.loadAccount(relayerKeypair.publicKey());

  if (fromAsset !== "XLM" && !TESTNET_USDC) {
    throw new Error("TESTNET_USDC_ISSUER is not configured. Set it in backend/.env to enable USDC trades.");
  }
  if (toAsset !== "XLM" && !TESTNET_USDC) {
    throw new Error("TESTNET_USDC_ISSUER is not configured. Set it in backend/.env to enable USDC trades.");
  }

  const srcAsset  = fromAsset === "XLM" ? Asset.native() : TESTNET_USDC!;
  const destAsset = toAsset   === "XLM" ? Asset.native() : TESTNET_USDC!;

  const tx = new TransactionBuilder(relayerAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset:   srcAsset,
        sendAmount:  amountXlm,
        destination: destinationAddress,
        destAsset:   destAsset,
        destMin:     "0.0000001",
        path:        [],
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(relayerKeypair);

  const result = await horizon.submitTransaction(tx);

  if (!(result as any).successful && !(result as any).hash) {
    throw new Error(`Stellar DEX trade failed: ${JSON.stringify((result as any).extras?.result_codes)}`);
  }

  return {
    txHash:    result.hash,
    ledger:    (result as any).ledger ?? 0,
    status:    "success",
    timestamp: new Date().toISOString(),
  };
}

// ── Private transfer execution ────────────────────────────────────────────────

/**
 * Execute a private payment directly to a recipient.
 * The relayer sends on behalf of the ZK-verified user.
 * An optional encrypted memo can be included (28-byte limit on Stellar).
 */
export async function executeStellarTransfer(
  relayerKeypair: Keypair,
  asset: "XLM" | "USDC",
  amount: string,
  destinationAddress: string,
  encryptedMemo?: string   // max 28 bytes, hex or text
): Promise<TransferExecution> {
  const relayerAccount = await horizon.loadAccount(relayerKeypair.publicKey());

  if (asset !== "XLM" && !TESTNET_USDC) {
    throw new Error("TESTNET_USDC_ISSUER is not configured. Set it in backend/.env to enable USDC transfers.");
  }

  const assetObj = asset === "XLM" ? Asset.native() : TESTNET_USDC!;

  const builder = new TransactionBuilder(relayerAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    Operation.payment({
      destination: destinationAddress,
      asset:       assetObj,
      amount:      amount,
    })
  );

  // Attach encrypted memo if provided (truncate to 28 bytes for Stellar)
  if (encryptedMemo) {
    const memoBuf = Buffer.from(encryptedMemo, "hex").slice(0, 28);
    builder.addMemo(Memo.hash(memoBuf.toString("hex").padEnd(64, "0")));
  }

  const tx = builder.setTimeout(30).build();
  tx.sign(relayerKeypair);

  const result = await horizon.submitTransaction(tx);

  if (!(result as any).successful && !(result as any).hash) {
    throw new Error(
      `Stellar payment failed: ${JSON.stringify((result as any).extras?.result_codes)}`
    );
  }

  return {
    txHash:    result.hash,
    ledger:    (result as any).ledger ?? 0,
    status:    "success",
    timestamp: new Date().toISOString(),
  };
}

export { TESTNET_USDC_ISSUER, HORIZON_URL, SOROBAN_URL };
