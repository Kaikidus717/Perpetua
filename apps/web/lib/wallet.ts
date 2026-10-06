"use client";

import type { Transaction } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

export interface SolanaProvider {
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  publicKey?: { toBase58(): string } | null;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAndSendTransaction?(transaction: Transaction): Promise<{ signature: string }>;
  on?(event: string, handler: () => void): void;
  removeListener?(event: string, handler: () => void): void;
}

/// What Solana wallets put on `window`. They all expose the same provider shape; they just disagree
/// about where to put it. `window.solana` is the de-facto standard, so it wins when present, and the
/// named slots below cover the cases where a different extension claimed it first.
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

export function solanaProvider(): SolanaProvider | undefined {
  const wallets = globalThis as unknown as WalletGlobals;
  return (
    wallets.solana ??
    wallets.phantom?.solana ??
    wallets.solflare ??
    wallets.backpack ??
    wallets.glow
  );
}

function provider(): SolanaProvider | undefined {
  return solanaProvider();
}

export function useSolanaWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detected = provider();
    setAvailable(Boolean(detected));
    if (detected?.publicKey) setAddress(detected.publicKey.toBase58());

    const sync = () => setAddress(provider()?.publicKey?.toBase58() ?? null);
    detected?.on?.("connect", sync);
    detected?.on?.("disconnect", sync);
    detected?.on?.("accountChanged", sync);

    return () => {
      detected?.removeListener?.("connect", sync);
      detected?.removeListener?.("disconnect", sync);
      detected?.removeListener?.("accountChanged", sync);
    };
  }, []);

  const connect = useCallback(async () => {
    const detected = provider();
    if (!detected) {
      setError(`No Solana wallet found. Install ${SUPPORTED_WALLETS}, then reload.`);
      return;
    }
    try {
      const result = await detected.connect();
      setAddress(result.publicKey.toBase58());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "connection rejected");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await provider()?.disconnect?.();
    setAddress(null);
  }, []);

  return { address, available, error, connect, disconnect };
}
