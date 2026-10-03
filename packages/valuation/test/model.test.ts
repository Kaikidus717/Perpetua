import { describe, expect, it } from "vitest";
import { estimateDecay, impliedApr, paybackDays, presentValue, projectFees } from "../src/model.js";

function exponentialSeries(start: number, lambda: number, days: number): number[] {
  return Array.from({ length: days }, (_, i) => start * Math.exp(-lambda * i));
}

describe("estimateDecay", () => {
  it("recovers the true decay rate of a synthetic exponential series", () => {
    const fit = estimateDecay(exponentialSeries(1000, 0.05, 30));
    expect(fit.lambda).toBeCloseTo(0.05, 6);
    expect(fit.r2).toBeCloseTo(1, 6);
  });

  it("returns zero decay when fees are flat", () => {
    const fit = estimateDecay(Array.from({ length: 10 }, () => 500));
    expect(fit.lambda).toBeCloseTo(0, 9);
  });

  it("clamps aggressive log-slopes to the configured band", () => {
    const fit = estimateDecay(exponentialSeries(1_000_000, 2, 20));
    expect(fit.lambda).toBeLessThanOrEqual(0.15);
  });

  it("is safe with fewer than two samples", () => {
    expect(estimateDecay([100]).lambda).toBe(0);
    expect(estimateDecay([]).lambda).toBe(0);
  });
});

describe("projectFees", () => {
  it("respects the floor and horizon", () => {
    const series = projectFees({ lastFeeUsd: 100, lambda: 0.1, horizonDays: 10, floorUsd: 5 });
    expect(series).toHaveLength(10);
    expect(Math.min(...series)).toBeGreaterThanOrEqual(5);
    expect(series[0]).toBeCloseTo(100 * Math.exp(-0.1), 6);
  });
});

describe("presentValue", () => {
  it("decreases as the discount rate rises", () => {
    const projected = projectFees({
      lastFeeUsd: 100,
      lambda: 0.02,
      horizonDays: 365,
      floorUsd: 0.1,
    });
    const low = presentValue(projected, {
      liquidityShare: 1,
      protocolFeeBps: 0,
      discountRateAnnual: 0.1,
      horizonDays: 365,
    });
    const high = presentValue(projected, {
      liquidityShare: 1,
      protocolFeeBps: 0,
      discountRateAnnual: 0.5,
      horizonDays: 365,
    });
    expect(low).toBeGreaterThan(high);
  });

  it("scales linearly with the liquidity share", () => {
    const projected = Array.from({ length: 100 }, () => 10);
    const full = presentValue(projected, {
      liquidityShare: 1,
      protocolFeeBps: 0,
      discountRateAnnual: 0.25,
      horizonDays: 100,
    });
    const half = presentValue(projected, {
      liquidityShare: 0.5,
      protocolFeeBps: 0,
      discountRateAnnual: 0.25,
      horizonDays: 100,
    });
    expect(half).toBeCloseTo(full / 2, 9);
  });
});

describe("paybackDays", () => {
  it("returns the first day cumulative fees cover the target", () => {
    const projected = Array.from({ length: 30 }, () => 10);
    expect(paybackDays(projected, 1, 50)).toBe(5);
  });

  it("caps at the horizon when the target is never reached", () => {
    const projected = Array.from({ length: 30 }, () => 1);
    expect(paybackDays(projected, 1, 1000)).toBe(30);
  });
});

describe("impliedApr", () => {
  it("is annual fees divided by price", () => {
    expect(impliedApr(365, 1, 100)).toBeCloseTo(3.65, 9);
  });
});
