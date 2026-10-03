export interface LadderInput {
  fairValuePerShareUsd: number;
  totalShares: number;
  saleFraction: number;
  lowerPct: number;
  upperPct: number;
  binStep: number;
  binCount: number;
}

export interface LadderBin {
  index: number;
  priceUsd: number;
  shares: number;
}

export interface LadderPlan {
  bins: LadderBin[];
  rangeLowUsd: number;
  rangeHighUsd: number;
  totalOfferShares: number;
  weightedAveragePriceUsd: number;
}

export function buildLadder(input: LadderInput): LadderPlan {
  const { fairValuePerShareUsd, totalShares, saleFraction, lowerPct, upperPct, binStep, binCount } =
    input;

  if (fairValuePerShareUsd <= 0) throw new Error("fairValuePerShareUsd must be positive");
  if (saleFraction <= 0 || saleFraction > 1) throw new Error("saleFraction must be in (0, 1]");
  if (lowerPct >= 0) throw new Error("lowerPct must be negative");
  if (upperPct <= 0) throw new Error("upperPct must be positive");
  if (binCount < 1) throw new Error("binCount must be at least 1");
  if (binStep < 1) throw new Error("binStep must be at least 1");

  const rangeLowUsd = fairValuePerShareUsd * (1 + lowerPct);
  const rangeHighUsd = fairValuePerShareUsd * (1 + upperPct);
  const totalOfferShares = totalShares * saleFraction;

  const ratio = (rangeHighUsd / rangeLowUsd) ** (1 / binCount);
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < binCount; i += 1) {
    const weight = binCount - i;
    weights.push(weight);
    weightSum += weight;
  }

  const bins: LadderBin[] = [];
  let weightedPriceTotal = 0;
  for (let i = 0; i < binCount; i += 1) {
    const priceUsd = rangeLowUsd * ratio ** i;
    const shares = (totalOfferShares * (weights[i] ?? 0)) / weightSum;
    weightedPriceTotal += priceUsd * shares;
    bins.push({ index: i, priceUsd, shares });
  }

  return {
    bins,
    rangeLowUsd,
    rangeHighUsd,
    totalOfferShares,
    weightedAveragePriceUsd: weightedPriceTotal / totalOfferShares,
  };
}
