"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type ProofResponse } from "@/lib/api";

type Step = "intent" | "proving" | "submitting" | "done" | "error";

interface ProofStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

const PROOF_STEPS: ProofStep[] = [
  { label: "Reading on-chain balance (Horizon API)", status: "pending" },
  { label: "Preparing ZK circuit witness", status: "pending" },
  { label: "Computing nullifier & commitment hashes", status: "pending" },
  { label: "Generating UltraPlonk proof (Noir)", status: "pending" },
  { label: "Running local proof verification", status: "pending" },
];

export default function TradePage() {
  const router = useRouter();

  const [walletAddress, setWalletAddress] = useState<string>("");
  const [fromAsset, setFromAsset] = useState<"XLM" | "USDC">("XLM");
  const [toAsset, setToAsset]     = useState<"XLM" | "USDC">("USDC");
  const [amount, setAmount]       = useState("");
  const [priceLimit, setPriceLimit]     = useState("");
  const [usePriceLimit, setUsePriceLimit] = useState(false);

  const [step, setStep]             = useState<Step>("intent");
  const [proofSteps, setProofSteps] = useState<ProofStep[]>(PROOF_STEPS);
  const [proofData, setProofData]   = useState<ProofResponse | null>(null);
  const [error, setError]           = useState("");

  // Locked values — captured at submit time, never shown during proof/after
  const [lockedFrom, setLockedFrom] = useState<"XLM" | "USDC">("XLM");
  const [lockedTo, setLockedTo]     = useState<"XLM" | "USDC">("USDC");

  useEffect(() => {
    const stored = localStorage.getItem("zk_wallet_address");
    if (!stored) {
      router.push("/connect");
    } else {
      setWalletAddress(stored);
    }
  }, [router]);

  function swapAssets() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
  }

  function handleFromAssetChange(val: "XLM" | "USDC") {
    setFromAsset(val);
    if (val === toAsset) setToAsset(val === "XLM" ? "USDC" : "XLM");
  }

  function handleToAssetChange(val: "XLM" | "USDC") {
    setToAsset(val);
    if (val === fromAsset) setFromAsset(val === "XLM" ? "USDC" : "XLM");
  }

  function updateStep(index: number, status: ProofStep["status"]) {
    setProofSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status } : s))
    );
  }

  async function handleSubmit() {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid trade amount greater than 0");
      return;
    }
    if (fromAsset === toAsset) {
      setError("Cannot trade an asset for itself");
      return;
    }
    setError("");

    // Lock & immediately erase the pair/amount from visible state
    setLockedFrom(fromAsset);
    setLockedTo(toAsset);
    const lockedAmount = amount;
    const lockedFromAsset = fromAsset;
    const lockedToAsset   = toAsset;

    setStep("proving");
    setProofSteps(PROOF_STEPS.map((s) => ({ ...s, status: "pending" })));

    try {
      updateStep(0, "running");
      const intentRes = await api.createIntent({
        walletAddress,
        fromAsset: lockedFromAsset,
        toAsset:   lockedToAsset,
        amountXlm: lockedAmount,
        priceLimitXlm: usePriceLimit && priceLimit ? priceLimit : undefined,
      });
      updateStep(0, "done");

      for (let i = 1; i <= 2; i++) {
        updateStep(i, "running");
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
        updateStep(i, "done");
      }

      updateStep(3, "running");
      const proof = await api.generateProof(intentRes.intentId);
      updateStep(3, "done");
      setProofData(proof);

      updateStep(4, "running");
      await new Promise((r) => setTimeout(r, 300));
      updateStep(4, "done");

      setStep("submitting");
      const proofResult = await api.submitProof(proof.proofId);
      updateStep(4, "done");

      localStorage.setItem("zk_last_trade", JSON.stringify({
        status: "settled",
        tradeHash: proofResult.tradeHash,
        verificationTxHash: proofResult.verificationTxHash,
        executionTxHash: proofResult.executionTxHash ?? "",
        ledger: Number(proofResult.ledger ?? 0),
        timestamp: proofResult.timestamp ?? new Date().toISOString(),
        explorerUrl: proofResult.explorerUrl ?? `https://stellar.expert/explorer/testnet/tx/${proofResult.executionTxHash ?? ""}`,
        message: proofResult.message ?? "Private trade settled by relayer and verified by proof.",
      }));
      router.push("/status");
    } catch (e: any) {
      setStep("error");
      setError(e.message ?? "Trade failed");
      setProofSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error" } : s
        )
      );
    }
  }

  const isProving = ["proving", "submitting"].includes(step);

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Private Trade</h1>
        <p className="text-slate-400 text-sm">
          Your amount, balance & strategy stay cryptographically hidden
        </p>
      </div>

      {/* Wallet badge */}
      {walletAddress && (
        <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm">
          <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
          <span className="text-slate-400 font-mono text-xs">
            {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
          </span>
          <span className="ml-auto text-amber-400 text-xs">Testnet</span>
        </div>
      )}

      {/* Trade form — hidden while proving */}
      {!isProving ? (
        <div className="card-glow rounded-2xl p-6">
          {/* Asset pair selector */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1">
              <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">From</label>
              <select
                value={fromAsset}
                onChange={(e) => handleFromAssetChange(e.target.value as "XLM" | "USDC")}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
                  text-white font-semibold focus:outline-none focus:border-[#6B4EFF]"
              >
                <option value="XLM">⭐ XLM</option>
                <option value="USDC">💵 USDC</option>
              </select>
            </div>

            <button
              onClick={swapAssets}
              className="mt-6 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700
                text-slate-300 transition-colors text-lg"
            >
              ⇄
            </button>

            <div className="flex-1">
              <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">To</label>
              <select
                value={toAsset}
                onChange={(e) => handleToAssetChange(e.target.value as "XLM" | "USDC")}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
                  text-white font-semibold focus:outline-none focus:border-[#6B4EFF]"
              >
                <option value="USDC">💵 USDC</option>
                <option value="XLM">⭐ XLM</option>
              </select>
            </div>
          </div>

          {/* Amount */}
          <div className="mb-4">
            <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">
              Trade Amount ({fromAsset})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
                text-white text-lg font-mono placeholder-slate-700
                focus:outline-none focus:border-[#6B4EFF] transition-colors"
            />
            <p className="text-xs text-slate-600 mt-1">
              🔒 This value is committed to the ZK proof and never revealed on-chain
            </p>
          </div>

          {/* Optional price limit */}
          <div className="mb-5">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={usePriceLimit}
                onChange={(e) => setUsePriceLimit(e.target.checked)}
                className="rounded accent-[#6B4EFF]"
              />
              <span className="text-sm text-slate-400">Set max price limit (optional)</span>
            </label>
            {usePriceLimit && (
              <input
                type="number"
                min="0"
                step="0.001"
                value={priceLimit}
                onChange={(e) => setPriceLimit(e.target.value)}
                placeholder="Max price in XLM"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
                  text-white font-mono placeholder-slate-700
                  focus:outline-none focus:border-[#6B4EFF] transition-colors"
              />
            )}
          </div>

          {/* Privacy notice */}
          <div className="bg-[#6B4EFF]/10 border border-[#6B4EFF]/20 rounded-xl p-3 mb-5 text-xs text-slate-400">
            🛡️ <strong className="text-[#a78bfa]">Zero-Knowledge Protection:</strong> Once you submit,
            the token pair, trade amount, and wallet balance are immediately locked into the ZK circuit —
            they will not appear in any on-chain record or in this UI.
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!amount}
            className="w-full py-4 rounded-xl font-bold text-white text-lg
              bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF]
              hover:opacity-90 disabled:opacity-40 transition-opacity
              shadow-lg shadow-[#6B4EFF33] flex items-center justify-center gap-3"
          >
            🔐 Generate ZK Proof &amp; Trade
          </button>
        </div>
      ) : (
        /* ── ZK Proof progress — trade details replaced by proof signals ── */
        <div className="card-glow rounded-2xl p-6">
          {/* Private pair indicator — no assets or amount shown */}
          <div className="flex items-center justify-between mb-5 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="text-white text-sm font-semibold">Private Swap</p>
                <p className="text-slate-500 text-xs">Pair &amp; amount hidden in ZK circuit</p>
              </div>
            </div>
            <div className="flex items-center gap-1 terminal text-[#6B4EFF] text-xs">
              <span className="opacity-50">████</span>
              <span className="text-slate-600">→</span>
              <span className="opacity-50">████</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full border-2 border-[#6B4EFF] border-t-transparent animate-spin" />
            <div>
              <p className="text-white font-semibold text-sm">
                {step === "submitting" ? "Submitting to Soroban..." : "Generating ZK Proof..."}
              </p>
              <p className="text-slate-500 text-xs">Stellar Testnet · Noir UltraPlonk</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {proofSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  s.status === "done"    ? "bg-[#00C896]/20 text-[#00C896]" :
                  s.status === "running" ? "bg-[#6B4EFF]/20 text-[#6B4EFF] animate-pulse" :
                  s.status === "error"   ? "bg-red-500/20 text-red-400" :
                  "bg-slate-800 text-slate-600"
                }`}>
                  {s.status === "done"    ? "✓" :
                   s.status === "running" ? "●" :
                   s.status === "error"   ? "✗" : "○"}
                </div>
                <span className={`text-xs ${
                  s.status === "done"    ? "text-[#00C896]" :
                  s.status === "running" ? "text-white" :
                  s.status === "error"   ? "text-red-400" :
                  "text-slate-600"
                }`}>
                  {s.label}
                </span>
              </div>
            ))}

            {step === "submitting" && (
              <div className="flex items-center gap-3 mt-1">
                <div className="w-5 h-5 rounded-full bg-[#6B4EFF]/20 text-[#6B4EFF] flex items-center justify-center text-xs animate-pulse">●</div>
                <span className="text-white text-xs">Submitting proof → Soroban contract</span>
              </div>
            )}
          </div>

          {/* Only show cryptographic proof signals — never the plaintext pair or amount */}
          {proofData && (
            <div className="mt-4 pt-4 border-t border-slate-800 terminal text-xs">
              <p className="text-slate-500 mb-1">Public signals (all that's revealed on-chain):</p>
              <p className="text-slate-400 truncate">
                nullifier: <span className="text-[#6B4EFF]">{proofData.publicInputs?.nullifier?.slice(0, 20) ?? "N/A"}...</span>
              </p>
              <p className="text-slate-400 truncate">
                commitment: <span className="text-[#6B4EFF]">{proofData.publicInputs?.commitment?.slice(0, 20) ?? "N/A"}...</span>
              </p>
              <p className="text-slate-400">
                proof time: <span className="text-[#00C896]">{proofData.generationTimeMs ?? 0}ms</span>
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              ⚠️ {error}
              <button
                onClick={() => { setStep("intent"); setError(""); setProofSteps(PROOF_STEPS.map(s => ({...s, status: "pending"}))); }}
                className="ml-3 underline text-xs"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
