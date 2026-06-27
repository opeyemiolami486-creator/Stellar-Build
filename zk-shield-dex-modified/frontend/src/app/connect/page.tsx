"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type WalletProviderInfo } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

const DEMO_WALLETS = [
  { label: "Demo Wallet A", address: "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV4C9C8MXHQ" },
  { label: "Demo Wallet B", address: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGYWDNJI8NDYBP1ESHGKEC" },
];

const FALLBACK_PROVIDERS: WalletProviderInfo[] = [
  {
    id: "freighter",
    name: "Freighter",
    type: "extension",
    description: "Browser extension for desktop and laptop use",
    installUrl: "https://www.freighter.app/",
    supportsMobile: false,
  },
  {
    id: "solar",
    name: "Solar Wallet",
    type: "mobile",
    description: "Mobile-first Stellar wallet for iOS and Android",
    installUrl: "https://www.solarwallet.io/",
    deepLinkSchema: "solarwallet://",
    supportsMobile: true,
  },
  {
    id: "xbull",
    name: "xBull Wallet",
    type: "mobile",
    description: "Multi-platform Stellar wallet with mobile support",
    installUrl: "https://www.xbull.app/",
    deepLinkSchema: "xbull://",
    supportsMobile: true,
  },
  {
    id: "albedo",
    name: "Albedo",
    type: "mobile",
    description: "Stellar wallet with browser and mobile compatibility",
    installUrl: "https://albedo.link/",
    deepLinkSchema: "albedo://",
    supportsMobile: true,
  },
];

export default function ConnectPage() {
  const router = useRouter();
  const {
    address: connectedAddress,
    provider: connectedProvider,
    connect,
    connected,
    disconnect,
  } = useWallet();

  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<WalletProviderInfo[]>(FALLBACK_PROVIDERS);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const list = await api.getWalletProviders();
        setProviders(list.length ? list : FALLBACK_PROVIDERS);
      } catch {
        setProviders(FALLBACK_PROVIDERS);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProviders();

    if (connectedAddress) {
      setAddress(connectedAddress);
      api.getWallet(connectedAddress)
        .then((info) => {
          setWalletInfo(info);
          setStatus("success");
        })
        .catch(() => {});
    }
  }, [connectedAddress]);

  async function handleConnect(addr?: string, providerId?: string) {
    const target = (addr ?? address).trim();
    if (!target) return;

    setStatus("loading");
    setError("");

    try {
      const verified = await api.verifyWallet(target, providerId);
      const info = await api.getWallet(verified.address);
      setWalletInfo(info);
      connect(verified.address, providerId ?? verified.provider ?? null);
      setAddress(verified.address);
      setStatus("success");
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? "Could not load wallet from Stellar Testnet");
    }
  }

  async function tryInjectedWallet(providerId: string) {
    if (typeof window === "undefined") return null;

    const win = window as any;

    switch (providerId) {
      case "freighter":
        if (win.freighter?.getPublicKey) {
          const { publicKey } = await win.freighter.getPublicKey();
          return typeof publicKey === "string" ? publicKey : null;
        }
        break;
      case "solar":
        if (win.solar?.getPublicKey) {
          const { publicKey } = await win.solar.getPublicKey();
          return typeof publicKey === "string" ? publicKey : null;
        }
        if (win.solarWallet?.getPublicKey) {
          const { publicKey } = await win.solarWallet.getPublicKey();
          return typeof publicKey === "string" ? publicKey : null;
        }
        break;
      case "xbull":
        if (win.xbull?.getPublicKey) {
          const { publicKey } = await win.xbull.getPublicKey();
          return typeof publicKey === "string" ? publicKey : null;
        }
        break;
      case "albedo":
        if (win.albedo?.publicKey) return win.albedo.publicKey;
        if (win.albedo?.getPublicKey) {
          const publicKey = await win.albedo.getPublicKey();
          return typeof publicKey === "string" ? publicKey : null;
        }
        break;
      default:
        break;
    }

    return null;
  }

  async function connectWalletProvider(providerId: string) {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) return;

    setStatus("loading");
    setError("");

    try {
      const injectedAddress = await tryInjectedWallet(providerId);
      if (injectedAddress) {
        await handleConnect(injectedAddress, providerId);
        return;
      }

      if (typeof window !== "undefined" && provider.deepLinkSchema) {
        window.location.href = provider.deepLinkSchema;
      }

      setStatus("error");
      setError(
        `${provider.name} was not detected in this browser. Open the app on your phone or install it, then paste your public key below to continue.`
      );
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? `${provider.name} connection failed`);
    }
  }

  function handleDisconnect() {
    disconnect();
    setAddress("");
    setWalletInfo(null);
    setStatus("idle");
    setError("");
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-3xl font-bold text-white mb-2">Connect Wallet</h1>
        <p className="text-slate-400 text-sm">Stellar Testnet · Mobile and desktop wallets supported</p>
      </div>

      {connected && connectedAddress && status !== "idle" && (
        <div className="mb-6 p-4 rounded-xl bg-[#00C896]/10 border border-[#00C896]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
            <div>
              <p className="text-[#00C896] text-sm font-semibold">Wallet session active</p>
              <p className="text-slate-400 text-xs font-mono">
                {(connectedAddress ?? "").slice(0, 10)}…{(connectedAddress ?? "").slice(-8)}
              </p>
              {connectedProvider && (
                <p className="text-slate-500 text-[11px] mt-1">Provider: {connectedProvider}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/trade")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white
                bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF] hover:opacity-90"
            >
              Trade →
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400
                bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">Supported wallets</p>
            <p className="text-xs text-slate-500">Choose a wallet provider or connect manually.</p>
          </div>
        </div>
        <div className="grid gap-2">
          {isLoadingProviders ? (
            <div className="text-sm text-slate-500">Loading wallet options…</div>
          ) : (
            providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => connectWalletProvider(provider.id)}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3 text-left transition-colors hover:border-[#6B4EFF]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{provider.name}</p>
                  <p className="text-xs text-slate-500">{provider.description}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {provider.type}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-slate-500 text-xs">or enter manually</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      <div className="card-glow rounded-2xl p-5">
        <label className="block text-slate-300 text-sm font-medium mb-2">
          Stellar Testnet Public Key (G…)
        </label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="GABC...XYZ"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
            text-white text-sm font-mono placeholder-slate-600
            focus:outline-none focus:border-[#6B4EFF] transition-colors"
        />
        <button
          onClick={() => handleConnect()}
          disabled={status === "loading" || !address.trim()}
          className="w-full mt-3 py-3 rounded-xl font-semibold text-white
            bg-slate-700 hover:bg-slate-600 disabled:opacity-40
            transition-colors flex items-center justify-center gap-2"
        >
          {status === "loading" ? (
            <><span className="animate-spin inline-block">⟳</span> Loading from Testnet…</>
          ) : "Connect"}
        </button>

        <div className="mt-4 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-2">Quick demo wallets:</p>
          <div className="flex flex-col gap-2">
            {DEMO_WALLETS.map((w) => (
              <button
                key={w.address}
                onClick={() => handleConnect(w.address)}
                className="text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700
                  text-xs text-slate-300 font-mono transition-colors"
              >
                <span className="text-slate-400">{w.label}: </span>
                {w.address.slice(0, 12)}…{w.address.slice(-8)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {status === "success" && walletInfo && (
        <div className="mt-4 card-glow rounded-2xl p-5 border-[#00C896]/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
            <span className="text-[#00C896] text-sm font-semibold">Connected to Testnet</span>
          </div>
          <div className="space-y-2 terminal text-slate-300 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Address</span>
              <span>{(walletInfo.address ?? "").slice(0, 8)}…{(walletInfo.address ?? "").slice(-6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">XLM Balance</span>
              <span className="text-[#00D2FF]">{parseFloat(walletInfo.xlmBalance || "0").toFixed(2)} XLM</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">USDC Balance</span>
              <span className="text-[#00D2FF]">{parseFloat(walletInfo.usdcBalance || "0").toFixed(2)} USDC</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/trade")}
            className="w-full mt-4 py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-[#6B4EFF] to-[#00C896]
              hover:opacity-90 transition-opacity"
          >
            Start Private Trading →
          </button>
        </div>
      )}

      <p className="text-center text-xs text-slate-600 mt-6">
        Need testnet XLM?{" "}
        <a
          href="https://friendbot.stellar.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#6B4EFF] hover:underline"
        >
          Use Friendbot →
        </a>
      </p>
    </div>
  );
}
