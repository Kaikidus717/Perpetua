import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";
import type { LadderPlan } from "./sale/ladder.js";

export interface DataApiPort {
  poolDaily(pool: string, days: number): Promise<PoolDailySeries>;
  walletPositions(wallet: string): Promise<PositionSummary[]>;
}

export interface DlmmPreset {
  address: string;
  binStep: number;
}

export interface SharePoolParams {
  owner: string;
  shareMint: string;
  quoteMint: string;
  presetParameter: string;
  binStep: number;
  /// Price of one share expressed in quote token units.
  initialPrice: number;
}

export interface SeedLadderParams {
  owner: string;
  poolAddress: string;
  shareMint: string;
  plan: LadderPlan;
  binStep: number;
}

export interface SeedLadderResult {
  poolAddress: string;
  positionAddress: string;
  minBinId: number;
  maxBinId: number;
  sharesOffered: number;
}

export interface DlmmPort {
  /// Presets available for permissionless pair creation on this cluster.
  listPresets(): Promise<DlmmPreset[]>;
  /// Creates the `pFEE/quote` pair if it does not exist, returns the pool address.
  ensureSharePool(params: SharePoolParams): Promise<string>;
  /// Seeds the one-sided ask ladder as a single BidAsk position over the plan range.
  seedOneSidedAsk(params: SeedLadderParams): Promise<SeedLadderResult>;
}

export interface DbcConfigParams {
  creator: string;
  feeClaimer: string;
  leftoverReceiver: string;
  quoteMint: string;
  totalTokenSupply: number;
  creatorTradingFeePercentage: number;
  partnerLiquidityPercentage: number;
  partnerPermanentLockedLiquidityPercentage: number;
  creatorLiquidityPercentage: number;
  creatorPermanentLockedLiquidityPercentage: number;
}

export interface DbcPoolParams {
  creator: string;
  config: string;
  baseMint: string;
  quoteMint: string;
  name: string;
  symbol: string;
  uri: string;
}

export interface DbcLaunchResult {
  config: string;
  pool: string;
}

export interface DbcPort {
  createConfig(params: DbcConfigParams): Promise<string>;
  createPool(params: DbcPoolParams): Promise<DbcLaunchResult>;
}
