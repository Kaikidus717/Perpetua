import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import {
  PerpetuaVaultClient,
  findConfigPda,
  findStakePda,
  findVaultPda,
  pending as pendingFees,
} from "@perpetua/sdk";
import type {
  ClaimAccounts,
  DbcLaunchParams,
  DlmmPreset,
  LadderPlan,
  StakeAccountData,
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

/// `FEE_PER_SHARE_PRECISION` in `programs/perpetua_vault/src/constants.rs`, needed to mirror the
/// program's pending-fee formula exactly.
const FEE_PER_SHARE_PRECISION = 10n ** 18n;

/// The largest a legacy (non-versioned) transaction may be, signatures and all. The RPC rejects
/// anything longer with "Transaction too large", and some wallets refuse to sign it at all — so a
/// build that overflows this is the *request's* fault and has to say which field is too long, rather
/// than reaching the wallet and coming back as a shrug.
const MAX_LEGACY_TX_BYTES = 1232;

/// A build failure the caller can fix (400), as opposed to an upstream fault like a dead RPC (502).
/// The pages word their errors per cause, so the two must not be collapsed into one status.
export class BuilderError extends Error {
  readonly status: 400 | 502;

  constructor(message: string, status: 400 | 502 = 400) {
    super(message);
    this.name = "BuilderError";
    this.status = status;
  }
}

/// Serialize for the wallet to sign, refusing anything the network cannot carry.
///
/// web3.js does its own size check and throws first ("Transaction too large: 1278 > 1232"), which would
/// reach the pages as an upstream fault; catching it here keeps it a 400 with an actionable sentence.
function encode(transaction: Transaction): string {
  let wire: Buffer;
  try {
    wire = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  } catch (error) {
    if (error instanceof Error && /too large|exceed/i.test(error.message)) {
      throw new BuilderError(
        `the transaction is over the ${MAX_LEGACY_TX_BYTES}-byte limit a Solana transaction may occupy (${error.message}). Shorten the longest field — on a launch that is the metadata link — and try again.`,
      );
    }
    throw error;
  }
  if (wire.length > MAX_LEGACY_TX_BYTES) {
    throw new BuilderError(
      `this transaction is ${wire.length} bytes and a Solana transaction can carry at most ${MAX_LEGACY_TX_BYTES}; shorten the longest field (on a launch that is the metadata link) and try again`,
    );
  }
  return wire.toString("base64");
}

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
  return encode(transaction);
}

interface VaultRefs {
  client: PerpetuaVaultClient;
  config: PublicKey;
  vault: PublicKey;
  account: VaultAccountData;
  claim: ClaimAccounts;
  /// The caller's stake account, `null` when this wallet has never staked in this vault. Handing the
  /// program a stake PDA that does not exist fails with Anchor's `AccountNotInitialized` (3012),
  /// which is not something a visitor can act on — so the builders check first and say what is wrong.
  stake: StakeAccountData | null;
  stakeAddress: PublicKey;
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
  const [stakeAddress] = findStakePda(client.programId, vault, feePayer);
  const stake = await client.fetchStakeNullable(stakeAddress);
  return { client, config, vault, account, claim, stake, stakeAddress };
}

/// The on-chain accumulator's own formula, mirrored in `@perpetua/sdk/math`, so the builders can tell
/// "nothing is ready to harvest" apart from "this wallet never staked" *before* the wallet is asked to
/// sign. Both of those otherwise surface as opaque program errors.
function pendingNow(refs: VaultRefs): bigint {
  if (!refs.stake) return 0n;
  const amount = BigInt(refs.stake.amount.toString());
  const a = pendingFees(
    amount,
    BigInt(refs.account.accFeePerShareA.toString()),
    BigInt(refs.stake.debtA.toString()),
    FEE_PER_SHARE_PRECISION,
  );
  const b = pendingFees(
    amount,
    BigInt(refs.account.accFeePerShareB.toString()),
    BigInt(refs.stake.debtB.toString()),
    FEE_PER_SHARE_PRECISION,
  );
  return a + b;
}

