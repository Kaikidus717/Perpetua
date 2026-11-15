import type { ValuationInput } from "@perpetua/shared";
import { describe, expect, it } from "vitest";
import { valuePosition } from "../src/index.js";

function input(overrides: Partial<ValuationInput> = {}): ValuationInput {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return {
    pool: "PoolAddress111111111111111111111111111111111",
    liquidityShare: 0.05,
    protocolFeeBps: 0,
    discountRateAnnual: 0.25,
    horizonDays: 365,
    series: {
      pool: "PoolAddress111111111111111111111111111111111",
      days,
      feesUsd: days.map((d) => 1200 * Math.exp(-0.04 * d)),
      volumeUsd: days.map(() => 250_000),
      liquidityUsd: days.map(() => 400_000),
    },
    risk: {
      feeCollectMode: "claimable",
      poolAgeDays: 30,
      pausableMint: false,
      permanentDelegate: false,
      liquidityUsd: 400_000,
      topWalletVolumeShare: 0.2,
    },
    ...overrides,
  };
}

describe("valuePosition", () => {
  it("produces an ordered bear/base/bull range", () => {
    const result = valuePosition(input());
    const { low, base, high } = result.fairValueRangeUsd;
    expect(low).toBeLessThanOrEqual(base);
    expect(base).toBeLessThanOrEqual(high);
    expect(base).toBeGreaterThan(0);
  });

  it("returns positive per-share value with a 1e6 token supply", () => {
    const result = valuePosition(input());
    expect(result.fairValuePerShareUsd).toBeCloseTo(result.fairValueUsd / 1_000_000, 12);
  });

  it("flags compounding and risky mints", () => {
    const result = valuePosition(
      input({
        risk: {
          feeCollectMode: "compounding",
          poolAgeDays: 3,
          pausableMint: true,
          permanentDelegate: true,
          liquidityUsd: 1000,
          topWalletVolumeShare: 0.9,
        },
      }),
    );
    expect(result.riskFlags).toEqual(
      expect.arrayContaining([
        "compounding_mode",
        "pausable_mint",
        "permanent_delegate",
        "pool_too_young",
        "volume_concentration",
        "low_liquidity",
      ]),
    );
  });

  it("reports the implied APR for a given offer price", () => {
    const result = valuePosition(input());
    const apr = result.impliedAprAt(10);
    expect(Number.isFinite(apr)).toBe(true);
    expect(apr).toBeGreaterThan(0);
  });

  it("reports a plausible implied APR at fair value, not a share-supply-multiplied one", () => {
    const result = valuePosition(input());
    const apr = result.impliedAprAt(result.fairValuePerShareUsd);
    expect(Number.isFinite(apr)).toBe(true);
    expect(apr).toBeGreaterThan(0);
    // The per-share/per-position mix-up reported ~104,579,020% for this shape of position. A real
    // answer is a plain percentage, so anything above 1000% means the share supply slipped again.
    expect(apr).toBeLessThan(10);
  });

  it("scales the implied APR inversely with the price paid", () => {
    const result = valuePosition(input());
    const price = result.fairValuePerShareUsd;
    expect(result.impliedAprAt(price * 2)).toBeCloseTo(result.impliedAprAt(price) / 2, 9);
  });

  it("prices a bull case above the base case", () => {
    const result = valuePosition(input());
    const bear = result.scenarios.find((s) => s.scenario.name === "bear");
    const bull = result.scenarios.find((s) => s.scenario.name === "bull");
    expect(bear).toBeDefined();
    expect(bull).toBeDefined();
    if (!bear || !bull) return;
    expect(bull.presentValueUsd).toBeGreaterThan(bear.presentValueUsd);
  });
});
