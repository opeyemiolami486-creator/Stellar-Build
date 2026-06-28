"use client";
/**
 * Simple wallet state using localStorage plus provider metadata.
 * Supports browser extensions and mobile wallets for Stellar testnet.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface WalletState {
  address: string | null;
  provider: string | null;
  network: string;
  connected: boolean;
  connect: (address: string, provider?: string, network?: string) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  provider: null,
  network: "TESTNET",
  connected: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>("TESTNET");

  useEffect(() => {
    const stored = localStorage.getItem("zk_wallet_address");
    const storedProvider = localStorage.getItem("zk_wallet_provider");
    const storedNetwork = localStorage.getItem("zk_wallet_network");
    if (stored) setAddress(stored);
    if (storedProvider) setProvider(storedProvider);
    if (storedNetwork) setNetwork(storedNetwork);
  }, []);

  const connect = (addr: string, prov?: string, network: string = "TESTNET") => {
    localStorage.setItem("zk_wallet_address", addr);
    localStorage.setItem("zk_wallet_network", network);
    setNetwork(network);

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
    localStorage.removeItem("zk_wallet_network");
    setAddress(null);
    setProvider(null);
    setNetwork("TESTNET");
  };

  return (
    <WalletContext.Provider value={{ address, provider, network, connected: !!address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
