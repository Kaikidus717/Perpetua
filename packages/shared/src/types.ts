export type RiskFlag =
  | "compounding_mode"
  | "pausable_mint"
  | "permanent_delegate"
  | "pool_too_young"
  | "volume_concentration"
  | "low_liquidity";

export type FeeCollectMode = "claimable" | "compounding";

export type PositionLockKind = "permanent" | "vesting" | "unlocked";

export interface PositionSummary {
  address: string;
  pool: string;
  nftMint: string;
  tokenAMint: string;
  tokenBMint: string;
  unlockedLiquidity: string;
  vestedLiquidity: string;
  permanentLockedLiquidity: string;
}

export interface PoolDailySeries {
  pool: string;
  days: number[];
  feesUsd: number[];
  volumeUsd: number[];
  liquidityUsd: number[];
}

export interface ValuationRiskInput {
  feeCollectMode: FeeCollectMode;
  poolAgeDays: number;
  pausableMint: boolean;
  permanentDelegate: boolean;
  liquidityUsd: number;
  topWalletVolumeShare: number;
}

export interface ValuationInput {
  pool: string;
  liquidityShare: number;
  protocolFeeBps: number;
  discountRateAnnual: number;
  horizonDays: number;
  series: PoolDailySeries;
  risk: ValuationRiskInput;
}

export interface Scenario {
  name: "bear" | "base" | "bull";
  lambda: number;
  volumeMultiplier: number;
}

export interface ScenarioValuation {
  scenario: Scenario;
  presentValueUsd: number;
  fairValuePerShareUsd: number;
  paybackDays: number;
}

export interface ValuationResult {
  /// Pinned so a published number can be reproduced later.
  modelVersion: string;
  inputsHash: string;
  pool: string;
  fairValueUsd: number;
  fairValueRangeUsd: { low: number; base: number; high: number };
  fairValuePerShareUsd: number;
  scenarios: ScenarioValuation[];
  riskFlags: RiskFlag[];
  impliedAprAt: (priceUsd: number, horizonDays?: number) => number;
}

export interface VaultSummary {
  address: string;
  pool: string;
  position: string;
  shareMint: string;
  creator: string;
  totalStaked: string;
  totalClaimedA: string;
  totalClaimedB: string;
  createdAt: number;
}

export interface VaultEvent {
  signature: string;
  slot: number;
  blockTime: number | null;
  name: string;
  data: Record<string, string | number>;
}

export interface StatsSummary {
  vaults: number;
  positionsSecuritized: number;
  feesDistributedUsd: number;
  uniqueStakers: number;
  dlmmVolumeUsd: number;
}
