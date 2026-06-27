"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TradeResult {
  status: string;
  tradeHash: string;
  verificationTxHash: string;
  executionTxHash: string;
  ledger: number;
  timestamp: string;
  message: string;
  _zkOnly?: boolean;
}

function HashDisplay({ label, hash }: { label: string; hash: string }) {
  const [copied, setCopied] = useState(false);
  const short = hash ? `${hash.slice(0, 14)}...${hash.slice(-10)}` : "—";

  function copy() {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-slate-500 text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <span className="terminal text-slate-300 text-xs">{short}</span>
        <button
          onClick={copy}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          title="Copy full hash"
        >
          {copied ? "✓" : "⎘"}
        </button>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const router = useRouter();
  const [result, setResult] = useState<TradeResult | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("zk_last_trade");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {}
    }
  }, []);

  function handleNewTrade() {
    localStorage.removeItem("zk_last_trade");
    router.push("/trade");
  }

  if (!result) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h1 className="text-2xl font-bold text-white mb-2">No Trade Found</h1>
        <p className="text-slate-400 text-sm mb-8">
          No recent trade result found. Start a new private trade.
        </p>
        <Link
          href="/trade"
          className="inline-block px-6 py-3 rounded-xl font-semibold text-white
            bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF] hover:opacity-90 transition-opacity"
        >
          Go to Trade →
        </Link>
      </div>
    );
  }

  const settled = result.status === "settled";
  const explorerBase = "https://stellar.expert/explorer/testnet/tx/";

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">{settled ? "✅" : "⏳"}</div>
        <h1 className="text-3xl font-bold text-white mb-2">
          {settled ? "Trade Settled" : "Trade Pending"}
        </h1>
        <p className="text-slate-400 text-sm">
          {settled
            ? "Your private trade executed successfully on Stellar Testnet."
            : "Your trade is being processed..."}
        </p>
      </div>

      {/* Privacy notice */}
      <div className="card-glow rounded-2xl p-5 mb-5 border-[#00C896]/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
          <span className="text-[#00C896] font-semibold text-sm">ZK Privacy Active</span>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          🛡️ Your trade amount, token pair, and wallet balance are{" "}
          <strong className="text-white">cryptographically hidden</strong>. Only
          opaque proof hashes are stored on-chain — no sensitive data was ever revealed.
        </p>
      </div>

      {/* On-chain records — hashes only, no plaintext trade info */}
      <div className="card-glow rounded-2xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
          On-Chain Records
        </h2>
        <HashDisplay label="Trade Hash (opaque)" hash={result.tradeHash} />
        <HashDisplay label="Soroban Verification TX" hash={result.verificationTxHash} />
        <HashDisplay label="Stellar DEX Execution TX" hash={result.executionTxHash} />
        <div className="flex items-center justify-between py-2">
          <span className="text-slate-500 text-xs">Ledger</span>
          <span className="terminal text-slate-300 text-xs">
            {result.ledger.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-slate-500 text-xs">Timestamp</span>
          <span className="terminal text-slate-300 text-xs">
            {new Date(result.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* What's hidden — now including token pair */}
      <div className="card-glow rounded-2xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
          What the ZK Proof Hid
        </h2>
        <div className="space-y-2">
          {[
            { label: "Swap Amount",      value: "████████" },
            { label: "Token Pair",       value: "████ → ████" },
            { label: "Wallet Balance",   value: "████████" },
            { label: "Trade Strategy",   value: "████████" },
            { label: "Wallet Address",   value: "████████████" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="terminal text-[#6B4EFF] text-xs opacity-60">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-3">
          These values existed only inside the ZK circuit witness and were never transmitted on-chain.
        </p>
      </div>

      {/* Compare: before / after ZK */}
      <div className="card-glow rounded-2xl p-5 mb-5">
        <p className="text-sm font-semibold text-slate-400 mb-3">📊 What an observer sees</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-red-400 text-xs font-semibold mb-2">❌ WITHOUT ZK</p>
            <div className="terminal text-xs space-y-1 text-slate-400">
              <p>amount: <span className="text-red-400">150 XLM</span></p>
              <p>balance: <span className="text-red-400">2,340 XLM</span></p>
              <p>pair: <span className="text-red-400">XLM → USDC</span></p>
              <p>wallet: <span className="text-red-400">GABC...XYZ</span></p>
              <p>price: <span className="text-red-400">0.089</span></p>
            </div>
            <p className="text-red-400 text-xs mt-2">👁 All visible on-chain</p>
          </div>
          <div className="rounded-xl bg-[#00C896]/10 border border-[#00C896]/20 p-3">
            <p className="text-[#00C896] text-xs font-semibold mb-2">✅ WITH ZK</p>
            <div className="terminal text-xs space-y-1 text-slate-400">
              <p>nullifier: <span className="text-[#6B4EFF]">0x7f3a...</span></p>
              <p>commit: <span className="text-[#6B4EFF]">0x2c91...</span></p>
              <p>pair: <span className="text-[#6B4EFF]">hidden</span></p>
              <p>wallet: <span className="text-[#6B4EFF]">hidden</span></p>
              <p>price: <span className="text-[#6B4EFF]">hidden</span></p>
            </div>
            <p className="text-[#00C896] text-xs mt-2">🔒 Only hashes on-chain</p>
          </div>
        </div>
      </div>

      {/* Explorer links */}
      <div className="card-glow rounded-2xl p-4 mb-6">
        <p className="text-xs text-slate-500 mb-2">Verify proof on Stellar Expert:</p>
        <div className="space-y-1.5">
          {result.verificationTxHash && (
            <a
              href={`${explorerBase}${result.verificationTxHash.replace("0x", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-[#6B4EFF] hover:underline terminal"
            >
              → Soroban Verification TX ↗
            </a>
          )}
          {result.executionTxHash && (
            <a
              href={`${explorerBase}${result.executionTxHash.replace("0x", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-[#6B4EFF] hover:underline terminal"
            >
              → DEX Execution TX ↗
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleNewTrade}
          className="flex-1 py-3 rounded-xl font-semibold text-white
            bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF]
            hover:opacity-90 transition-opacity"
        >
          New Private Trade
        </button>
        <Link
          href="/connect"
          className="px-5 py-3 rounded-xl font-semibold text-slate-400
            bg-slate-800 hover:bg-slate-700 transition-colors text-sm flex items-center"
        >
          Switch Wallet
        </Link>
      </div>
    </div>
  );
}
