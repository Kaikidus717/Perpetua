import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { InMemoryStore, type Store } from "@perpetua/api";
import { PerpetuaVaultClient, createConnection } from "@perpetua/sdk";
import { MeteoraDataApi } from "@perpetua/sdk/data";
import { resolveNetwork } from "@perpetua/shared";
import { Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { Indexer } from "./indexer.js";

const network = resolveNetwork(process.env.CLUSTER);
const dataApiUrl = process.env.METEORA_DATA_API ?? network.dammV2DataApi;
const databaseUrl = process.env.DATABASE_URL;

async function resolveStore(): Promise<Store> {
  if (!databaseUrl) return new InMemoryStore();
  const { createDb, DrizzleStore } = await import("@perpetua/api/db");
  return new DrizzleStore(createDb(databaseUrl).db);
}

const connection = createConnection({ cluster: process.env.CLUSTER });
const wallet: Wallet = {
  publicKey: Keypair.generate().publicKey,
  payer: Keypair.generate(),
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const vault = PerpetuaVaultClient.create(provider);
const store = await resolveStore();
const dataApi = new MeteoraDataApi({ baseUrl: dataApiUrl });

const indexer = new Indexer({ connection, vault, store, dataApi });

void indexer.tick().catch((error: unknown) => console.error("initial index failed", error));
indexer.start();

process.on("SIGINT", () => {
  indexer.stop();
  process.exit(0);
});
