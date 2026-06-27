import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 text-center">
      {/* Hero */}
      <div className="mb-6 text-6xl">🛡️</div>
      <h1 className="text-5xl font-bold mb-3 shield-gradient">
        ZK Shield DEX
      </h1>
      <p className="text-slate-400 text-xl mb-2">
        Private Trading Layer on Stellar Testnet
      </p>
      <p className="text-slate-500 text-sm mb-10 max-w-md">
        Trade XLM ↔ USDC without revealing your amount, balance, or strategy.
        Zero-knowledge proofs keep every trade cryptographically private.
      </p>

      {/* CTA */}
      <Link
        href="/connect"
        className="px-8 py-3 rounded-xl font-semibold text-white text-lg
          bg-gradient-to-r from-[#6B4EFF] to-[#00D2FF]
          hover:opacity-90 transition-opacity shadow-lg shadow-[#6B4EFF33]"
      >
        Connect Wallet →
      </Link>

      {/* Feature grid */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full">
        {[
          {
            icon: "🔐",
            title: "ZK Proofs",
            desc: "Prove your trade is valid without revealing amount, balance, or intent",
          },
          {
            icon: "⛓️",
            title: "Soroban Verified",
            desc: "Proofs verified on-chain by a Soroban smart contract — trustless",
          },
          {
            icon: "🌐",
            title: "Stellar DEX",
            desc: "Real trades executed on Stellar Testnet via path payments",
          },
        ].map((f) => (
          <div key={f.title} className="card-glow rounded-2xl p-5 text-left">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-white mb-1">{f.title}</h3>
            <p className="text-slate-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Flow diagram */}
      <div className="mt-12 card-glow rounded-2xl p-6 max-w-3xl w-full text-left">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
          How It Works
        </h2>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {[
            "Connect Wallet",
            "Enter Trade",
            "Generate ZK Proof",
            "Soroban Verifies",
            "Trade Executes",
            "✅ Private & Settled",
          ].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono">
                {step}
              </span>
              {i < arr.length - 1 && (
                <span className="text-[#6B4EFF]">→</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Testnet badge */}
      <div className="mt-6 flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-4 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Currently on Testnet — Mainnet support coming soon
      </div>
    </div>
  );
}
