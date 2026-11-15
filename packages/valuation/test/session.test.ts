import { describe, expect, it } from "vitest";
import {
  easternTime,
  hoursUntilOpen,
  isReferenceLive,
  sessionAt,
  splitFeesBySession,
} from "../src/session.js";

// October 2026 is EDT (UTC-4), so ET = UTC - 4.
const at = (iso: string) => new Date(iso);

describe("easternTime", () => {
  it("converts UTC into Eastern wall clock and weekday", () => {
    const parts = easternTime(at("2026-10-05T14:00:00Z"));
    expect(parts.weekday).toBe(1); // Monday
    expect(parts.minutes).toBe(10 * 60);
    expect(parts.dateKey).toBe("2026-10-05");
  });
});

describe("sessionAt", () => {
  it("labels a weekday regular session", () => {
    expect(sessionAt(at("2026-10-05T14:00:00Z"))).toBe("regular");
  });

  it("labels pre-market, post-market and overnight", () => {
    expect(sessionAt(at("2026-10-05T09:00:00Z"))).toBe("pre"); // 05:00 ET
    expect(sessionAt(at("2026-10-05T05:00:00Z"))).toBe("overnight"); // 01:00 ET
    expect(sessionAt(at("2026-10-12T20:00:00Z"))).toBe("post"); // 16:00 ET
    expect(sessionAt(at("2026-10-13T00:00:00Z"))).toBe("overnight"); // 20:00 ET
  });

  it("closes Friday night through Sunday evening", () => {
    expect(sessionAt(at("2026-10-10T01:00:00Z"))).toBe("closed"); // Fri 21:00 ET
    expect(sessionAt(at("2026-10-10T16:00:00Z"))).toBe("closed"); // Sat 12:00 ET
    expect(sessionAt(at("2026-10-11T16:00:00Z"))).toBe("closed"); // Sun 12:00 ET
    expect(sessionAt(at("2026-10-12T01:00:00Z"))).toBe("overnight"); // Sun 21:00 ET
  });

  it("respects the holiday set", () => {
    const holidays = new Set(["2026-10-05"]);
    expect(sessionAt(at("2026-10-05T14:00:00Z"), holidays)).toBe("closed");
  });
});

describe("hoursUntilOpen", () => {
  it("is zero while the reference is live", () => {
    expect(hoursUntilOpen(at("2026-10-05T14:00:00Z"))).toBe(0);
  });

  it("measures the Friday-night weekend gap", () => {
    expect(hoursUntilOpen(at("2026-10-10T01:00:00Z"))).toBeCloseTo(47, 0); // Fri 21:00 ET -> Sun 20:00
  });

  it("measures a Saturday gap", () => {
    expect(hoursUntilOpen(at("2026-10-10T16:00:00Z"))).toBeCloseTo(32, 0); // Sat 12:00 ET -> Sun 20:00
  });
});

describe("splitFeesBySession", () => {
  it("buckets samples into sessions", () => {
    const split = splitFeesBySession([
      { at: at("2026-10-05T09:00:00Z"), feesUsd: 10 }, // pre
      { at: at("2026-10-05T14:00:00Z"), feesUsd: 100 }, // regular
      { at: at("2026-10-05T14:30:00Z"), feesUsd: 50 }, // regular
      { at: at("2026-10-05T20:00:00Z"), feesUsd: 20 }, // post
      { at: at("2026-10-05T05:00:00Z"), feesUsd: 5 }, // overnight
      { at: at("2026-10-10T16:00:00Z"), feesUsd: 1 }, // closed
    ]);
    expect(split.pre).toBe(10);
    expect(split.regular).toBe(150);
    expect(split.post).toBe(20);
    expect(split.overnight).toBe(5);
    expect(split.closed).toBe(1);
  });
});

describe("isReferenceLive", () => {
  it("is false outside market hours", () => {
    expect(isReferenceLive(at("2026-10-10T16:00:00Z"))).toBe(false);
    expect(isReferenceLive(at("2026-10-05T14:00:00Z"))).toBe(true);
  });
});
