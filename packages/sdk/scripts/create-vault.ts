import { readFileSync } from "node:fs";
import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, Transaction, type VersionedTransaction } from "@solana/web3.js";
import {
  PerpetuaVaultClient,
  createConnection,
  findConfigPda,
  findVaultPda,
} from "../src/index.js";

const REQUIRED = [
  "POSITION",
  "POOL",
  "POSITION_NFT_MINT",
  "POSITION_NFT_ACCOUNT",
  "POSITION_NFT_PROGRAM",
  "TOKEN_A_MINT",
  "TOKEN_B_MINT",
  "TOKEN_A_PROGRAM",
  "TOKEN_B_PROGRAM",
  "CP_AMM_PROGRAM",
] as const;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

async function main(): Promise<void> {
  for (const name of REQUIRED) env(name);

  const creator = loadKeypair(env("KEYPAIR"));
  const shareMint = Keypair.generate();

  const connection = createConnection({ cluster: process.env.CLUSTER });
  const wallet: Wallet = {
    publicKey: creator.publicKey,
    payer: creator,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet, {});
  const client = PerpetuaVaultClient.create(provider);
  const programId = client.programId;

  const position = new PublicKey(env("POSITION"));
  const [config] = findConfigPda(programId);
  const [vault] = findVaultPda(programId, position);
  const creatorShareAccount = getAssociatedTokenAddressSync(shareMint.publicKey, creator.publicKey);

  const instruction = await client.createVault({
    creator: creator.publicKey,
    config,
    pool: new PublicKey(env("POOL")),
    position,
    positionNftMint: new PublicKey(env("POSITION_NFT_MINT")),
    positionNftAccount: new PublicKey(env("POSITION_NFT_ACCOUNT")),
    positionNftProgram: new PublicKey(env("POSITION_NFT_PROGRAM")),
    tokenAMint: new PublicKey(env("TOKEN_A_MINT")),
    tokenBMint: new PublicKey(env("TOKEN_B_MINT")),
    tokenAProgram: new PublicKey(env("TOKEN_A_PROGRAM")),
    tokenBProgram: new PublicKey(env("TOKEN_B_PROGRAM")),
    vault,
    shareMint: shareMint.publicKey,
    creatorShareAccount,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
    cpAmmProgram: new PublicKey(env("CP_AMM_PROGRAM")),
  });

  const transaction = new Transaction().add(instruction);
  const signature = await provider.sendAndConfirm(transaction, [creator, shareMint]);

  console.log(`share mint: ${shareMint.publicKey.toBase58()}`);
  console.log(`vault:      ${vault.toBase58()}`);
  console.log(`signature:  ${signature}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
