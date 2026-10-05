import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { PerpetuaVaultClient, findConfigPda, findStakePda, findVaultPda } from "@perpetua/sdk";
import type { ClaimAccounts, VaultAccountData } from "@perpetua/sdk";
import { DammV2Adapter } from "@perpetua/sdk/adapters/damm-v2";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  type Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";

export const SHARE_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

function readonlyProvider(connection: Connection, feePayer: PublicKey): AnchorProvider {
  // Read-only provider: it only builds unsigned instructions, the caller's wallet signs them.
  const wallet: Wallet = {
    publicKey: feePayer,
    payer: Keypair.generate(),
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
  };
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

async function serialize(
  connection: Connection,
  instruction: TransactionInstruction,
  feePayer: string,
): Promise<string> {
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = new PublicKey(feePayer);
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  return transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

interface VaultRefs {
  client: PerpetuaVaultClient;
  config: PublicKey;
  vault: PublicKey;
  account: VaultAccountData;
  claim: ClaimAccounts;
}

async function resolveVault(
  connection: Connection,
  feePayer: PublicKey,
  vaultAddress: string,
): Promise<VaultRefs> {
  const client = PerpetuaVaultClient.create(readonlyProvider(connection, feePayer));
  const vault = new PublicKey(vaultAddress);
  const account = await client.fetchVault(vault);
  const [config] = findConfigPda(client.programId);
  const cfg = await client.fetchConfig(config);
  const adapter = new DammV2Adapter(connection);
  const claim = await adapter.claimAccountsFor(
    {
      vault,
      pool: account.pool,
      position: account.position,
      positionNftAccount: account.positionNftAccount,
      tokenAMint: account.tokenAMint,
      tokenBMint: account.tokenBMint,
      tokenAProgram: account.tokenAProgram,
      tokenBProgram: account.tokenBProgram,
    },
    cfg.treasury,
  );
  return { client, config, vault, account, claim };
}

export interface CreateVaultParams {
  creator: string;
  pool: string;
  position: string;
  positionNftMint: string;
  positionNftAccount: string;
  positionNftProgram: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAProgram: string;
  tokenBProgram: string;
  shareMint: string;
}

export async function buildCreateVault(
  connection: Connection,
  params: CreateVaultParams,
): Promise<string> {
  const creator = new PublicKey(params.creator);
  const client = PerpetuaVaultClient.create(readonlyProvider(connection, creator));
  const position = new PublicKey(params.position);
  const [config] = findConfigPda(client.programId);
  const [vault] = findVaultPda(client.programId, position);
  const shareMint = new PublicKey(params.shareMint);

  const instruction = await client.createVault({
    creator,
    config,
    pool: new PublicKey(params.pool),
    position,
    positionNftMint: new PublicKey(params.positionNftMint),
    positionNftAccount: new PublicKey(params.positionNftAccount),
    positionNftProgram: new PublicKey(params.positionNftProgram),
    tokenAMint: new PublicKey(params.tokenAMint),
    tokenBMint: new PublicKey(params.tokenBMint),
    tokenAProgram: new PublicKey(params.tokenAProgram),
    tokenBProgram: new PublicKey(params.tokenBProgram),
    vault,
    shareMint,
    creatorShareAccount: getAssociatedTokenAddressSync(shareMint, creator),
    tokenProgram: SHARE_TOKEN_PROGRAM,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
    systemProgram: SYSTEM_PROGRAM,
    cpAmmProgram: new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"),
  });

  return serialize(connection, instruction, params.creator);
}

export async function buildCrankClaim(
  connection: Connection,
  params: { caller: string; vault: string },
): Promise<string> {
  const caller = new PublicKey(params.caller);
  const refs = await resolveVault(connection, caller, params.vault);
  const instruction = await refs.client.crankClaim({
    caller,
    config: refs.config,
    vault: refs.vault,
    ...refs.claim,
  });
  return serialize(connection, instruction, params.caller);
}

export interface StakeParams {
  owner: string;
  vault: string;
  amount: string;
}

export async function buildStake(connection: Connection, params: StakeParams): Promise<string> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  const [stake] = findStakePda(refs.client.programId, refs.vault, owner);

  const instruction = await refs.client.stake(
    {
      owner,
      config: refs.config,
      vault: refs.vault,
      ...refs.claim,
      stake,
      shareMint: refs.account.shareMint,
      ownerShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, owner),
      vaultShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, refs.vault, true),
      shareTokenProgram: SHARE_TOKEN_PROGRAM,
      systemProgram: SYSTEM_PROGRAM,
    },
    BigInt(params.amount),
  );

  return serialize(connection, instruction, params.owner);
}

export async function buildUnstake(connection: Connection, params: StakeParams): Promise<string> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  const [stake] = findStakePda(refs.client.programId, refs.vault, owner);

  const instruction = await refs.client.unstake(
    {
      owner,
      config: refs.config,
      vault: refs.vault,
      ...refs.claim,
      stake,
      shareMint: refs.account.shareMint,
      ownerShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, owner),
      vaultShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, refs.vault, true),
      shareTokenProgram: SHARE_TOKEN_PROGRAM,
    },
    BigInt(params.amount),
  );

  return serialize(connection, instruction, params.owner);
}

export async function buildHarvest(
  connection: Connection,
  params: { owner: string; vault: string },
): Promise<string> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  const [stake] = findStakePda(refs.client.programId, refs.vault, owner);

  const instruction = await refs.client.harvest({
    owner,
    vault: refs.vault,
    stake,
    tokenAMint: refs.account.tokenAMint,
    tokenBMint: refs.account.tokenBMint,
    vaultAAccount: refs.claim.vaultAAccount,
    vaultBAccount: refs.claim.vaultBAccount,
    ownerAAccount: getAssociatedTokenAddressSync(
      refs.account.tokenAMint,
      owner,
      true,
      refs.account.tokenAProgram,
    ),
    ownerBAccount: getAssociatedTokenAddressSync(
      refs.account.tokenBMint,
      owner,
      true,
      refs.account.tokenBProgram,
    ),
    tokenAProgram: refs.account.tokenAProgram,
    tokenBProgram: refs.account.tokenBProgram,
  });

  return serialize(connection, instruction, params.owner);
}
