import { z } from "zod";

export const riskFlagSchema = z.enum([
  "compounding_mode",
  "pausable_mint",
  "permanent_delegate",
  "pool_too_young",
  "volume_concentration",
  "low_liquidity",
]);

export const feeCollectModeSchema = z.enum(["claimable", "compounding"]);

export const poolDailySeriesSchema = z.object({
  pool: z.string().min(32).max(44),
  days: z.array(z.number().int().positive()).min(1),
  feesUsd: z.array(z.number().nonnegative()).min(1),
  volumeUsd: z.array(z.number().nonnegative()).min(1),
  liquidityUsd: z.array(z.number().nonnegative()).min(1),
});

export const valuationRiskInputSchema = z.object({
  feeCollectMode: feeCollectModeSchema,
  poolAgeDays: z.number().int().nonnegative(),
  pausableMint: z.boolean(),
  permanentDelegate: z.boolean(),
  liquidityUsd: z.number().nonnegative(),
  topWalletVolumeShare: z.number().min(0).max(1),
});

export const valuationInputSchema = z.object({
  pool: z.string().min(32).max(44),
  liquidityShare: z.number().gt(0).max(1),
  protocolFeeBps: z.number().int().min(0).max(10_000),
  discountRateAnnual: z.number().min(0).max(5),
  horizonDays: z.number().int().min(1).max(3650),
  series: poolDailySeriesSchema,
  risk: valuationRiskInputSchema,
});

export const saleConfigSchema = z.object({
  fairValuePerShareUsd: z.number().positive(),
  saleFraction: z.number().gt(0).lte(1),
  lowerPct: z.number().min(-1).lt(0),
  upperPct: z.number().gt(0).max(10),
  binStep: z.number().int().min(1).max(400),
  binCount: z.number().int().min(1).max(69),
});

export type SaleConfigInput = z.infer<typeof saleConfigSchema>;
