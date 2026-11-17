"use client";

import type { Transaction } from "@solana/web3.js";
import {
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface SolanaProvider {
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  publicKey?: { toBase58(): string } | null;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAndSendTransaction?(transaction: Transaction): Promise<{ signature: string }>;
  on?(event: string, handler: () => void): void;
  removeListener?(event: string, handler: () => void): void;
  addEventListener?(event: string, handler: () => void): void;
  removeEventListener?(event: string, handler: () => void): void;
}

interface WalletGlobals {
  solana?: SolanaProvider;
  phantom?: { solana?: SolanaProvider };
  solflare?: SolanaProvider;
  backpack?: SolanaProvider;
  glow?: SolanaProvider;
}

/// Names to show a visitor who has no Solana wallet installed. Ethereum-only wallets cannot fill
/// this role: they hold no Solana keys and cannot sign a Solana transaction.
export const SUPPORTED_WALLETS = "Phantom, Solflare, Backpack or Glow";

function read<T>(value: () => T): T | undefined {
  try {
    return value();
  } catch {
    return undefined;
  }
}

/// A wallet's own message when it fails, reduced to the cases a person can act on.
export function walletError(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (/proxy/i.test(detail)) {
    return "Your wallet extension blocked the request. Reload the page and reconnect.";
  }
  if (/reject|declined|denied|cancel/i.test(detail)) {
    return "You declined the request. Nothing was sent.";
  }
  if (/failed to fetch|network|timeout|timed out/i.test(detail)) {
    return "We couldn't reach your wallet. Check your connection and try again.";
  }
  return "Your wallet could not complete the request. Reconnect and try again.";
}

export function solanaProvider(): SolanaProvider | undefined {
  return read(() => {
    const wallets = globalThis as unknown as WalletGlobals;
    return (
      wallets.solana ??
      wallets.phantom?.solana ??
      wallets.solflare ??
      wallets.backpack ??
      wallets.glow
    );
  });
}

/// The address a provider is currently showing, or `null` when it cannot be read — including when
/// reading it throws.
export function providerAddress(candidate: SolanaProvider | undefined): string | null {
  return read(() => candidate?.publicKey?.toBase58()) ?? null;
}

function provider(): SolanaProvider | undefined {
  return solanaProvider();
}

/// `on` is only used to keep the shown address fresh, so when a wallet's event methods throw, the
/// wallet is still perfectly usable. Every step is optional and every step is guarded.
function wireEvents(detected: SolanaProvider, handler: () => void): () => void {
  const detach: Array<() => void> = [];

  for (const event of ["connect", "disconnect", "accountChanged"]) {
    const off = read(() => {
      if (typeof detected.addEventListener === "function") {
        detected.addEventListener(event, handler);
        return () => detected.removeEventListener?.(event, handler);
      }
      if (typeof detected.on === "function") {
        detected.on(event, handler);
        return () => detected.removeListener?.(event, handler);
      }
      return undefined;
    });
    if (off) detach.push(off);
  }

  return () => {
    for (const off of detach) read(off);
  };
}

export interface WalletState {
  address: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

/// One wallet state for the whole app. The header owns the only connect control; pages read the
/// same address and update immediately when it changes.
function useWalletState(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;

    const detect = () => {
      if (!live) return;
      const detected = provider();
      const current = providerAddress(detected);
      if (current) setAddress(current);
      if (detected && !unsubscribe) {
        unsubscribe = wireEvents(detected, () => setAddress(providerAddress(provider())));
      }
    };

    detect();
    // Extensions inject at their own pace. A wallet that arrives after first paint should still be
    // picked up, instead of leaving every button on the page permanently disabled.
    const timers = [300, 1200, 3000].map((ms) => window.setTimeout(detect, ms));

    return () => {
      live = false;
      for (const timer of timers) window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const detected = provider();
    if (!detected) {
      setError(`No Solana wallet found. Install ${SUPPORTED_WALLETS}, then reload.`);
      return;
    }
    try {
      const result = await detected.connect();
      setAddress(providerAddress(detected) ?? read(() => result.publicKey.toBase58()) ?? null);
    } catch (cause) {
      setError(walletError(cause));
    }
  }, []);

  const disconnect = useCallback(async () => {
    await read(async () => provider()?.disconnect?.());
    setAddress(null);
    setError(null);
  }, []);

  return { address, error, connect, disconnect };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletState();
  return createElement(WalletContext.Provider, { value: wallet }, children);
}

export function useSolanaWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useSolanaWallet must be used inside WalletProvider");
  return value;
}
