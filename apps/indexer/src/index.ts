import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { DrizzleStore, InMemoryStore, type Store, createDb } from "@perpetua/api";
import { PerpetuaVaultClient } from "@perpetua/sdk";
import { Connection, Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { MeteoraDataApi } from "./dataApi.js";
import { Indexer } from "./indexer.js";

const rpcUrl = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const dataApiUrl = process.env.METEORA_DATA_API ?? "https://dlmm.datapi.meteora.ag";
const databaseUrl = process.env.DATABASE_URL;

const connection = new Connection(rpcUrl, "confirmed");
const wallet: Wallet = {
  publicKey: Keypair.generate().publicKey,
  payer: Keypair.generate(),
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const vault = PerpetuaVaultClient.create(provider);
const store: Store = databaseUrl ? new DrizzleStore(createDb(databaseUrl).db) : new InMemoryStore();
const dataApi = new MeteoraDataApi({ baseUrl: dataApiUrl });

const indexer = new Indexer({ connection, vault, store, dataApi });

void indexer.tick().catch((error: unknown) => console.error("initial index failed", error));
indexer.start();

process.on("SIGINT", () => {
  indexer.stop();
  process.exit(0);
});
