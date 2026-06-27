"use client";
/**
 * Simple wallet state using localStorage + Freighter API.
 * In production: use @stellar/freighter-api for real Freighter wallet.
 * For demo/testnet: supports manual keypair entry as fallback.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface WalletState {
  address: string | null;
  connected: boolean;
  connect: (address: string) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connected: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("zk_wallet_address");
    if (stored) setAddress(stored);
  }, []);

  const connect = (addr: string) => {
    localStorage.setItem("zk_wallet_address", addr);
    setAddress(addr);
  };

  const disconnect = () => {
    localStorage.removeItem("zk_wallet_address");
    setAddress(null);
  };

  return (
    <WalletContext.Provider value={{ address, connected: !!address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
