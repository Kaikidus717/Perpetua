import { describe, expect, it } from "vitest";
import { buildDepthChart, collectFillsAndStake, convictionScore } from "../src/sale/bids.js";

const DAY = 86_400_000;

describe("convictionScore", () => {
  const base = {
    sizeShares: 100_000,
    enteredAtMs: 0,
    nowMs: 0,
    fairValuePerShareUsd: 1,
    bidPriceUsd: 0.9,
  };

  it("is zero for a fresh bid", () => {
    expect(convictionScore(base).score).toBe(0);
  });

  it("grows with time in the pool", () => {
    const day1 = convictionScore({ ...base, nowMs: DAY }).score;
    const day7 = convictionScore({ ...base, nowMs: 7 * DAY }).score;
    expect(day7).toBeGreaterThan(day1);
    expect(day7).toBeLessThanOrEqual(1);
  });

  it("rewards bidding deeper below fair value", () => {
    const shallow = convictionScore({ ...base, nowMs: 7 * DAY, bidPriceUsd: 0.99 }).score;
    const deep = convictionScore({ ...base, nowMs: 7 * DAY, bidPriceUsd: 0.5 }).score;
    expect(deep).toBeGreaterThan(shallow);
  });

  it("gives no depth credit at or above fair value", () => {
    expect(convictionScore({ ...base, nowMs: 7 * DAY, bidPriceUsd: 1.1 }).depthComponent).toBe(0);
    expect(convictionScore({ ...base, nowMs: 7 * DAY, bidPriceUsd: 1.1 }).score).toBe(0);
  });

  it("rewards larger bids on a log scale", () => {
    const small = convictionScore({ ...base, nowMs: 7 * DAY, sizeShares: 1_000 }).score;
    const large = convictionScore({ ...base, nowMs: 7 * DAY, sizeShares: 1_000_000 }).score;
    expect(large).toBeGreaterThan(small);
  });

  it("rejects malformed input", () => {
    expect(() => convictionScore({ ...base, sizeShares: 0 })).toThrow(/sizeShares/);
    expect(() => convictionScore({ ...base, fairValuePerShareUsd: 0 })).toThrow(/fairValue/);
  });
});

describe("buildDepthChart", () => {
  const points = [
    { priceUsd: 1.05, shares: 100, side: "ask" as const },
    { priceUsd: 0.95, shares: 40, side: "bid" as const },
    { priceUsd: 0.9, shares: 60, side: "bid" as const },
    { priceUsd: 1.0, shares: 1, side: "ask" as const },
  ];

  it("orders asks ascending and bids descending", () => {
    const chart = buildDepthChart(points);
    expect(chart.asks.map((ask) => ask.priceUsd)).toEqual([1.0, 1.05]);
    expect(chart.bids.map((bid) => bid.priceUsd)).toEqual([0.95, 0.9]);
  });

  it("accumulates bid depth at or above a price", () => {
    const chart = buildDepthChart(points);
    expect(chart.cumulativeBidSharesAt(0.9)).toBe(100);
    expect(chart.cumulativeBidSharesAt(0.96)).toBe(0);
  });
});

describe("collectFillsAndStake", () => {
  it("cancels only the filled bins and stakes their total", () => {
    const plan = collectFillsAndStake([
      { binId: 1, shares: 10, filled: true },
      { binId: 2, shares: 5, filled: false },
      { binId: 3, shares: 20, filled: true },
    ]);
    expect(plan.cancelBins).toEqual([1, 3]);
    expect(plan.stakeAmount).toBe(30);
  });
});
