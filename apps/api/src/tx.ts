import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { PerpetuaVaultClient, findConfigPda, findStakePda, findVaultPda } from "@perpetua/sdk";
import type {
  ClaimAccounts,
  DbcLaunchParams,
  DlmmPreset,
  LadderPlan,
  VaultAccountData,
} from "@perpetua/sdk";
import { DammV2Adapter } from "@perpetua/sdk/adapters/damm-v2";
import { DbcAdapter } from "@perpetua/sdk/adapters/dbc";
import { DlmmAdapter } from "@perpetua/sdk/adapters/dlmm";
import { type Cluster, resolveNetwork } from "@perpetua/shared";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";

export const SHARE_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/// Builds a read-only Anchor provider: it only reads accounts, so the wallet never signs. Exported
/// because the vault registry is read from the chain, not from an indexer.
export function readonlyProvider(connection: Connection, feePayer: PublicKey): AnchorProvider {
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
  return serializeInstructions(connection, [instruction], feePayer);
}

/// A transaction carrying several instructions. Fee claims and the first stake each need idempotent
/// account creates in the same transaction as the instruction that uses them, so every builder that
/// has setup work goes through here.
async function serializeInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer: string,
): Promise<string> {
  const transaction = new Transaction().add(...instructions);
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

/// `harvest` pays a holder out with `transfer_checked`, so the holder's own fee token accounts have
/// to exist first. Deriving them as associated accounts and creating them idempotently is what lets
/// a first harvest succeed instead of failing with `AccountNotInitialized`.
function ownerFeeAccountSetup(
  claim: ClaimAccounts,
  owner: PublicKey,
  payer: PublicKey,
): TransactionInstruction[] {
  return [
    { mint: claim.tokenAMint, program: claim.tokenAProgram },
    { mint: claim.tokenBMint, program: claim.tokenBProgram },
  ].map(({ mint, program }) =>
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      getAssociatedTokenAddressSync(mint, owner, true, program),
      owner,
      mint,
      program,
    ),
  );
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
  const adapter = new DammV2Adapter(connection);
  const setup = adapter.claimSetupInstructions(refs.claim, refs.vault, caller);
  return serializeInstructions(connection, [...setup, instruction], params.caller);
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

  // The vault's share account and the fee accounts the claim pays into are created in the same
  // transaction: neither `create_vault` nor anything else makes them, so a first stake fails without
  // this. Both creates are idempotent.
  const setup = [
    ...refs.client.shareAccountSetupInstructions({
      payer: owner,
      shareMint: refs.account.shareMint,
      vault: refs.vault,
      tokenProgram: SHARE_TOKEN_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
    }),
    ...new DammV2Adapter(connection).claimSetupInstructions(refs.claim, refs.vault, owner),
  ];
  return serializeInstructions(connection, [...setup, instruction], params.owner);
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

  // `unstake` claims before it releases, so it needs the same setup as `stake`: the vault's share
  // account, and the fee accounts the claim pays into.
  const setup = [
    ...refs.client.shareAccountSetupInstructions({
      payer: owner,
      shareMint: refs.account.shareMint,
      vault: refs.vault,
      tokenProgram: SHARE_TOKEN_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
    }),
    ...new DammV2Adapter(connection).claimSetupInstructions(refs.claim, refs.vault, owner),
  ];
  return serializeInstructions(connection, [...setup, instruction], params.owner);
}

/// The escape hatch: takes staked shares out **without** the claim CPI. When a fee mint is paused or
/// blocked, the normal `unstake` cannot run, and a holder must still be able to leave with the
/// shares they own. Fees stay in the position and are credited at the next successful touch.
export async function buildUnstakeNoClaim(
  connection: Connection,
  params: StakeParams,
): Promise<string> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  const [stake] = findStakePda(refs.client.programId, refs.vault, owner);

  const instruction = await refs.client.unstakeNoClaim(
    {
      owner,
      vault: refs.vault,
      stake,
      shareMint: refs.account.shareMint,
      ownerShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, owner),
      vaultShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, refs.vault, true),
      shareTokenProgram: SHARE_TOKEN_PROGRAM,
    },
    BigInt(params.amount),
  );

  // The shares are released out of the vault's share account, so it has to exist.
  const setup = refs.client.shareAccountSetupInstructions({
    payer: owner,
    shareMint: refs.account.shareMint,
    vault: refs.vault,
    tokenProgram: SHARE_TOKEN_PROGRAM,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
  });
  return serializeInstructions(connection, [...setup, instruction], params.owner);
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

  // Harvest pays the holder out of the vault's fee accounts, so both sets have to exist: the vault's
  // (created here, and by any earlier claim) and the holder's own associated accounts.
  const adapter = new DammV2Adapter(connection);
  const setup = [
    ...adapter.claimSetupInstructions(refs.claim, refs.vault, owner),
    ...ownerFeeAccountSetup(refs.claim, owner, owner),
  ];
  return serializeInstructions(connection, [...setup, instruction], params.owner);
}

