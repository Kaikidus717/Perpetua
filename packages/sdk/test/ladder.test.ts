import { describe, expect, it } from "vitest";
import { buildLadder } from "../src/sale/ladder.js";

const base = {
  fairValuePerShareUsd: 1,
  totalShares: 1_000_000,
  saleFraction: 0.6,
  lowerPct: -0.05,
  upperPct: 0.25,
  binStep: 20,
  binCount: 20,
};

describe("buildLadder", () => {
  it("offers the requested fraction of supply", () => {
    const plan = buildLadder(base);
    const total = plan.bins.reduce((sum, bin) => sum + bin.shares, 0);
    expect(total).toBeCloseTo(600_000, 6);
    expect(plan.totalOfferShares).toBeCloseTo(600_000, 6);
  });

  it("spans the configured price range", () => {
    const plan = buildLadder(base);
    expect(plan.rangeLowUsd).toBeCloseTo(0.95, 9);
    expect(plan.rangeHighUsd).toBeCloseTo(1.25, 9);
    expect(plan.bins[0]?.priceUsd).toBeCloseTo(0.95, 9);
  });

  it("front-weights the ask ladder, so the average fill is above the midpoint", () => {
    const plan = buildLadder(base);
    const first = plan.bins[0]?.shares ?? 0;
    const last = plan.bins.at(-1)?.shares ?? 0;
    expect(first).toBeGreaterThan(last);
    expect(plan.weightedAveragePriceUsd).toBeGreaterThan(1);
  });

  it("rejects malformed inputs", () => {
    expect(() => buildLadder({ ...base, lowerPct: 0.05 })).toThrow();
    expect(() => buildLadder({ ...base, upperPct: 0 })).toThrow();
    expect(() => buildLadder({ ...base, saleFraction: 0 })).toThrow();
  });
});
