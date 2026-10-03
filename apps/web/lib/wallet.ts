"use client";

import { useCallback, useEffect, useState } from "react";

interface SolanaProvider {
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  publicKey?: { toBase58(): string } | null;
  on?(event: string, handler: () => void): void;
  removeListener?(event: string, handler: () => void): void;
}

function provider(): SolanaProvider | undefined {
  return (globalThis as unknown as { solana?: SolanaProvider }).solana;
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
      setError("No Solana wallet detected in this browser.");
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
