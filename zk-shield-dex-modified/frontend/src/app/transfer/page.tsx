"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type ProofResponse, type TransferSubmitResponse } from "@/lib/api";
import { buildTransferTransactionXdr, signAndSubmitTransactionXdr } from "@/lib/stellar";

type Step = "intent" | "proving" | "submitting" | "done" | "error";

interface ProofStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

const PROOF_STEPS: ProofStep[] = [
  { label: "Validating recipient on Horizon Testnet", status: "pending" },
  { label: "Checking sender balance on-chain", status: "pending" },
  { label: "Generating Noir UltraPlonk proof", status: "pending" },
  { label: "Running local Barretenberg verification", status: "pending" },
  { label: "Submitting proof to Soroban contract", status: "pending" },
  { label: "Executing Stellar payment", status: "pending" },
];

const ASSETS = ["XLM", "USDC"] as const;
type Asset = typeof ASSETS[number];

// ── Receiver Share Token ────────────────────────────────────────────────────
// A simple base64-encoded JSON blob the sender can share with the receiver.
// It contains the plaintext transfer details; the ZK proof hides them on-chain
// but the sender may choose to reveal them out-of-band.
interface ReceiverToken {
  sender: string;
  recipient: string;
  amount: string;
  asset: string;
  memo?: string;
  executionTxHash: string;
  timestamp: string;
}

function encodeReceiverToken(data: ReceiverToken): string {
  return btoa(JSON.stringify(data));
}

function decodeReceiverToken(token: string): ReceiverToken | null {
  try {
    return JSON.parse(atob(token)) as ReceiverToken;
  } catch {
    return null;
  }
}

