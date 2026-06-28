// Frontend API client — all calls go to the ZK Shield DEX backend

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) {
      return "http://localhost:3001";
    }

    // If the frontend is served from the same origin as the backend (for example behind a reverse proxy),
    // use a relative URL so the browser does not need a hard-coded backend host.
    return "";
  }

  return "http://localhost:3001";
}

const BASE = getBaseUrl();

function getApiUrl(path: string): string {
  if (!BASE) return `/api${path}`;
  return `${BASE}/api${path}`;
}

export interface WalletInfo {
  address: string;
  xlmBalance: string;
  usdcBalance: string;
  exists?: boolean;
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
  executionTxHash?: string;
  ledger?: number;
  timestamp?: string;
  explorerUrl?: string;
  message: string;
}

export interface TransferSubmitResponse {
  status: string;
  transferHash: string;
  verificationTxHash: string;
  executionTxHash?: string;
  ledger?: number;
  timestamp?: string;
  explorerUrl?: string;
  message: string;
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(getApiUrl(path), {
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
    const res = await fetch(getApiUrl(`/wallet/${address}`));
    if (!res.ok) throw new Error("Wallet not found on Testnet");
    return res.json();
  },

  getWalletProviders: async (): Promise<WalletProviderInfo[]> => {
    const res = await fetch(getApiUrl("/wallet/providers"));
    if (!res.ok) throw new Error("Could not load wallet providers");
    const data = await res.json();
    return data.providers ?? [];
  },

  verifyWallet: async (address: string, provider?: string) => {
    const res = await fetch(getApiUrl("/wallet/verify"), {
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
    const res = await fetch(`${BASE ? `${BASE}/health` : "/health"}`);
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

  settleProof: (proofId: string) =>
    post<SubmitResponse>("/settle-proof", { proofId }),

  submitProof: (proofId: string, skipExecution: boolean = false) =>
    post<SubmitResponse>("/submit-proof", { proofId, skipExecution }),

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

  submitTransfer: (proofId: string, skipExecution: boolean = false) =>
    post<TransferSubmitResponse>("/submit-transfer", { proofId, skipExecution }),
};
