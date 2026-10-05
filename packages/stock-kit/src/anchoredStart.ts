import type { SessionName } from "@perpetua/valuation";

export interface AnchoredStartInput {
  /// Reference price from the equity feed.
  referencePriceUsd: number;
  /// Half-width of the confidence band, in basis points.
  confidenceBandBps: number;
  /// Extra premium applied to thin names, in basis points.
  thinNamePremiumBps?: number;
  session: SessionName;
  /// Age of the reference price.
  referenceAgeMs: number;
  /// Beyond this age the reference is treated as stale.
  maxReferenceAgeMs?: number;
}

export interface AnchoredStart {
  startPriceUsd: number;
  lowerUsd: number;
  upperUsd: number;
  stale: boolean;
  warnings: string[];
}

/// Anchors the launch price to the reference with a band and a thin-name premium.
/// Table stakes for a stock-quoted launch, not the differentiator.
export function anchoredStart(input: AnchoredStartInput): AnchoredStart {
  const {
    referencePriceUsd,
    confidenceBandBps,
    thinNamePremiumBps = 0,
    session,
    referenceAgeMs,
    maxReferenceAgeMs = 60_000,
  } = input;

  if (referencePriceUsd <= 0) throw new Error("referencePriceUsd must be positive");
  if (confidenceBandBps < 0) throw new Error("confidenceBandBps cannot be negative");

  const warnings: string[] = [];
  const stale = referenceAgeMs > maxReferenceAgeMs;
  if (stale) {
    warnings.push(`reference is ${Math.round(referenceAgeMs / 1000)}s old`);
  }
  if (session === "closed") {
    warnings.push("reference market is closed; the start price is anchored, not live");
  }
  if (thinNamePremiumBps > 0) {
    warnings.push(`thin-name premium of ${thinNamePremiumBps}bps applied`);
  }

  const band = confidenceBandBps / 10_000;
  const premium = thinNamePremiumBps / 10_000;
  const startPriceUsd = referencePriceUsd * (1 + premium);

  return {
    startPriceUsd,
    lowerUsd: referencePriceUsd * (1 - band),
    upperUsd: referencePriceUsd * (1 + band),
    stale,
    warnings,
  };
}
