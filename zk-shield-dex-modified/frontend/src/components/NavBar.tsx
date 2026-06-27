"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";

const links = [
  { href: "/connect",  label: "Connect"  },
  { href: "/trade",    label: "Trade"    },
  { href: "/transfer", label: "Transfer" },
  { href: "/status",   label: "Status"   },
];

export function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const { address, connected, disconnect } = useWallet();

  function handleDisconnect() {
    disconnect();
    router.push("/connect");
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-[#080d1a]/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <span className="text-xl">🛡️</span>
          <span className="hidden sm:inline">ZK Shield DEX</span>
          <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5 ml-1">
            TESTNET · MAINNET SOON
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Nav links */}
          {links.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-[#6B4EFF]/20 text-[#a78bfa] border border-[#6B4EFF]/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {l.label}
              </Link>
            );
          })}

          {/* Wallet indicator */}
          {connected && address && (
            <button
              onClick={handleDisconnect}
              title="Disconnect wallet"
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                bg-[#00C896]/10 border border-[#00C896]/20 text-xs text-[#00C896]
                hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400
                transition-all font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C896]" />
              {address.slice(0, 6)}…{address.slice(-4)}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
