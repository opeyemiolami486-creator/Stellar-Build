"use client";
/**
 * Simple wallet state using localStorage plus provider metadata.
 * Supports browser extensions and mobile wallets for Stellar testnet.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface WalletState {
  address: string | null;
  provider: string | null;
  connected: boolean;
  connect: (address: string, provider?: string) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  provider: null,
  connected: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("zk_wallet_address");
    const storedProvider = localStorage.getItem("zk_wallet_provider");
    if (stored) setAddress(stored);
    if (storedProvider) setProvider(storedProvider);
  }, []);

  const connect = (addr: string, prov?: string) => {
    localStorage.setItem("zk_wallet_address", addr);
    if (prov) {
      localStorage.setItem("zk_wallet_provider", prov);
      setProvider(prov);
    } else {
      localStorage.removeItem("zk_wallet_provider");
      setProvider(null);
    }
    setAddress(addr);
  };

  const disconnect = () => {
    localStorage.removeItem("zk_wallet_address");
    localStorage.removeItem("zk_wallet_provider");
    setAddress(null);
    setProvider(null);
  };

  return (
    <WalletContext.Provider value={{ address, provider, connected: !!address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
