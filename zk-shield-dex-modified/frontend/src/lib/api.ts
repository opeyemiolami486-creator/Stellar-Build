// Frontend API client — all calls go to the ZK Shield DEX backend

const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : "http://localhost:3001");

export interface WalletInfo {
  address: string;
  xlmBalance: string;
  usdcBalance: string;
}

export interface WalletProviderInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  installUrl: string;
  deepLinkSchema?: string;
  supportsMobile: boolean;
}

export interface TradeIntentResponse {
  intentId: string;
  status: string;
  message: string;
}

export interface ProofResponse {
  proofId: string;
  status: string;
  generationTimeMs: number;
  publicInputs: {
    nullifier: string;
    commitment: string;
    nonce: string;
    hasPriceLimit: number;
    merkleRoot: string;
  };
}

export interface SubmitResponse {
  status: string;
  tradeHash: string;
  verificationTxHash: string;
  executionTxHash: string;
  ledger: number;
  timestamp: string;
  explorerUrl: string;
  message: string;
}

export interface TransferSubmitResponse {
  status: string;
  transferHash: string;
  verificationTxHash: string;
  executionTxHash: string;
  ledger: number;
  timestamp: string;
  explorerUrl: string;
  message: string;
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export const api = {
  // ── Wallet ────────────────────────────────────────────────────────────────
  getWallet: async (address: string): Promise<WalletInfo> => {
    const res = await fetch(`${BASE}/api/wallet/${address}`);
    if (!res.ok) throw new Error("Wallet not found on Testnet");
    return res.json();
  },

  getWalletProviders: async (): Promise<WalletProviderInfo[]> => {
    const res = await fetch(`${BASE}/api/wallet/providers`);
    if (!res.ok) throw new Error("Could not load wallet providers");
    const data = await res.json();
    return data.providers ?? [];
  },

  verifyWallet: async (address: string, provider?: string) => {
    const res = await fetch(`${BASE}/api/wallet/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, provider }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Wallet verification failed");
    }
    return res.json();
  },

  health: async () => {
    const res = await fetch(`${BASE}/health`);
    return res.json();
  },

  // ── Trade (swap) ──────────────────────────────────────────────────────────
  createIntent: (body: {
    walletAddress: string;
    fromAsset: string;
    toAsset: string;
    amountXlm: string;
    priceLimitXlm?: string;
  }) => post<TradeIntentResponse>("/create-trade-intent", body),

  generateProof: (intentId: string) =>
    post<ProofResponse>("/generate-proof", { intentId }),

  submitProof: (proofId: string) =>
    post<SubmitResponse>("/submit-proof", { proofId }),

  // ── Private transfer (payment to recipient) ───────────────────────────────
  createTransferIntent: (body: {
    walletAddress: string;
    recipient: string;
    asset: string;
    amount: string;
    memo?: string;
  }) => post<TradeIntentResponse>("/create-transfer-intent", body),

  generateTransferProof: (intentId: string) =>
    post<ProofResponse>("/generate-transfer-proof", { intentId }),

  submitTransfer: (proofId: string) =>
    post<TransferSubmitResponse>("/submit-transfer", { proofId }),
};
