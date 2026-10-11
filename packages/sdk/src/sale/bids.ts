export interface BidInput {
  sizeShares: number;
  enteredAtMs: number;
  nowMs: number;
  fairValuePerShareUsd: number;
  bidPriceUsd: number;
}

export interface ConvictionScore {
  score: number;
  sizeComponent: number;
  timeComponent: number;
  depthComponent: number;
}

export interface ConvictionOptions {
  /// Hours for the time component to reach ~63% (1 - 1/e).
  halfLifeHours?: number;
  /// Bid size, in shares, that saturates the size component.
  sizeScaleShares?: number;
}

const HOUR_MS = 3_600_000;

/// Conviction = size * time_in_pool * depth_below_fair_value.
/// Each component is normalised to (0, 1] so the product stays comparable across bids.
export function convictionScore(input: BidInput, options: ConvictionOptions = {}): ConvictionScore {
  const { halfLifeHours = 72, sizeScaleShares = 1_000_000 } = options;

  if (input.fairValuePerShareUsd <= 0) throw new Error("fairValuePerShareUsd must be positive");
  if (input.sizeShares <= 0) throw new Error("sizeShares must be positive");

  const ageHours = Math.max(0, (input.nowMs - input.enteredAtMs) / HOUR_MS);
  const timeComponent = 1 - Math.exp(-ageHours / halfLifeHours);

  const sizeComponent = Math.min(
    1,
    Math.log10(1 + input.sizeShares) / Math.log10(1 + sizeScaleShares),
  );
  const size = Math.max(0, sizeComponent);

  const depthRaw = (input.fairValuePerShareUsd - input.bidPriceUsd) / input.fairValuePerShareUsd;
  const depthComponent = Math.min(1, Math.max(0, depthRaw));

  return {
    score: size * timeComponent * depthComponent,
    sizeComponent: size,
    timeComponent,
    depthComponent,
  };
}

export interface DepthPoint {
  priceUsd: number;
  shares: number;
  side: "ask" | "bid";
}

export interface DepthChart {
  asks: DepthPoint[];
  bids: DepthPoint[];
  cumulativeBidSharesAt: (priceUsd: number) => number;
}

/// Assembles the "conviction wall" from asks (sale ladder) and bids (limit orders or LP bids).
export function buildDepthChart(points: DepthPoint[]): DepthChart {
  const asks = points
    .filter((point) => point.side === "ask")
    .sort((a, b) => a.priceUsd - b.priceUsd);
  const bids = points
    .filter((point) => point.side === "bid")
    .sort((a, b) => b.priceUsd - a.priceUsd);

  return {
    asks,
    bids,
    cumulativeBidSharesAt: (priceUsd: number) =>
      bids.filter((bid) => bid.priceUsd >= priceUsd).reduce((sum, bid) => sum + bid.shares, 0),
  };
}

/// A filled limit-order bid can be rolled into a stake in one action.
export interface CollectFillsPlan {
  cancelBins: number[];
  stakeAmount: number;
}

export function collectFillsAndStake(
  filledBins: Array<{ binId: number; shares: number; filled: boolean }>,
): CollectFillsPlan {
  const filled = filledBins.filter((bin) => bin.filled);
  return {
    cancelBins: filled.map((bin) => bin.binId),
    stakeAmount: filled.reduce((sum, bin) => sum + bin.shares, 0),
  };
}
