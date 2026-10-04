import type { LadderPlan } from "./ladder.js";

/// Mirrors DLMM's bin-id derivation: `floor(ln(price) / ln(1 + binStep / 10_000))`.
export function binIdForPrice(price: number, binStep: number): number {
  if (price <= 0) throw new Error("price must be positive");
  if (binStep < 1) throw new Error("binStep must be at least 1");
  return Math.floor(Math.log(price) / Math.log(1 + binStep / 10_000));
}

export interface BinRange {
  minBinId: number;
  maxBinId: number;
}

export function ladderToBinRange(plan: LadderPlan, binStep: number): BinRange {
  const minBinId = binIdForPrice(plan.rangeLowUsd, binStep);
  const maxBinId = Math.max(binIdForPrice(plan.rangeHighUsd, binStep), minBinId + 1);
  return { minBinId, maxBinId };
}
