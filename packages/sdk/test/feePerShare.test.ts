import { describe, expect, it } from "vitest";
import { accrue, pending } from "../src/math/feePerShare.js";

const PRECISION = 10n ** 18n;

describe("accrue", () => {
  it("splits fees pro-rata across stakers", () => {
    const state = {
      totalStaked: 100n,
      accFeePerShareA: 0n,
      accFeePerShareB: 0n,
      carryA: 0n,
      carryB: 0n,
    };
    const next = accrue(state, { deltaA: 100n, deltaB: 0n }, PRECISION);
    expect(pending(25n, next.accFeePerShareA, 0n, PRECISION)).toBe(25n);
    expect(pending(100n, next.accFeePerShareA, 0n, PRECISION)).toBe(100n);
  });

  it("banks fees in carry when nobody is staked", () => {
    const state = {
      totalStaked: 0n,
      accFeePerShareA: 0n,
      accFeePerShareB: 0n,
      carryA: 0n,
      carryB: 0n,
    };
    const next = accrue(state, { deltaA: 100n, deltaB: 5n }, PRECISION);
    expect(next.carryA).toBe(100n);
    expect(next.carryB).toBe(5n);
    expect(next.accFeePerShareA).toBe(0n);
  });

  it("releases carry to the first staker", () => {
    const banked = accrue(
      { totalStaked: 0n, accFeePerShareA: 0n, accFeePerShareB: 0n, carryA: 100n, carryB: 0n },
      { deltaA: 0n, deltaB: 0n },
      PRECISION,
    );
    const withStake = accrue(
      { ...banked, totalStaked: 10n },
      { deltaA: 0n, deltaB: 0n },
      PRECISION,
    );
    expect(pending(10n, withStake.accFeePerShareA, 0n, PRECISION)).toBe(100n);
  });

  it("never pays a claimer more than was deposited", () => {
    const state = {
      totalStaked: 3n,
      accFeePerShareA: 0n,
      accFeePerShareB: 0n,
      carryA: 0n,
      carryB: 0n,
    };
    const next = accrue(state, { deltaA: 10n, deltaB: 0n }, PRECISION);
    let paid = 0n;
    for (let i = 0; i < 3; i += 1) paid += pending(1n, next.accFeePerShareA, 0n, PRECISION);
    expect(paid).toBeLessThanOrEqual(10n);
    expect(paid).toBeGreaterThanOrEqual(9n);
  });
});
