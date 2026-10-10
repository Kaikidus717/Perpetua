import type { PoolDailySeries } from "@perpetua/shared";
import type { Transaction } from "@solana/web3.js";
import type { LadderPlan } from "./sale/ladder.js";

/// Read-only pool history.
///
/// Positions are deliberately *not* part of this port: Meteora's data API exposes wallet endpoints
/// (`/wallets/{wallet}/open_positions`) but indexes mainnet only, so positions are read from the DAMM
/// v2 program itself (see `DammV2Adapter`). That works on devnet and does not put an indexer in the
/// custody path.
export interface DataApiPort {
  poolDaily(pool: string, days: number): Promise<PoolDailySeries>;
}

export interface DlmmPreset {
  address: string;
  binStep: number;
  /// `ln(1 + binStep / 10_000)` underpins every bin-id; the pair address depends on it too, so the
  /// preset account is read for both.
  baseFactor: string;
}

export interface SharePoolParams {
  owner: string;
  shareMint: string;
  quoteMint: string;
  presetParameter: string;
  binStep: number;
  baseFactor: string;
  /// Price of one share expressed in quote token units.
  initialPrice: number;
}

export interface CreatePairResult {
  pool: string;
  /// False when the pair already existed, in which case `transaction` is null.
  created: boolean;
  transaction: Transaction | null;
}

export interface SeedLadderParams {
  owner: string;
  poolAddress: string;
  shareMint: string;
  quoteMint: string;
  /// A fresh position account. Generated on the client so the wallet can sign for it.
  positionPubKey: string;
  plan: LadderPlan;
  binStep: number;
}

export interface SeedLadderResult {
  poolAddress: string;
  positionAddress: string;
  minBinId: number;
  maxBinId: number;
  sharesOffered: number;
  /// True when the offered token is pool token X (asks above the active bin), false for token Y
  /// (the mirror bids below it).
  shareIsTokenX: boolean;
  transaction: Transaction;
}

/// Everything the adapters need to *build* a transaction. Adapters never sign: the caller's wallet
/// does, so no key material ever reaches the API process.
export interface DlmmPort {
  /// Presets available for permissionless pair creation on this cluster.
  listPresets(): Promise<DlmmPreset[]>;
  /// The share/quote pair PDA at this bin step and base factor.
  deriveSharePool(params: {
    shareMint: string;
    quoteMint: string;
    binStep: number;
    baseFactor: string;
  }): string;
  /// Builds the unsigned `createLbPair2` transaction, or reports that the pair already exists.
  buildCreatePair(params: SharePoolParams): Promise<CreatePairResult>;
  /// Builds the unsigned transaction that seeds the one-sided ask ladder.
  buildSeedLadder(params: SeedLadderParams): Promise<SeedLadderResult>;
}

export interface DbcLaunchParams {
  creator: string;
  /// A fresh config account. Generated on the client so the wallet can sign for it.
  config: string;
  baseMint: string;
  quoteMint: string;
  feeClaimer: string;
  leftoverReceiver: string;
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

export interface DbcLaunchResult {
  config: string;
  pool: string;
  transaction: Transaction;
}

export interface DbcPort {
  /// Builds the unsigned `createConfigAndPool` transaction: the financeable config and the pool it
  /// governs, in one instruction set.
  buildLaunch(params: DbcLaunchParams): Promise<DbcLaunchResult>;
}
