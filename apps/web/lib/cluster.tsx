"use client";

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

export type Network = "devnet" | "mainnet-beta";

export const NETWORK_LABEL: Record<Network, string> = {
  devnet: "devnet",
  "mainnet-beta": "main",
};

const KEY = "perpetua.network";

interface NetworkState {
  network: Network;
  /// What to print for a reader: "devnet" or "main".
  label: string;
  setNetwork: (next: Network) => void;
}

const NetworkContext = createContext<NetworkState | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<Network>("devnet");

  /// Read on mount, never during render: the server has no local storage, and a first paint that
  /// disagreed with the second would flash the wrong badge.
  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "devnet" || stored === "mainnet-beta") setNetworkState(stored);
  }, []);

  const value = useMemo<NetworkState>(
    () => ({
      network,
      label: NETWORK_LABEL[network],
      setNetwork: (next) => {
        setNetworkState(next);
        try {
          window.localStorage.setItem(KEY, next);
        } catch {
          /// Private mode refuses to store. The choice still applies for this visit.
        }
      },
    }),
    [network],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const value = useContext(NetworkContext);
  if (!value) throw new Error("useNetwork must be used inside NetworkProvider");
  return value;
}
