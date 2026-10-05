export interface CohortPrior {
  /// Prior daily decay rate for pools in this age band.
  lambda: number;
  /// How much the prior pulls on the fitted rate, 0-1.
  weight: number;
}

interface Band {
  maxAgeDays: number;
  lambda: number;
  weight: number;
}

// Young pools decay faster: the early fee spike is hype, not earnings. The prior is blended
// with the fitted rate so a short or noisy series cannot overstate the stream.
const BANDS: Band[] = [
  { maxAgeDays: 7, lambda: 0.09, weight: 0.6 },
  { maxAgeDays: 30, lambda: 0.06, weight: 0.4 },
  { maxAgeDays: 90, lambda: 0.035, weight: 0.25 },
  { maxAgeDays: Number.POSITIVE_INFINITY, lambda: 0.02, weight: 0.15 },
];

export function cohortPriorFor(poolAgeDays: number): CohortPrior {
  const band = BANDS.find((entry) => poolAgeDays <= entry.maxAgeDays) ?? BANDS[BANDS.length - 1];
  if (!band) return { lambda: 0.02, weight: 0.15 };
  return { lambda: band.lambda, weight: band.weight };
}

export function blendDecay(fitted: number, prior: CohortPrior): number {
  const weight = Math.min(Math.max(prior.weight, 0), 1);
  return fitted * (1 - weight) + prior.lambda * weight;
}
