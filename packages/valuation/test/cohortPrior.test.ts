import { describe, expect, it } from "vitest";
import { blendDecay, cohortPriorFor } from "../src/cohortPrior.js";
import { MODEL_VERSION, inputsHash } from "../src/version.js";

describe("cohortPriorFor", () => {
  it("pulls hardest on brand-new pools", () => {
    expect(cohortPriorFor(2).weight).toBeCloseTo(0.6, 9);
    expect(cohortPriorFor(2).lambda).toBeCloseTo(0.09, 9);
  });

  it("relaxes the prior as the pool ages", () => {
    expect(cohortPriorFor(20).weight).toBeLessThan(cohortPriorFor(2).weight);
    expect(cohortPriorFor(200).weight).toBeLessThan(cohortPriorFor(20).weight);
  });

  it("never returns an empty band", () => {
    expect(cohortPriorFor(Number.MAX_SAFE_INTEGER)).toEqual({ lambda: 0.02, weight: 0.15 });
  });
});

describe("blendDecay", () => {
  it("blends the fitted rate with the prior", () => {
    const blended = blendDecay(0.02, { lambda: 0.09, weight: 0.6 });
    expect(blended).toBeCloseTo(0.02 * 0.4 + 0.09 * 0.6, 9);
  });

  it("returns the fitted rate at weight 0 and the prior at weight 1", () => {
    expect(blendDecay(0.02, { lambda: 0.09, weight: 0 })).toBeCloseTo(0.02, 9);
    expect(blendDecay(0.02, { lambda: 0.09, weight: 1 })).toBeCloseTo(0.09, 9);
  });

  it("clamps an out-of-range weight", () => {
    expect(blendDecay(0.02, { lambda: 0.09, weight: 5 })).toBeCloseTo(0.09, 9);
  });
});

describe("inputsHash", () => {
  it("is stable for the same inputs", () => {
    const input = { pool: "abc", share: 0.1 };
    expect(inputsHash(input)).toBe(inputsHash({ pool: "abc", share: 0.1 }));
  });

  it("ignores key order", () => {
    expect(inputsHash({ a: 1, b: 2 })).toBe(inputsHash({ b: 2, a: 1 }));
  });

  it("changes when a value changes", () => {
    expect(inputsHash({ a: 1 })).not.toBe(inputsHash({ a: 2 }));
  });

  it("exposes a model version", () => {
    expect(MODEL_VERSION).toMatch(/^perpetua-valuation\//);
  });
});
