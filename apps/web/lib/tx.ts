"use client";

import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { API_URL } from "./api";
import type { SolanaProvider } from "./wallet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | { error?: unknown } | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : `request failed: ${response.status}`;
    throw new Error(detail);
  }
  return payload as T;
}

async function send(provider: SolanaProvider, transaction: Transaction): Promise<string> {
  if (typeof provider.signAndSendTransaction === "function") {
    const result = await provider.signAndSendTransaction(transaction);
    return result.signature;
  }
  if (typeof provider.signTransaction === "function") {
    const signed = await provider.signTransaction(transaction);
    const connection = new Connection(RPC_URL, "confirmed");
    return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  }
  throw new Error("wallet cannot sign transactions");
}

function requirePublicKey(provider: SolanaProvider): string {
  const key = provider.publicKey?.toBase58();
  if (!key) throw new Error("connect a wallet first");
  return key;
}

export interface SecuritizeInput {
  pool: string;
  position: string;
  positionNftMint: string;
  positionNftAccount: string;
  positionNftProgram: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAProgram: string;
  tokenBProgram: string;
}

export interface SecuritizeResult {
  signature: string;
  shareMint: string;
}

export async function securitize(
  provider: SolanaProvider,
  input: SecuritizeInput,
): Promise<SecuritizeResult> {
  const shareMint = Keypair.generate();
  const { transaction } = await post<{ transaction: string }>("/v1/tx/create-vault", {
    ...input,
    creator: requirePublicKey(provider),
    shareMint: shareMint.publicKey.toBase58(),
  });
  const tx = Transaction.from(fromBase64(transaction));
  tx.partialSign(shareMint);
  const signature = await send(provider, tx);
  return { signature, shareMint: shareMint.publicKey.toBase58() };
}

export async function stakeShares(
  provider: SolanaProvider,
  vault: string,
  amount: bigint,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>("/v1/tx/stake", {
    owner: requirePublicKey(provider),
    vault,
    amount: amount.toString(),
  });
  return send(provider, Transaction.from(fromBase64(transaction)));
}

export async function unstakeShares(
  provider: SolanaProvider,
  vault: string,
  amount: bigint,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>("/v1/tx/unstake", {
    owner: requirePublicKey(provider),
    vault,
    amount: amount.toString(),
  });
  return send(provider, Transaction.from(fromBase64(transaction)));
}

export async function harvestFees(provider: SolanaProvider, vault: string): Promise<string> {
  const { transaction } = await post<{ transaction: string }>("/v1/tx/harvest", {
    owner: requirePublicKey(provider),
    vault,
  });
  return send(provider, Transaction.from(fromBase64(transaction)));
}

export async function crankClaim(provider: SolanaProvider, vault: string): Promise<string> {
  const { transaction } = await post<{ transaction: string }>("/v1/tx/crank-claim", {
    owner: requirePublicKey(provider),
    vault,
  });
  return send(provider, Transaction.from(fromBase64(transaction)));
}
