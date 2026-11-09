"use client";

import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { type LadderView, apiBase } from "./api";
import { type SolanaProvider, providerAddress } from "./wallet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

const RPC_URLS: Record<string, string> = {
  devnet: RPC_URL,
  "mainnet-beta": process.env.NEXT_PUBLIC_RPC_URL_MAINNET ?? "https://api.mainnet-beta.solana.com",
};

function rpcUrl(cluster?: string): string {
  return (cluster && RPC_URLS[cluster]) || RPC_URL;
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/// Posts a transaction request. `cluster` is a query parameter rather than part of the body because
/// the body is validated field by field: the cluster says *where* to send the work, not what it is.
async function post<T>(path: string, body: unknown, cluster?: string): Promise<T> {
  const suffix = cluster ? `?cluster=${cluster}` : "";
  const response = await fetch(`${apiBase()}${path}${suffix}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | { error?: unknown } | null;
  if (!response.ok) {
    // The API's error is a sentence written for this page ("this wallet has no shares staked…"), so it
    // is passed through as-is rather than JSON-encoded into a wall of escaped quotes.
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? typeof payload.error === "string"
          ? payload.error
          : JSON.stringify(payload.error)
        : `request failed: ${response.status}`;
    throw new Error(detail);
  }
  return payload as T;
}

function method<K extends "signAndSendTransaction" | "signTransaction">(
  provider: SolanaProvider,
  name: K,
): SolanaProvider[K] | undefined {
  try {
    const candidate = provider[name];
    return typeof candidate === "function" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/// The prefix this file puts on a transaction the cluster itself refused, so that a refusal raised
/// here is never mistaken for an unreachable RPC in the catch below.
const CLUSTER_REFUSED = "the chain refused this transaction";

async function preflight(transaction: Transaction, cluster?: string): Promise<void> {
  try {
    const connection = new Connection(rpcUrl(cluster), "confirmed");
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      const logs = (simulation.value.logs ?? []).filter(Boolean).slice(-3).join(" · ");
      throw new Error(
        `${CLUSTER_REFUSED} (${JSON.stringify(simulation.value.err)})${logs ? `: ${logs}` : ""}`,
      );
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith(CLUSTER_REFUSED)) throw cause;
  }
}

/// A failure that means the transaction's stamp went stale before anyone signed it. That is the one
/// failure a retry actually cures, and the reason a first click can look like it did nothing.
function expired(detail: string): boolean {
  return /blockhash not found|block height exceeded|has expired|TransactionExpired|BlockhashNotFound|was not found/i.test(
    detail,
  );
}

function untouched(transaction: Transaction): boolean {
  return transaction.signatures.every((entry) => entry.signature === null);
}

/// Replaces the freshness stamp with one from the browser's own view of the cluster. The instructions
/// and the accounts are untouched: only the stamp that says "this is still recent" changes.
async function restamp(transaction: Transaction, cluster?: string): Promise<void> {
  const connection = new Connection(rpcUrl(cluster), "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
}

/// Hand the transaction to the wallet and return the signature it reports.
async function broadcast(
  provider: SolanaProvider,
  transaction: Transaction,
  cluster?: string,
): Promise<string> {
  const signAndSend = method(provider, "signAndSendTransaction");
  if (signAndSend) {
    const result = await signAndSend.call(provider, transaction);
    return result.signature;
  }
  const signOnly = method(provider, "signTransaction");
  if (signOnly) {
    const signed = await signOnly.call(provider, transaction);
    const connection = new Connection(rpcUrl(cluster), "confirmed");
    return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  }
  throw new Error("wallet cannot sign transactions");
}

function refusal(cause: unknown, cluster?: string): unknown {
  const text = cause instanceof Error ? cause.message : String(cause ?? "no reason given");
  if (/reject|denied|cancel|declin|refus/i.test(text)) return cause;
  /// An expiring stamp is not the wallet's fault, and pointing at network settings cannot help: it
  /// just needs another click, and the page builds a fresh transaction each time.
  if (expired(text)) {
    return new Error(
      `that request expired before it was signed (${text}). Nothing was sent — try once more and it will build a fresh one.`,
    );
  }
  return new Error(
    `your wallet would not sign this ${cluster ?? "devnet"} transaction (${text}). It is valid on that network — the cluster accepted a simulation of it — so the usual cause is the wallet being switched to another network. In Phantom: Settings → Developer Settings → Change Network → Devnet, then reload this page.`,
  );
}

async function send(
  provider: SolanaProvider,
  transaction: Transaction,
  cluster?: string,
): Promise<string> {
  await preflight(transaction, cluster);
  try {
    return await broadcast(provider, transaction, cluster);
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause ?? "");
    if (expired(text) && untouched(transaction)) {
      try {
        await restamp(transaction, cluster);
        await preflight(transaction, cluster);
        return await broadcast(provider, transaction, cluster);
      } catch (second) {
        throw refusal(second, cluster);
      }
    }
    throw refusal(cause, cluster);
  }
}

function requirePublicKey(provider: SolanaProvider): string {
  const key = providerAddress(provider);
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
  cluster?: string,
): Promise<SecuritizeResult> {
  const shareMint = Keypair.generate();
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/create-vault",
    {
      ...input,
      creator: requirePublicKey(provider),
      shareMint: shareMint.publicKey.toBase58(),
    },
    cluster,
  );
  const tx = Transaction.from(fromBase64(transaction));
  tx.partialSign(shareMint);
  const signature = await send(provider, tx, cluster);
  return { signature, shareMint: shareMint.publicKey.toBase58() };
}

export async function stakeShares(
  provider: SolanaProvider,
  vault: string,
  amount: bigint,
  cluster?: string,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/stake",
    { owner: requirePublicKey(provider), vault, amount: amount.toString() },
    cluster,
  );
  return send(provider, Transaction.from(fromBase64(transaction)), cluster);
}

export async function unstakeShares(
  provider: SolanaProvider,
  vault: string,
  amount: bigint,
  cluster?: string,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/unstake",
    { owner: requirePublicKey(provider), vault, amount: amount.toString() },
    cluster,
  );
  return send(provider, Transaction.from(fromBase64(transaction)), cluster);
}

/// The force exit: releases shares without the fee claim, for a fee mint that is paused or blocked.
export async function unstakeNoClaimShares(
  provider: SolanaProvider,
  vault: string,
  amount: bigint,
  cluster?: string,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/unstake-no-claim",
    { owner: requirePublicKey(provider), vault, amount: amount.toString() },
    cluster,
  );
  return send(provider, Transaction.from(fromBase64(transaction)), cluster);
}

export async function harvestFees(
  provider: SolanaProvider,
  vault: string,
  cluster?: string,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/harvest",
    { owner: requirePublicKey(provider), vault },
    cluster,
  );
  return send(provider, Transaction.from(fromBase64(transaction)), cluster);
}

export async function crankClaim(
  provider: SolanaProvider,
  vault: string,
  cluster?: string,
): Promise<string> {
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/crank-claim",
    { owner: requirePublicKey(provider), vault },
    cluster,
  );
  return send(provider, Transaction.from(fromBase64(transaction)), cluster);
}

export interface SalePreset {
  address: string;
  binStep: number;
  baseFactor: string;
}

export async function createBaseMint(
  provider: SolanaProvider,
  decimals: number,
  cluster?: string,
): Promise<{ mint: string; keypair: Keypair; signature: string }> {
  const mint = Keypair.generate();
  const { transaction } = await post<{ transaction: string }>(
    "/v1/tx/create-mint",
    {
      payer: requirePublicKey(provider),
      mint: mint.publicKey.toBase58(),
      decimals,
    },
    cluster,
  );
  const tx = Transaction.from(fromBase64(transaction));
  tx.partialSign(mint);
  const signature = await send(provider, tx, cluster);
  return { mint: mint.publicKey.toBase58(), keypair: mint, signature };
}

export interface OpenSaleInput {
  shareMint: string;
  quoteMint: string;
  presetParameter: string;
  binStep: number;
  baseFactor: string;
  initialPrice: number;
}

export interface OpenSaleResult {
  pool: string;
  created: boolean;
  signature: string | null;
}

/// Creates the pFEE/quote DLMM pair if it does not exist yet.
export async function openSale(
  provider: SolanaProvider,
  input: OpenSaleInput,
  cluster?: string,
): Promise<OpenSaleResult> {
  const { pool, created, transaction } = await post<{
    pool: string;
    created: boolean;
    transaction: string | null;
  }>("/v1/tx/open-sale", { owner: requirePublicKey(provider), ...input }, cluster);
  if (!transaction) return { pool, created, signature: null };
  const signature = await send(provider, Transaction.from(fromBase64(transaction)), cluster);
  return { pool, created, signature };
}

export interface SeedLadderInput {
  poolAddress: string;
  shareMint: string;
  quoteMint: string;
  binStep: number;
  plan: LadderView;
}

/// Seeds the one-sided ask ladder. The fresh position account is generated here and signs.
export async function seedLadder(
  provider: SolanaProvider,
  input: SeedLadderInput,
  cluster?: string,
): Promise<{ positionAddress: string; signature: string }> {
  const position = Keypair.generate();
  const { positionAddress, transaction } = await post<{
    positionAddress: string;
    transaction: string;
  }>(
    "/v1/tx/seed-ladder",
    {
      owner: requirePublicKey(provider),
      ...input,
      positionPubKey: position.publicKey.toBase58(),
    },
    cluster,
  );
  const tx = Transaction.from(fromBase64(transaction));
  tx.partialSign(position);
  const signature = await send(provider, tx, cluster);
  return { positionAddress, signature };
}

export interface LaunchInput {
  baseMint: string;
  quoteMint: string;
  name: string;
  symbol: string;
  uri: string;
  totalTokenSupply: number;
  creatorTradingFeePercentage: number;
  partnerLiquidityPercentage: number;
  partnerPermanentLockedLiquidityPercentage: number;
  creatorLiquidityPercentage: number;
  creatorPermanentLockedLiquidityPercentage: number;
}

export async function deployLaunch(
  provider: SolanaProvider,
  input: LaunchInput,
  cluster?: string,
  baseMintKeypair?: Keypair,
): Promise<{ config: string; pool: string; signature: string }> {
  const creator = requirePublicKey(provider);
  const config = Keypair.generate();
  if (baseMintKeypair && baseMintKeypair.publicKey.toBase58() !== input.baseMint) {
    throw new Error("that base mint keypair does not match this launch");
  }
  const { pool, transaction } = await post<{ config: string; pool: string; transaction: string }>(
    "/v1/tx/launch",
    {
      creator,
      config: config.publicKey.toBase58(),
      feeClaimer: creator,
      leftoverReceiver: creator,
      ...input,
    },
    cluster,
  );
  const tx = Transaction.from(fromBase64(transaction));
  if (baseMintKeypair) tx.partialSign(config, baseMintKeypair);
  else tx.partialSign(config);
  const signature = await send(provider, tx, cluster);
  return { config: config.publicKey.toBase58(), pool, signature };
}

export async function warmPool(
  provider: SolanaProvider,
  vault: string,
  cluster?: string,
  tokens?: number,
): Promise<WarmPoolResult> {
  const owner = requirePublicKey(provider);
  const built = await post<{ pool: string; swap: string; fuel: string | null; amountIn: string }>(
    "/v1/tx/warm-pool",
    { owner, vault, ...(tokens ? { tokens } : {}) },
    cluster,
  );
  /// Fuel first — without it the swap has nothing to sell. Both are signed by the wallet, so a
  /// refusal stops here and the caller decides whether to crack on.
  if (built.fuel) await send(provider, Transaction.from(fromBase64(built.fuel)), cluster);
  const signature = await send(provider, Transaction.from(fromBase64(built.swap)), cluster);
  return { pool: built.pool, signature, amountIn: built.amountIn };
}

export interface WarmPoolResult {
  pool: string;
  signature: string;
  amountIn: string;
}

export interface LockedPositionResult {
  pool: string;
  position: string;
  mintA: string;
  mintB: string;
  signature: string;
}

export async function createLockedPosition(
  provider: SolanaProvider,
  cluster?: string,
): Promise<LockedPositionResult> {
  const owner = requirePublicKey(provider);
  const mintA = Keypair.generate();
  const mintB = Keypair.generate();
  const positionNft = Keypair.generate();

  const { pool, position, setup, create } = await post<{
    pool: string;
    position: string;
    setup: string;
    create: string;
  }>(
    "/v1/tx/create-locked-position",
    {
      owner,
      mintA: mintA.publicKey.toBase58(),
      mintB: mintB.publicKey.toBase58(),
      positionNft: positionNft.publicKey.toBase58(),
    },
    cluster,
  );

  const setupTx = Transaction.from(fromBase64(setup));
  setupTx.partialSign(mintA, mintB);
  await send(provider, setupTx, cluster);

  const createTx = Transaction.from(fromBase64(create));
  createTx.partialSign(positionNft);
  const signature = await send(provider, createTx, cluster);

  await new Connection(rpcUrl(cluster), "confirmed").confirmTransaction(signature, "confirmed");

  return {
    pool,
    position,
    mintA: mintA.publicKey.toBase58(),
    mintB: mintB.publicKey.toBase58(),
    signature,
  };
}
