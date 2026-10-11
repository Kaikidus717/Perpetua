"use client";

import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { type LadderView, apiBase } from "./api";
import { type SolanaProvider, providerAddress } from "./wallet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

/// The RPC the browser itself talks to when it has to broadcast a signed transaction. It has to match
/// the cluster the transaction was built for — a devnet transaction sent to a mainnet RPC is simply
/// rejected — so it is chosen per call rather than once at build time.
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
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : `request failed: ${response.status}`;
    throw new Error(detail);
  }
  return payload as T;
}

/// Reading a method off a wallet can throw before it is ever called: some extensions hand out a
/// `Proxy` that refuses one of these properties. Reading is guarded; calling is not, on purpose, so
/// that "the user rejected the request" still reaches the visitor as a rejection.
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

async function send(
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

/// Creates the SPL mint a launch needs. The mint keypair is generated here, signs, and its public
/// key is returned so the launch can reference it.
/// Mints the base token a launch needs. `cluster` decides which network it is minted on, so a creator
/// on mainnet gets a mainnet mint.
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

/// Deploys the financeable DBC launch. The config account is generated here and signs. `cluster` is
/// the network the pool is created on — Meteora's DBC and DAMM v2 programs run on both devnet and
/// mainnet, so a creator with a mainnet wallet launches on mainnet.
export async function deployLaunch(
  provider: SolanaProvider,
  input: LaunchInput,
  cluster?: string,
  /// The base mint's keypair. DBC asks the mint to sign alongside the config, so it has to survive
  /// from `createBaseMint` to here — without it the transaction is one signature short and the wallet
  /// refuses it.
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

export interface LockedPositionResult {
  pool: string;
  position: string;
  mintA: string;
  mintB: string;
  signature: string;
}

/// Creates a fresh DAMM v2 pool whose initial position is **permanently locked** and owned by the
/// connected wallet, so a wallet that holds nothing has something to securitize. Two transactions:
/// the mints (signed by the two fresh mint keypairs), then the pool (signed by the fresh NFT keypair).
/// Works on devnet and mainnet alike — the wallet signs, so no key ever leaves it.
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

  /// Wait for it to land. The caller rescans the wallet the instant this returns, and a wallet that
  /// only *sent* the transaction would leave that scan looking at a chain where the position does not
  /// exist yet — which reads as "nothing was created".
  await new Connection(rpcUrl(cluster), "confirmed").confirmTransaction(signature, "confirmed");

  return {
    pool,
    position,
    mintA: mintA.publicKey.toBase58(),
    mintB: mintB.publicKey.toBase58(),
    signature,
  };
}
