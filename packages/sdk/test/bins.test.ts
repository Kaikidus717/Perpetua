import { describe, expect, it } from "vitest";
import { binIdForPrice, ladderToBinRange } from "../src/sale/bins.js";
import { buildLadder } from "../src/sale/ladder.js";

describe("binIdForPrice", () => {
  it("returns bin 0 for a price at the 1.0 reference", () => {
    expect(binIdForPrice(1, 25)).toBe(0);
  });

  it("grows with price and stays monotonic", () => {
    const low = binIdForPrice(1, 25);
    const mid = binIdForPrice(1.1, 25);
    const high = binIdForPrice(2, 25);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("uses a finer grid for smaller bin steps", () => {
    expect(binIdForPrice(1.1, 1)).toBeGreaterThan(binIdForPrice(1.1, 100));
  });

  it("rejects invalid input", () => {
    expect(() => binIdForPrice(0, 25)).toThrow();
    expect(() => binIdForPrice(1, 0)).toThrow();
  });
});

describe("ladderToBinRange", () => {
  it("maps the plan range onto an ordered bin range", () => {
    const plan = buildLadder({
      fairValuePerShareUsd: 0.03,
      totalShares: 1_000_000,
      saleFraction: 0.6,
      lowerPct: -0.05,
      upperPct: 0.25,
      binStep: 20,
      binCount: 20,
    });
    const range = ladderToBinRange(plan, 20);
    expect(range.maxBinId).toBeGreaterThan(range.minBinId);
  });
});
