import { Asset, Account, Networks, Memo, Operation, TransactionBuilder, Horizon, StrKey } from "@stellar/stellar-sdk";
import { requestAccess, signTransaction } from "@stellar/freighter-api";

export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const DEFAULT_TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const TESTNET_USDC_ISSUER =
  process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER?.trim() || DEFAULT_TESTNET_USDC_ISSUER;

function normalizeAmount(amount: string): string {
  const cleaned = amount?.toString().trim();
  if (!cleaned) throw new Error("Amount is required");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return value.toFixed(7).replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}

function computeDestMin(amount: string, priceLimit: string): string {
  const amountValue = Number(amount);
  const limitValue = Number(priceLimit);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new Error("Trade amount must be a positive number");
  }
  if (!Number.isFinite(limitValue) || limitValue <= 0) {
    throw new Error("Price limit must be a positive number");
  }

  const outputValue = amountValue / limitValue;
  return outputValue > 0 ? outputValue.toFixed(7).replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1") : "0.0000001";
}

function validateStellarAddress(address: string, label = "address"): string {
  const trimmed = (address ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    throw new Error(`${label} must be a valid Stellar public key starting with 'G'`);
  }
  return trimmed;
}

function getUsdcAsset(): Asset {
  if (!process.env.NEXT_PUBLIC_TESTNET_USDC_ISSUER?.trim()) {
    console.warn(
      "[stellar] NEXT_PUBLIC_TESTNET_USDC_ISSUER is not set, using hardcoded testnet USDC issuer fallback"
    );
  }
  return new Asset("USDC", TESTNET_USDC_ISSUER);
}

export async function buildTradeTransactionXdr(
  walletAddress: string,
  fromAsset: "XLM" | "USDC",
  toAsset: "XLM" | "USDC",
  amount: string,
  priceLimit?: string
): Promise<string> {
  if (fromAsset === toAsset) {
    throw new Error("From and to assets must be different for a trade");
  }

  const normalizedAmount = normalizeAmount(amount);
  const sourceAsset = fromAsset === "XLM" ? Asset.native() : getUsdcAsset();
  const destAsset = toAsset === "XLM" ? Asset.native() : getUsdcAsset();
  const destMin = priceLimit ? computeDestMin(normalizedAmount, priceLimit) : "0.0000001";

  const normalizedWalletAddress = validateStellarAddress(walletAddress, "walletAddress");
  console.debug("[buildTradeTransactionXdr] walletAddress:", normalizedWalletAddress, {
    fromAsset,
    toAsset,
    amount: normalizedAmount,
    priceLimit,
  });

  const server = new Horizon.Server(HORIZON_URL);
  const sourceAccount = await server.loadAccount(normalizedWalletAddress);
  const account = new Account(normalizedWalletAddress, sourceAccount.sequence);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: sourceAsset,
        sendAmount: normalizedAmount,
        destination: normalizedWalletAddress,
        destAsset,
        destMin,
        path: [],
      })
    )
    .setTimeout(30)
    .build();

  console.debug("[buildTradeTransactionXdr] operations:", tx.operations.map((op) => op.type));
  console.debug("[buildTradeTransactionXdr] tx XDR:", tx.toXDR());

  return tx.toXDR();
}

export async function buildTransferTransactionXdr(
  walletAddress: string,
  recipient: string,
  asset: "XLM" | "USDC",
  amount: string,
  memo?: string
): Promise<string> {
  const normalizedAmount = normalizeAmount(amount);
  const validatedRecipient = validateStellarAddress(recipient, "recipient");
  const paymentAsset = asset === "XLM" ? Asset.native() : getUsdcAsset();

  console.debug("[buildTransferTransactionXdr] recipient:", validatedRecipient, {
    asset,
    amount: normalizedAmount,
  });

  const server = new Horizon.Server(HORIZON_URL);
  const sourceAccount = await server.loadAccount(walletAddress);
  const account = new Account(walletAddress, sourceAccount.sequence);

  const builder = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.payment({
      destination: validatedRecipient,
      asset: paymentAsset,
      amount: normalizedAmount,
    })
  );

  if (memo) {
    const trimmed = memo.trim().slice(0, 28);
    if (trimmed) {
      builder.addMemo(Memo.text(trimmed));
    }
  }

  const tx = builder.setTimeout(30).build();
  console.debug("[buildTransferTransactionXdr] operations:", tx.operations.map((op) => op.type));
  console.debug("[buildTransferTransactionXdr] tx XDR:", tx.toXDR());
  return tx.toXDR();
}

export async function signAndSubmitTransactionXdr(
  transactionXdr: string,
  walletAddress: string
): Promise<{ hash: string; ledger: number; [key: string]: any }> {
  console.debug("[signAndSubmitTransactionXdr] signing transaction for:", walletAddress);
  console.debug("[signAndSubmitTransactionXdr] transactionXdr:", transactionXdr);
  await requestAccess();
  const signedXdr = await signTransaction(transactionXdr, {
    networkPassphrase: Networks.TESTNET,
    accountToSign: walletAddress,
  });

  const response = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: signedXdr }),
  });

  const result = await response.json();
  if (!response.ok) {
    const errMsg = result && result.extras && result.extras.result_codes
      ? JSON.stringify(result.extras.result_codes)
      : result?.detail ?? response.statusText;
    throw new Error(`Horizon submit failed: ${errMsg}`);
  }

  return result;
}