/// Same contract as `serialize`, for builders that hand back a whole SDK transaction instead of a
/// single instruction.
async function serializeTransaction(
  connection: Connection,
  transaction: Transaction,
  feePayer: string,
): Promise<string> {
  transaction.feePayer = new PublicKey(feePayer);
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  return transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

function cluster(): Cluster {
  return resolveNetwork(process.env.CLUSTER).cluster;
}

export interface OpenSaleParams {
  owner: string;
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
  transaction: string | null;
}

/// Builds the unsigned `createLbPair2` transaction for the pFEE/quote pair. When the pair already
/// exists there is nothing to sign, so `created` is false and `transaction` is null.
export async function buildOpenSale(
  connection: Connection,
  params: OpenSaleParams,
): Promise<OpenSaleResult> {
  const adapter = new DlmmAdapter({ connection, cluster: cluster() });
  const result = await adapter.buildCreatePair(params);
  return {
    pool: result.pool,
    created: result.created,
    transaction: result.transaction
      ? await serializeTransaction(connection, result.transaction, params.owner)
      : null,
  };
}

export interface SeedLadderParams {
  owner: string;
  poolAddress: string;
  shareMint: string;
  quoteMint: string;
  positionPubKey: string;
  binStep: number;
  plan: LadderPlan;
}

export interface SeedLadderResponse {
  positionAddress: string;
  minBinId: number;
  maxBinId: number;
  sharesOffered: number;
  shareIsTokenX: boolean;
  transaction: string;
}

/// Builds the unsigned one-sided ask ladder. The position account is signed by the caller's wallet,
/// which generated it.
export async function buildSeedLadder(
  connection: Connection,
  params: SeedLadderParams,
): Promise<SeedLadderResponse> {
  const adapter = new DlmmAdapter({ connection, cluster: cluster() });
  const result = await adapter.buildSeedLadder(params);
  return {
    positionAddress: result.positionAddress,
    minBinId: result.minBinId,
    maxBinId: result.maxBinId,
    sharesOffered: result.sharesOffered,
    shareIsTokenX: result.shareIsTokenX,
    transaction: await serializeTransaction(connection, result.transaction, params.owner),
  };
}

export interface CreateMintParams {
  payer: string;
  mint: string;
  decimals: number;
}

/// Builds the base mint a DBC launch needs: a plain SPL mint owned by the creator. The mint keypair
/// is generated on the client and signs; DBC mints the supply into the curve at pool creation.
export async function buildCreateMint(
  connection: Connection,
  params: CreateMintParams,
): Promise<string> {
  const payer = new PublicKey(params.payer);
  const mint = new PublicKey(params.mint);
  const rent = await getMinimumBalanceForRentExemptMint(connection);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint, params.decimals, payer, payer),
  );
  return serializeTransaction(connection, transaction, params.payer);
}

export type LaunchParams = DbcLaunchParams;

export interface LaunchResponse {
  config: string;
  pool: string;
  transaction: string;
}

/// Builds the unsigned financeable launch: the DBC config and its pool, in one transaction.
export async function buildLaunch(
  connection: Connection,
  params: LaunchParams,
): Promise<LaunchResponse> {
  const adapter = new DbcAdapter({ connection });
  const result = await adapter.buildLaunch(params);
  return {
    config: result.config,
    pool: result.pool,
    transaction: await serializeTransaction(connection, result.transaction, params.creator),
  };
}

/// The DLMM presets available on this cluster, i.e. the bin steps a share pair may be created at.
export async function listDlmmPresets(connection: Connection): Promise<DlmmPreset[]> {
  const adapter = new DlmmAdapter({ connection, cluster: cluster() });
  return adapter.listPresets();
}
