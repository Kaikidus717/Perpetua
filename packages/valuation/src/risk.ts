import { MIN_POOL_HISTORY_DAYS, type RiskFlag } from "@perpetua/shared";
import type { ValuationRiskInput } from "./types.js";

export const LOW_LIQUIDITY_USD = 50_000;
export const VOLUME_CONCENTRATION_THRESHOLD = 0.5;

export function computeRiskFlags(input: ValuationRiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.feeCollectMode === "compounding") flags.push("compounding_mode");
  if (input.pausableMint) flags.push("pausable_mint");
  if (input.permanentDelegate) flags.push("permanent_delegate");
  if (input.poolAgeDays < MIN_POOL_HISTORY_DAYS) flags.push("pool_too_young");
  if (input.topWalletVolumeShare > VOLUME_CONCENTRATION_THRESHOLD)
    flags.push("volume_concentration");
  if (input.liquidityUsd < LOW_LIQUIDITY_USD) flags.push("low_liquidity");
  return flags;
}