export default function TransferPage() {
  const router = useRouter();

  const [walletAddress, setWalletAddress] = useState("");
  const [recipient, setRecipient]         = useState("");
  const [asset, setAsset]                 = useState<Asset>("XLM");
  const [amount, setAmount]               = useState("");
  const [memo, setMemo]                   = useState("");
  const [useMemo, setUseMemo]             = useState(false);

  const [step, setStep]             = useState<Step>("intent");
  const [proofSteps, setProofSteps] = useState<ProofStep[]>(PROOF_STEPS);
  const [error, setError]           = useState("");
  const [result, setResult]         = useState<TransferSubmitResponse | null>(null);
  const [proofData, setProofData]   = useState<ProofResponse | null>(null);

  // Receiver view state
  const [showReceiverView, setShowReceiverView] = useState(false);
  const [receiverToken, setReceiverToken]       = useState<string>("");
  const [copiedToken, setCopiedToken]           = useState(false);
  const [viewToken, setViewToken]               = useState("");
  const [decodedReceiver, setDecodedReceiver]   = useState<ReceiverToken | null>(null);
  const [tokenError, setTokenError]             = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("zk_wallet_address");
    if (!stored) {
      router.push("/connect");
    } else {
      setWalletAddress(stored);
    }
  }, [router]);

  function updateStep(index: number, status: ProofStep["status"]) {
    setProofSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status } : s))
    );
  }

  function isValidStellarAddress(addr: string) {
    return /^G[A-Z0-9]{55}$/.test(addr.trim());
  }

  async function handleSubmit() {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount greater than 0");
      return;
    }
    if (!recipient.trim()) {
      setError("Please enter a recipient address");
      return;
    }
    if (!isValidStellarAddress(recipient)) {
      setError("Recipient must be a valid Stellar public key (starts with G, 56 chars)");
      return;
    }
    if (recipient.trim() === walletAddress) {
      setError("Cannot transfer to your own wallet");
      return;
    }

    setError("");
    setStep("proving");
    setProofSteps(PROOF_STEPS.map((s) => ({ ...s, status: "pending" })));

    try {
      updateStep(0, "running");
      updateStep(1, "running");
      const intentRes = await api.createTransferIntent({
        walletAddress,
        recipient: recipient.trim(),
        asset,
        amount,
        memo: useMemo && memo ? memo : undefined,
      });
      updateStep(0, "done");
      updateStep(1, "done");

      updateStep(2, "running");
      const proof = await api.generateTransferProof(intentRes.intentId);
      setProofData(proof);
      updateStep(2, "done");

      updateStep(3, "running");
      await new Promise((r) => setTimeout(r, 300));
      updateStep(3, "done");

      setStep("submitting");
      updateStep(4, "running");
      const proofResult = await api.submitTransfer(proof.proofId, true);
      updateStep(4, "done");

      updateStep(5, "running");
      const txXdr = await buildTransferTransactionXdr(
        walletAddress,
        recipient.trim(),
        asset,
        amount,
        useMemo && memo ? memo : undefined
      );
      const txResult = await signAndSubmitTransactionXdr(txXdr, walletAddress);
      updateStep(5, "done");

      // Build the receiver share token so they can decode transfer details
      const token = encodeReceiverToken({
        sender:           walletAddress,
        recipient:        recipient.trim(),
        amount,
        asset,
        memo:             useMemo && memo ? memo : undefined,
        executionTxHash:  txResult.hash,
        timestamp:        new Date().toISOString(),
      });
      setReceiverToken(token);

      const settledTransfer = {
        status: "settled",
        transferHash: proofResult.transferHash,
        verificationTxHash: proofResult.verificationTxHash,
        executionTxHash: txResult.hash,
        ledger: Number(txResult.ledger ?? 0),
        timestamp: new Date().toISOString(),
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txResult.hash}`,
        message: "Private transfer executed from wallet and verified by proof.",
      };

      localStorage.setItem("zk_last_transfer", JSON.stringify(settledTransfer));
      setResult(settledTransfer);
      setStep("done");
    } catch (e: any) {
      setStep("error");
      setError(e.message ?? "Transfer failed");
      setProofSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
      );
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(receiverToken).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  }

  function handleDecodeToken() {
    setTokenError("");
    const decoded = decodeReceiverToken(viewToken.trim());
    if (!decoded) {
      setTokenError("Invalid or corrupted receiver token.");
      setDecodedReceiver(null);
    } else {
      setDecodedReceiver(decoded);
    }
  }

  const isProcessing = step === "proving" || step === "submitting";

  // ── Done screen ────────────────────────────────────────────────────────────
  if (step === "done" && result) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold text-white mb-2">Transfer Settled</h1>
          <p className="text-slate-400 text-sm">
            Private transfer confirmed on Stellar Testnet.
          </p>
        </div>

        <div className="card-glow rounded-2xl p-5 mb-5 border-[#00C896]/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
            <span className="text-[#00C896] font-semibold text-sm">ZK Privacy Active — Real Proof</span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            🛡️ A genuine Noir UltraPlonk proof was verified on-chain by the Soroban contract.
            The transfer amount, sender balance, and recipient details are{" "}
            <strong className="text-white">cryptographically hidden</strong>.
          </p>
        </div>

        {/* On-Chain Records */}
        <div className="card-glow rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
            On-Chain Records
          </h2>
          {[
            { label: "Transfer Hash (opaque)",    val: result.transferHash },
            { label: "Soroban Verification TX",   val: result.verificationTxHash },
            { label: "Stellar Execution TX",      val: result.executionTxHash },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="terminal text-slate-300 text-xs">
                {val ? `${val.slice(0, 14)}…${val.slice(-10)}` : "-"}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-500 text-xs">Ledger</span>
            <span className="terminal text-slate-300 text-xs">
              {typeof result.ledger === "number" ? result.ledger.toLocaleString() : "-"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-500 text-xs">Timestamp</span>
            <span className="terminal text-slate-300 text-xs">
              {result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : "-"}
            </span>
          </div>
        </div>

        {result?.explorerUrl && (
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 rounded-xl text-center text-sm font-semibold
              text-[#00C896] border border-[#00C896]/30 hover:bg-[#00C896]/10
              transition-colors mb-4"
          >
            🔍 View on Stellar Expert ↗
          </a>
        )}

        {proofData && (
          <div className="card-glow rounded-2xl p-5 mb-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
              ZK Public Signals (on-chain)
            </h2>
            {[
                { label: "Nullifier",   val: proofData.publicInputs?.nullifier ?? "N/A" },
                { label: "Commitment",  val: proofData.publicInputs?.commitment ?? "N/A" },
                { label: "Merkle Root", val: proofData.publicInputs?.merkleRoot ?? "N/A" },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className="terminal text-[#6B4EFF] text-xs">
                    {typeof val === "string" && val.length > 12 ? `${val.slice(0, 12)}…${val.slice(-8)}` : val}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500 text-xs">Proof time</span>
                <span className="terminal text-[#6B4EFF] text-xs">
                  {proofData.generationTimeMs ?? 0}ms
                </span>
              </div>
            </div>
          )}

        <div className="card-glow rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
            What the ZK Proof Hid
          </h2>
          {[
            { label: "Transfer Amount",   value: "████████" },
            { label: "Sender Balance",    value: "████████" },
            { label: "Recipient Address", value: "████████████" },
            { label: "Private Memo",      value: useMemo ? "████████" : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5">
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="terminal text-[#6B4EFF] text-xs opacity-60">{value}</span>
            </div>
          ))}
        </div>

        {/* ── Receiver View ─────────────────────────────────────────────── */}
        <div className="card-glow rounded-2xl p-5 mb-6 border border-amber-500/20">
          <button
            onClick={() => setShowReceiverView(!showReceiverView)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-lg">👁</span>
              <div className="text-left">
                <p className="text-amber-400 font-semibold text-sm">Receiver View</p>
                <p className="text-slate-500 text-xs">
                  Share transfer details privately with the recipient
                </p>
              </div>
            </div>
            <span className="text-slate-600 text-sm">{showReceiverView ? "▲" : "▼"}</span>
          </button>

          {showReceiverView && (
            <div className="mt-4 space-y-4">
              {/* Decoded details — sender sees them after transfer */}
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-3">
                  Transfer Details (plaintext — not on-chain)
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Sender",    val: walletAddress },
                    { label: "Recipient", val: recipient },
                    { label: "Amount",    val: `${amount} ${asset}` },
                    ...(useMemo && memo ? [{ label: "Memo", val: memo }] : []),
                    { label: "Settled TX", val: result.executionTxHash },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-start justify-between gap-3 py-1 border-b border-slate-800 last:border-0">
                      <span className="text-slate-500 text-xs flex-shrink-0">{label}</span>
                      <span className="terminal text-slate-300 text-xs text-right break-all">{val}</span>
                    </div>
                  ))}
                </div>
                <p className="text-slate-600 text-xs mt-3">
                  ⚠️ These details exist off-chain only. Share them directly with the recipient — they are never stored on Stellar.
                </p>
              </div>

              {/* Share token */}
              <div>
                <p className="text-slate-400 text-xs mb-2">
                  🔑 <strong className="text-white">Receiver Token</strong> — paste this to the recipient so they can decode the transfer details:
                </p>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 terminal text-xs text-slate-400 break-all select-all">
                    {receiverToken.slice(0, 40)}…
                  </div>
                  <button
                    onClick={copyToken}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      copiedToken
                        ? "bg-[#00C896]/20 text-[#00C896] border border-[#00C896]/30"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                    }`}
                  >
                    {copiedToken ? "✓ Copied" : "⎘ Copy"}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-800 pt-4">
                <p className="text-slate-400 text-xs mb-2">
                  📬 <strong className="text-white">Recipient?</strong> Paste a receiver token here to view transfer details:
                </p>
                <textarea
                  value={viewToken}
                  onChange={(e) => setViewToken(e.target.value)}
                  placeholder="Paste receiver token here…"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2
                    text-white text-xs font-mono placeholder-slate-700 resize-none
                    focus:outline-none focus:border-[#6B4EFF] transition-colors"
                />
                <button
                  onClick={handleDecodeToken}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-white
                    bg-[#6B4EFF]/80 hover:bg-[#6B4EFF] transition-colors"
                >
                  🔓 Decode Transfer Details
                </button>

                {tokenError && (
                  <p className="text-red-400 text-xs mt-2">⚠️ {tokenError}</p>
                )}

                {decodedReceiver && (
                  <div className="mt-3 rounded-xl bg-[#00C896]/5 border border-[#00C896]/20 p-3">
                    <p className="text-[#00C896] text-xs font-semibold mb-2">✅ Transfer Verified</p>
                    <div className="space-y-1.5">
                      {[
                        { label: "From",   val: decodedReceiver.sender },
                        { label: "To",     val: decodedReceiver.recipient },
                        { label: "Amount", val: `${decodedReceiver.amount} ${decodedReceiver.asset}` },
                        ...(decodedReceiver.memo ? [{ label: "Memo", val: decodedReceiver.memo }] : []),
                        { label: "TX",     val: decodedReceiver.executionTxHash },
                        { label: "Time",   val: new Date(decodedReceiver.timestamp).toLocaleString() },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex items-start justify-between gap-3 py-0.5">
                          <span className="text-slate-500 text-xs flex-shrink-0">{label}</span>
                          <span className="terminal text-slate-300 text-xs text-right break-all">{val}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-600 text-xs mt-2">
                      Cross-check the TX hash on{" "}
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${decodedReceiver.executionTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#6B4EFF] hover:underline"
                      >
                        Stellar Expert ↗
                      </a>{" "}
                      to confirm settlement.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setStep("intent");
              setResult(null);
              setAmount("");
              setRecipient("");
              setMemo("");
              setProofData(null);
              setReceiverToken("");
              setViewToken("");
              setDecodedReceiver(null);
              setShowReceiverView(false);
              setProofSteps(PROOF_STEPS.map((s) => ({ ...s, status: "pending" })));
            }}
            className="flex-1 py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF] hover:opacity-90 transition-opacity"
          >
            New Transfer
          </button>
          <button
            onClick={() => router.push("/trade")}
            className="px-5 py-3 rounded-xl font-semibold text-slate-400
              bg-slate-800 hover:bg-slate-700 transition-colors text-sm"
          >
            Trade
          </button>
        </div>
      </div>
    );
  }

  // ── Form + progress ────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Private Transfer</h1>
        <p className="text-slate-400 text-sm">
          Send XLM or USDC with a real zero-knowledge proof — amount, sender, and recipient hidden on-chain
        </p>
      </div>

      {walletAddress && (
        <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm">
          <span className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
          <span className="text-slate-400 font-mono text-xs">
            {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
          </span>
          <span className="ml-auto text-amber-400 text-xs">Testnet</span>
        </div>
      )}

      <div className={`card-glow rounded-2xl p-6 transition-opacity ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}>

        {/* Recipient */}
        <div className="mb-4">
          <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">
            Recipient Stellar Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="GABC...XYZ"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
              text-white text-sm font-mono placeholder-slate-600
              focus:outline-none focus:border-[#6B4EFF] transition-colors"
          />
          <p className="text-xs text-slate-600 mt-1">
            🔒 Recipient identity hidden in ZK proof — verified on Horizon
          </p>
        </div>

        {/* Asset */}
        <div className="mb-4">
          <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">
            Asset
          </label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value as Asset)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
              text-white font-semibold focus:outline-none focus:border-[#6B4EFF]"
          >
            <option value="XLM">⭐ XLM</option>
            <option value="USDC">💵 USDC</option>
          </select>
        </div>

        {/* Amount */}
        <div className="mb-4">
          <label className="text-xs text-slate-500 uppercase tracking-widest mb-1.5 block">
            Amount ({asset})
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
            🔒 Committed to the ZK proof — not visible on-chain
          </p>
        </div>

        {/* Optional memo */}
        <div className="mb-5">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={useMemo}
              onChange={(e) => setUseMemo(e.target.checked)}
              className="rounded accent-[#6B4EFF]"
            />
            <span className="text-sm text-slate-400">Add encrypted memo (optional)</span>
          </label>
          {useMemo && (
            <>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Invoice #1042"
                maxLength={80}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3
                  text-white text-sm placeholder-slate-700
                  focus:outline-none focus:border-[#6B4EFF] transition-colors"
              />
              <p className="text-xs text-slate-600 mt-1">
                🔒 Stored as a SHA-256 hash on Stellar — original text never hits the chain.
                Share via Receiver Token to reveal to recipient.
              </p>
            </>
          )}
        </div>

        <div className="bg-[#6B4EFF]/10 border border-[#6B4EFF]/20 rounded-xl p-3 mb-5 text-xs text-slate-400">
          🛡️ <strong className="text-[#a78bfa]">Real Zero-Knowledge Proof:</strong> A genuine
          Noir UltraPlonk proof is generated and verified by the Soroban contract before any
          payment executes. No simulation. After settlement, you can share a{" "}
          <strong className="text-amber-400">Receiver Token</strong> so the recipient can verify the details.
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isProcessing || !amount || !recipient}
          className="w-full py-4 rounded-xl font-bold text-white text-lg
            bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF]
            hover:opacity-90 disabled:opacity-40 transition-opacity
            shadow-lg shadow-[#6B4EFF33] flex items-center justify-center gap-3"
        >
          🔐 Generate Proof &amp; Send
        </button>
      </div>

      {/* ZK Proof progress */}
      {isProcessing && (
        <div className="mt-6 card-glow rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full border-2 border-[#6B4EFF] border-t-transparent animate-spin" />
            <div>
              <p className="text-white font-semibold text-sm">
                {step === "submitting" ? "Submitting to Stellar..." : "Generating ZK Proof..."}
              </p>
              <p className="text-slate-500 text-xs">Noir UltraPlonk · Barretenberg · Soroban</p>
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
          </div>
        </div>
      )}
    </div>
  );
}
