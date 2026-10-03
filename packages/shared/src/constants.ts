export const PROGRAM_IDS = {
  dammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  dlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  dbc: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  dynamicFeeSharing: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
} as const;

export type ProgramName = keyof typeof PROGRAM_IDS;

export const FEE_PER_SHARE_PRECISION = 10n ** 18n;

export const SHARE_DECIMALS = 6;
export const SHARE_SUPPLY = 1_000_000n * 10n ** BigInt(SHARE_DECIMALS);

export const BPS_DENOMINATOR = 10_000;

export const DEFAULT_PROTOCOL_FEE_BPS = 0;

export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export const MIN_POOL_HISTORY_DAYS = 7;
export const MAX_POOL_HISTORY_DAYS = 30;

export const HORIZON_DAYS = 365;

export const DISCOUNT_RATE_ANNUAL = 0.25;

export const LAMBDA_CLAMP = { min: -0.02, max: 0.15 } as const;
