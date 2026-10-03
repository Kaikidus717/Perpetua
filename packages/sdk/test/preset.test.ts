import { describe, expect, it } from "vitest";
import { buildFinanceablePreset, validatePreset } from "../src/dbc/preset.js";

describe("financeable preset", () => {
  it("accepts a spec-compliant distribution", () => {
    const preset = buildFinanceablePreset({
      creatorTradingFeePct: 10,
      creatorLiquidityPct: 40,
      partnerLiquidityPct: 40,
      lockedPct: 20,
    });
    expect(validatePreset(preset).valid).toBe(true);
    expect(preset.migration).toBe("damm_v2");
    expect(preset.feeCollectMode).toBe("quote_only");
    expect(preset.compounding).toBe(false);
  });

  it("requires the distribution to sum to 100", () => {
    const preset = buildFinanceablePreset({
      creatorTradingFeePct: 10,
      creatorLiquidityPct: 40,
      partnerLiquidityPct: 40,
      lockedPct: 10,
    });
    expect(validatePreset(preset).valid).toBe(false);
    expect(validatePreset(preset).errors[0]).toMatch(/sum to 100/);
  });

  it("enforces the minimum permanent-locked share", () => {
    const preset = buildFinanceablePreset({
      creatorTradingFeePct: 10,
      creatorLiquidityPct: 45,
      partnerLiquidityPct: 50,
      lockedPct: 5,
    });
    expect(validatePreset(preset).errors).toContain("at least 10% must be permanently locked");
  });

  it("bounds the creator trading fee", () => {
    const preset = buildFinanceablePreset({
      creatorTradingFeePct: 80,
      creatorLiquidityPct: 40,
      partnerLiquidityPct: 40,
      lockedPct: 20,
    });
    expect(validatePreset(preset).valid).toBe(false);
  });
});