/// The stake amount this wallet actually holds, so "stake 5 shares" with 2 in the wallet is answered
/// with a sentence instead of a token-program failure. `null` when the balance cannot be read.
async function shareBalance(
  connection: Connection,
  shareMint: PublicKey,
  owner: PublicKey,
): Promise<bigint | null> {
  try {
    const account = getAssociatedTokenAddressSync(shareMint, owner);
    const balance = await connection.getTokenAccountBalance(account);
    return BigInt(balance.value.amount);
  } catch {
    return null;
  }
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
  const stake = refs.stakeAddress;
  const amount = BigInt(params.amount);

  if (amount <= 0n) throw new BuilderError("stake a positive number of shares");
  const held = await shareBalance(connection, refs.account.shareMint, owner);
  if (held !== null && amount > held) {
    throw new BuilderError(
      `this wallet holds ${held.toString()} of these shares, so it cannot stake ${amount.toString()} — buy or create shares first`,
    );
  }

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
    amount,
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
  const stakeAccount = requireStake(refs, "unstake");
  const amount = requireStakeAmount(refs, stakeAccount, params.amount);

  const instruction = await refs.client.unstake(
    {
      owner,
      config: refs.config,
      vault: refs.vault,
      ...refs.claim,
      stake: refs.stakeAddress,
      shareMint: refs.account.shareMint,
      ownerShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, owner),
      vaultShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, refs.vault, true),
      shareTokenProgram: SHARE_TOKEN_PROGRAM,
    },
    amount,
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
  const stakeAccount = requireStake(refs, "release shares from");
  const amount = requireStakeAmount(refs, stakeAccount, params.amount);

  const instruction = await refs.client.unstakeNoClaim(
    {
      owner,
      vault: refs.vault,
      stake: refs.stakeAddress,
      shareMint: refs.account.shareMint,
      ownerShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, owner),
      vaultShareAccount: getAssociatedTokenAddressSync(refs.account.shareMint, refs.vault, true),
      shareTokenProgram: SHARE_TOKEN_PROGRAM,
    },
    amount,
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

/// The caller's stake, or a sentence explaining that there is none. Without this the program answers
/// with `AccountNotInitialized` (3012) on the `stake` account, which reads as a broken app.
function requireStake(refs: VaultRefs, action: string): StakeAccountData {
  if (!refs.stake) {
    throw new BuilderError(
      `this wallet has no shares staked in that vault, so there is nothing to ${action} — stake shares first`,
    );
  }
  return refs.stake;
}

/// The amount must be a positive number no larger than what is actually staked.
function requireStakeAmount(refs: VaultRefs, stake: StakeAccountData, amount: string): bigint {
  const value = BigInt(amount);
  const staked = BigInt(stake.amount.toString());
  if (value <= 0n) throw new BuilderError("give a positive number of shares");
  if (value > staked) {
    throw new BuilderError(
      `this wallet has ${staked.toString()} shares staked in that vault (${refs.stakeAddress.toBase58()}), less than ${value.toString()}`,
    );
  }
  return value;
}

