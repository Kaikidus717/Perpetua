import { BPS_DENOMINATOR } from "@perpetua/shared";

export interface CompoundingInput {
  /// Gross LP fee accruing to the whole pool in the first period.
  lpFeePerPeriodUsd: number;
  /// Total pool liquidity value. Keeps the fee and the liquidity in the same units.
  poolLiquidityUsd: number;
  /// Position liquidity as a fraction of pool liquidity at the start.
  positionShare: number;
  /// This position's compounding share, in basis points.
  compoundingFeeBps: number;
  /// The compounding rate of *the rest of the pool*, 0-1. Zero means every other LP claims,
  /// which is what lets this position's share grow.
  poolCompoundingRate?: number;
  periods: number;
  /// External pool growth per period, e.g. 0.02 for 2%.
  poolGrowthPerPeriod?: number;
  /// Discount rate per period.
  discountRatePerPeriod?: number;
  /// How much a reinvested dollar is worth versus a claimable dollar. 1 = par.
  liquidityDiscount?: number;
  /// Fees decay per period, e.g. 0.03 for 3%.
  decayPerPeriod?: number;
}

export interface CompoundingResult {
  /// Present value of what the holder can actually withdraw. The floor.
  claimablePvUsd: number;
  /// Present value counting reinvested fees too, with the position's share drifting up.
  growthAdjustedPvUsd: number;
  upliftPct: number;
  claimablePerPeriodUsd: number;
  terminalShare: number;
}

/// Claimable vs. compounding. `claimablePvUsd` is the floor because reinvested fees are
/// illiquid and can be diluted; `growthAdjustedPvUsd` is the upside because reinvestment
/// grows the position's ownership of the pool.
export function analyzeCompounding(input: CompoundingInput): CompoundingResult {
  const {
    lpFeePerPeriodUsd,
    poolLiquidityUsd,
    positionShare,
    compoundingFeeBps,
    poolCompoundingRate = 0,
    periods,
    poolGrowthPerPeriod = 0,
    discountRatePerPeriod = 0,
    liquidityDiscount = 1,
    decayPerPeriod = 0,
  } = input;

  if (periods <= 0) throw new Error("periods must be positive");
  if (positionShare <= 0 || positionShare > 1) throw new Error("positionShare must be in (0, 1]");
  if (poolLiquidityUsd <= 0) throw new Error("poolLiquidityUsd must be positive");

  const compounding = compoundingFeeBps / BPS_DENOMINATOR;
  if (compounding < 0 || compounding > 1)
    throw new Error("compoundingFeeBps must be within 0-10000");
  if (poolCompoundingRate < 0 || poolCompoundingRate > 1) {
    throw new Error("poolCompoundingRate must be within 0-1");
  }

  let positionLiquidity = poolLiquidityUsd * positionShare;
  let poolLiquidity = poolLiquidityUsd;
  let claimablePv = 0;
  let growthPv = 0;
  let fee = lpFeePerPeriodUsd;
  let firstClaimable = 0;

  for (let period = 1; period <= periods; period += 1) {
    const share = positionLiquidity / poolLiquidity;
    const claim = fee * share; // the position's gross claim on this period's fees
    const claimable = claim * (1 - compounding);
    const reinvested = claim * compounding;
    // Every other LP reinvests at *their* rate. If they all compound exactly as we do, the
    // share is preserved; if they claim while we compound, our share grows.
    const othersReinvested = (fee - claim) * poolCompoundingRate;
    const discount = (1 + discountRatePerPeriod) ** period;

    if (period === 1) firstClaimable = claimable;
    claimablePv += claimable / discount;
    growthPv += (claimable + reinvested * liquidityDiscount) / discount;

    positionLiquidity += reinvested;
    poolLiquidity += reinvested + othersReinvested + poolGrowthPerPeriod * poolLiquidity;
    fee *= 1 - decayPerPeriod;
  }

  return {
    claimablePvUsd: claimablePv,
    growthAdjustedPvUsd: growthPv,
    upliftPct: claimablePv === 0 ? 0 : (growthPv / claimablePv - 1) * 100,
    claimablePerPeriodUsd: firstClaimable,
    terminalShare: positionLiquidity / poolLiquidity,
  };
}
