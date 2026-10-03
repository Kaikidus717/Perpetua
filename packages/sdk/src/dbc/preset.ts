export const MIN_LOCKED_PCT = 10;
export const MAX_CREATOR_TRADING_FEE_PCT = 50;

export interface FinanceablePresetInput {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
}

export interface FinanceablePreset {
  migration: "damm_v2";
  feeCollectMode: "quote_only";
  compounding: false;
  creatorTradingFeePct: number;
  liquidityDistribution: {
    creator: number;
    partner: number;
    locked: number;
  };
}

export interface PresetValidation {
  valid: boolean;
  errors: string[];
}

export function buildFinanceablePreset(input: FinanceablePresetInput): FinanceablePreset {
  return {
    migration: "damm_v2",
    feeCollectMode: "quote_only",
    compounding: false,
    creatorTradingFeePct: input.creatorTradingFeePct,
    liquidityDistribution: {
      creator: input.creatorLiquidityPct,
      partner: input.partnerLiquidityPct,
      locked: input.lockedPct,
    },
  };
}

export function validatePreset(preset: FinanceablePreset): PresetValidation {
  const errors: string[] = [];
  const { creator, partner, locked } = preset.liquidityDistribution;
  const total = creator + partner + locked;

  if (Math.abs(total - 100) > 1e-6)
    errors.push(`liquidity distribution must sum to 100, got ${total}`);
  if (locked < MIN_LOCKED_PCT)
    errors.push(`at least ${MIN_LOCKED_PCT}% must be permanently locked`);
  if (
    preset.creatorTradingFeePct < 0 ||
    preset.creatorTradingFeePct > MAX_CREATOR_TRADING_FEE_PCT
  ) {
    errors.push(`creator trading fee must be within 0-${MAX_CREATOR_TRADING_FEE_PCT}%`);
  }
  for (const [name, value] of Object.entries({ creator, partner, locked })) {
    if (value < 0) errors.push(`${name} liquidity share cannot be negative`);
  }

  return { valid: errors.length === 0, errors };
}