export async function buildHarvest(
  connection: Connection,
  params: { owner: string; vault: string },
): Promise<string> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  requireStake(refs, "harvest");

  // `harvest` settles first and then refuses when nothing is owed (`NothingToHarvest`, 6005). Saying
  // so here — with the reason fees have not accrued — beats a program error the wallet cannot explain.
  if (pendingNow(refs) === 0n) {
    throw new BuilderError(
      "no fees are ready to harvest: this position has not earned anything since the last claim, so run Crank claim once the pool has swap volume, then harvest",
    );
  }

  const instruction = await refs.client.harvest({
    owner,
    vault: refs.vault,
    stake: refs.stakeAddress,
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
  return encode(transaction);
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
/// The DLMM presets are **per cluster**: a preset account that exists on mainnet does not exist on
/// devnet, and `createLbPair2` answers "Account does not exist" when handed one from the other
/// network. So the cluster a request is for is threaded through instead of read from the process
/// default — which is mainnet on this deployment, and silently wrong for every devnet vault.
export async function buildOpenSale(
  connection: Connection,
  params: OpenSaleParams,
  clusterName: Cluster = cluster(),
): Promise<OpenSaleResult> {
  const adapter = new DlmmAdapter({ connection, cluster: clusterName });
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
///
/// The DBC program creates the base token itself — `initialize_virtual_pool_with_spl_token` allocates
/// the mint account as part of pool creation — so the mint must be a *fresh* address here. Creating it
/// first (the old two-step flow) makes the launch die on-chain with `Allocate … already in use`
/// (`custom program error: 0x0`), which is why that is refused up front instead.
export async function buildLaunch(
  connection: Connection,
  params: LaunchParams,
): Promise<LaunchResponse> {
  if (await connection.getAccountInfo(new PublicKey(params.baseMint))) {
    throw new BuilderError(
      "that base mint already exists on chain. A DBC launch creates the token itself, so pass the address of a fresh keypair — the same keypair signs the launch",
    );
  }
  const adapter = new DbcAdapter({ connection });
  const result = await adapter.buildLaunch(params);
  return {
    config: result.config,
    pool: result.pool,
    transaction: await serializeTransaction(connection, result.transaction, params.creator),
  };
}

export interface WarmPoolParams {
  owner: string;
  vault: string;
  /// Whole tokens of the pool's token A to trade. Small on purpose: the fee it leaves is the point.
  tokens?: number;
}

export interface WarmPoolResponse {
  pool: string;
  /// The swap itself. The wallet signs it.
  swap: string;
  /// One-time instructions that give a wallet holding none of token A something to trade, when it
  /// still has that mint's authority. `null` when it already has some.
  fuel: string | null;
  amountIn: string;
}

/// Puts real trading volume on a vault's pool, so a crank has fees to sweep and a harvest has
/// something to pay. A locked position only ever earns from swaps: without this, a demo crank and
/// harvest are honest no-ops, which is exactly what "no fees are ready to harvest" means.
///
/// Nothing is signed here — the wallet signs, like every other builder. The route that serves this is
/// devnet-only, because on mainnet manufacturing the fees a share stands for would defeat the point.
export async function buildWarmPool(
  connection: Connection,
  params: WarmPoolParams,
): Promise<WarmPoolResponse> {
  const owner = new PublicKey(params.owner);
  const refs = await resolveVault(connection, owner, params.vault);
  const adapter = new DammV2Adapter(connection);
  const built = await adapter.buildVolumeSwap({
    owner: params.owner,
    pool: refs.account.pool.toBase58(),
    tokenAMint: refs.account.tokenAMint.toBase58(),
    tokenBMint: refs.account.tokenBMint.toBase58(),
    tokens: params.tokens,
  });
  return {
    pool: built.pool,
    swap: await serializeTransaction(connection, built.swap, params.owner),
    fuel: built.fuel ? await serializeTransaction(connection, built.fuel, params.owner) : null,
    amountIn: built.amountIn,
  };
}

/// The DLMM presets available on this cluster, i.e. the bin steps a share pair may be created at.
/// Cluster-specific, like the accounts they are read from — see `buildOpenSale`.
export async function listDlmmPresets(
  connection: Connection,
  clusterName: Cluster = cluster(),
): Promise<DlmmPreset[]> {
  const adapter = new DlmmAdapter({ connection, cluster: clusterName });
  return adapter.listPresets();
}

export interface LockedPositionParams {
  owner: string;
  mintA: string;
  mintB: string;
  positionNft: string;
}

export interface LockedPositionResponse {
  pool: string;
  position: string;
  mintA: string;
  mintB: string;
  setup: string;
  create: string;
}

/// Builds a fresh DAMM v2 pool whose initial position is permanently locked and owned by `owner`, so
/// a wallet that holds nothing can create something to securitize. Two unsigned transactions come
/// back — the mints, then the pool — and the owner plus the freshly generated keypairs sign. Nothing
/// is signed here, so no key material reaches the API process.
export async function buildLockedPosition(
  connection: Connection,
  params: LockedPositionParams,
): Promise<LockedPositionResponse> {
  const adapter = new DammV2Adapter(connection);
  const result = await adapter.buildLockedPosition({
    payer: params.owner,
    mintA: params.mintA,
    mintB: params.mintB,
    positionNft: params.positionNft,
  });
  return {
    pool: result.pool,
    position: result.position,
    mintA: result.mintA,
    mintB: result.mintB,
    setup: await serializeTransaction(connection, result.setup, params.owner),
    create: await serializeTransaction(connection, result.create, params.owner),
  };
}
