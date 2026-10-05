import { describe, expect, it } from "vitest";
import { analyzeCompounding } from "../src/compounding.js";

const base = {
  lpFeePerPeriodUsd: 1000,
  poolLiquidityUsd: 1_000_000,
  positionShare: 0.1,
  compoundingFeeBps: 0,
  periods: 12,
};

describe("analyzeCompounding", () => {
  it("reports the same number when nothing is compounded", () => {
    const result = analyzeCompounding(base);
    expect(result.claimablePerPeriodUsd).toBeCloseTo(100, 9);
    expect(result.growthAdjustedPvUsd).toBeCloseTo(result.claimablePvUsd, 9);
    expect(result.upliftPct).toBeCloseTo(0, 9);
  });

  it("splits a compounding fee into claimable and reinvested", () => {
    const result = analyzeCompounding({ ...base, compoundingFeeBps: 2500 });
    expect(result.claimablePerPeriodUsd).toBeCloseTo(75, 9);
    expect(result.growthAdjustedPvUsd).toBeGreaterThan(result.claimablePvUsd);
    expect(result.upliftPct).toBeGreaterThan(0);
  });

  it("grows the position's share when it compounds and the rest of the pool claims", () => {
    const result = analyzeCompounding({ ...base, compoundingFeeBps: 5000 });
    expect(result.terminalShare).toBeGreaterThan(0.1);
  });

  it("preserves the share exactly when the whole pool compounds at the same rate", () => {
    const result = analyzeCompounding({
      ...base,
      compoundingFeeBps: 5000,
      poolCompoundingRate: 0.5,
    });
    expect(result.terminalShare).toBeCloseTo(0.1, 9);
  });

  it("discounts both floors and upside", () => {
    const flat = analyzeCompounding(base);
    const discounted = analyzeCompounding({ ...base, discountRatePerPeriod: 0.1 });
    expect(discounted.claimablePvUsd).toBeLessThan(flat.claimablePvUsd);
  });

  it("is a no-op uplift when a reinvested dollar is worth nothing", () => {
    const result = analyzeCompounding({ ...base, compoundingFeeBps: 2500, liquidityDiscount: 0 });
    expect(result.growthAdjustedPvUsd).toBeCloseTo(result.claimablePvUsd, 9);
  });

  it("rejects malformed inputs", () => {
    expect(() => analyzeCompounding({ ...base, periods: 0 })).toThrow(/periods/);
    expect(() => analyzeCompounding({ ...base, positionShare: 2 })).toThrow(/positionShare/);
    expect(() => analyzeCompounding({ ...base, poolLiquidityUsd: 0 })).toThrow(/poolLiquidityUsd/);
    expect(() => analyzeCompounding({ ...base, compoundingFeeBps: 20_000 })).toThrow(
      /compoundingFeeBps/,
    );
  });
});
