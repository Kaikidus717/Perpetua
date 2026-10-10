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
  addEventListener?(event: string, handler: () => void): void;
  removeEventListener?(event: string, handler: () => void): void;
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

/// Wallets are other people's code injected into our page, and reading them has to be assumed unsafe.
/// Some extensions hand out a `Proxy` whose frozen `on` method is answered with a *different*
/// function, and the JavaScript engine throws from inside the reader's frame:
///
///   'get' on proxy: property 'on' is a read-only and non-configurable data property on the proxy
///   target but the proxy did not return its actual value
///
/// A wallet that behaves like that should cost the visitor a connected wallet — never the page.
function read<T>(value: () => T): T | undefined {
  try {
    return value();
  } catch {
    return undefined;
  }
}

/// A wallet's own message when it fails, with the proxy case replaced by something a person can act
/// on. Everything else is passed through unchanged: "user rejected the request" is worth reading.
export function walletError(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return /proxy/i.test(detail)
    ? "Your wallet extension refused the request. Reload the page, and reconnect the wallet if it keeps happening."
    : detail;
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

export function useSolanaWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;

    const detect = () => {
      if (!live) return;
      const detected = provider();
      setAvailable(Boolean(detected));
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
    const detected = provider();
    if (!detected) {
      setError(`No Solana wallet found. Install ${SUPPORTED_WALLETS}, then reload.`);
      return;
    }
    try {
      const result = await detected.connect();
      setAddress(providerAddress(detected) ?? read(() => result.publicKey.toBase58()) ?? null);
      setError(null);
    } catch (cause) {
      setError(walletError(cause));
    }
  }, []);

  const disconnect = useCallback(async () => {
    await read(async () => provider()?.disconnect?.());
    setAddress(null);
  }, []);

  return { address, available, error, connect, disconnect };
}
