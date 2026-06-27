import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { WalletProvider } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "ZK Shield DEX — Private Trading on Stellar",
  description: "Zero-knowledge private trading layer on Stellar Testnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            <NavBar />
            <main className="flex-1">{children}</main>
            <footer className="text-center py-4 text-xs text-slate-600 border-t border-slate-800">
              🛡️ ZK Shield DEX · Testnet · Mainnet Coming Soon · Zero-Knowledge Private Trading
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
