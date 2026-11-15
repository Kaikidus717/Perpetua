import { describe, expect, it } from "vitest";
import { anchoredStart } from "../src/anchoredStart.js";
import { buildClosedMarketFeeCurve } from "../src/closedMarketFeeCurve.js";

// Sat 2026-10-10 12:00 ET -> Sun 2026-10-11 20:00 ET (the weekend gap).
const SATURDAY_LAUNCH = Date.parse("2026-10-10T16:00:00Z");
const SUNDAY_OPEN = Date.parse("2026-10-12T00:00:00Z");

describe("buildClosedMarketFeeCurve", () => {
  it("decays a cliff into the base fee across the closed window", () => {
    const curve = buildClosedMarketFeeCurve({
      launchTimeMs: SATURDAY_LAUNCH,
      targetBoundaryMs: SUNDAY_OPEN,
      cliffFeeBps: 5_000,
      baseFeeBps: 100,
    });

    expect(curve.durationSeconds).toBe(32 * 3600);
    expect(curve.schedulerParam).toEqual({
      startingFeeBps: 5_000,
      endingFeeBps: 100,
      numberOfPeriod: 32,
      totalDuration: 32 * 3600,
    });
    expect(curve.recommendedLaunchTimeMs).toBe(SATURDAY_LAUNCH);
    expect(curve.warnings).toEqual([]);
  });

  it("flags a launch inside a live session", () => {
    const curve = buildClosedMarketFeeCurve({
      launchTimeMs: Date.parse("2026-10-05T14:00:00Z"), // Mon 10:00 ET
      targetBoundaryMs: Date.parse("2026-10-06T00:00:00Z"),
      cliffFeeBps: 1_000,
      baseFeeBps: 100,
    });
    expect(curve.warnings.some((warning) => warning.includes("live session"))).toBe(true);
  });

  it("warns and recommends an earlier launch when the window is too short", () => {
    const boundary = SATURDAY_LAUNCH + 30 * 60 * 1000;
    const curve = buildClosedMarketFeeCurve({
      launchTimeMs: SATURDAY_LAUNCH,
      targetBoundaryMs: boundary,
      cliffFeeBps: 9_000,
      baseFeeBps: 200,
    });
    expect(curve.warnings.some((warning) => warning.includes("shorter than"))).toBe(true);
    expect(curve.recommendedLaunchTimeMs).toBe(boundary - 2 * 3600 * 1000);
  });

  it("keeps at least one period on a very short window", () => {
    const curve = buildClosedMarketFeeCurve({
      launchTimeMs: SATURDAY_LAUNCH,
      targetBoundaryMs: SATURDAY_LAUNCH + 10 * 60 * 1000,
      cliffFeeBps: 9_000,
      baseFeeBps: 200,
      minWindowSeconds: 60,
    });
    expect(curve.schedulerParam.numberOfPeriod).toBe(1);
  });

  it("rejects an inverted or impossible schedule", () => {
    expect(() =>
      buildClosedMarketFeeCurve({
        launchTimeMs: SATURDAY_LAUNCH,
        targetBoundaryMs: SUNDAY_OPEN,
        cliffFeeBps: 50,
        baseFeeBps: 100,
      }),
    ).toThrow(/cliffFeeBps/);

    expect(() =>
      buildClosedMarketFeeCurve({
        launchTimeMs: SUNDAY_OPEN,
        targetBoundaryMs: SATURDAY_LAUNCH,
        cliffFeeBps: 5_000,
        baseFeeBps: 100,
      }),
    ).toThrow(/after launchTimeMs/);
  });
});

describe("anchoredStart", () => {
  const base = {
    referencePriceUsd: 100,
    confidenceBandBps: 200,
    session: "closed" as const,
    referenceAgeMs: 0,
  };

  it("anchors to the reference with a symmetric band", () => {
    const anchored = anchoredStart(base);
    expect(anchored.startPriceUsd).toBeCloseTo(100, 9);
    expect(anchored.lowerUsd).toBeCloseTo(98, 9);
    expect(anchored.upperUsd).toBeCloseTo(102, 9);
    expect(anchored.stale).toBe(false);
  });

  it("applies a thin-name premium", () => {
    const anchored = anchoredStart({ ...base, thinNamePremiumBps: 500 });
    expect(anchored.startPriceUsd).toBeCloseTo(105, 9);
    expect(anchored.warnings.some((warning) => warning.includes("thin-name"))).toBe(true);
  });

  it("flags a stale reference", () => {
    const anchored = anchoredStart({ ...base, referenceAgeMs: 120_000 });
    expect(anchored.stale).toBe(true);
    expect(anchored.warnings.some((warning) => warning.includes("old"))).toBe(true);
  });

  it("rejects a non-positive reference", () => {
    expect(() => anchoredStart({ ...base, referencePriceUsd: 0 })).toThrow(/referencePriceUsd/);
  });
});
