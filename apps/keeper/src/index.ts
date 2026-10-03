import { readFileSync } from "node:fs";
import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { PerpetuaVaultClient } from "@perpetua/sdk";
import { Connection, Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { Keeper } from "./keeper.js";
import { RpcCrankPort } from "./rpcCrankPort.js";

const rpcUrl = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const keypairPath = process.env.KEYPAIR;
if (!keypairPath) throw new Error("KEYPAIR env var is required (path to a solana keypair json)");

const secret = Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]);
const keypair = Keypair.fromSecretKey(secret);
const connection = new Connection(rpcUrl, "confirmed");
const wallet: Wallet = {
  publicKey: keypair.publicKey,
  payer: keypair,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

const keeper = new Keeper(new RpcCrankPort(PerpetuaVaultClient.create(provider), provider), {
  thresholdUsd: Number(process.env.CRANK_THRESHOLD_USD ?? 0),
  intervalMs: Number(process.env.CRANK_INTERVAL_MS ?? 120_000),
});

keeper.start();
console.log("perpetua keeper running");

process.on("SIGINT", () => {
  keeper.stop();
  process.exit(0);
});
