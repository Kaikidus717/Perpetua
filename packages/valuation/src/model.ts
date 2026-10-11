import { BPS_DENOMINATOR, LAMBDA_CLAMP } from "@perpetua/shared";
import type { DecayFit, PresentValueOptions, ProjectionOptions } from "./types.js";

const EPSILON = 1e-9;

interface Point {
  x: number;
  y: number;
  w: number;
}

function weightedLinearFit(points: Point[]): { slope: number; intercept: number; r2: number } {
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  for (const p of points) {
    sumW += p.w;
    sumWX += p.w * p.x;
    sumWY += p.w * p.y;
  }
  if (sumW === 0) return { slope: 0, intercept: 0, r2: 0 };

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += p.w * dx * dx;
    sxy += p.w * dx * dy;
    syy += p.w * dy * dy;
  }

  if (sxx === 0) return { slope: 0, intercept: meanY, r2: 0 };

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function estimateDecay(feesUsd: number[]): DecayFit {
  const positives = feesUsd.filter((f) => f > EPSILON);
  if (feesUsd.length < 2 || positives.length < 2) {
    return { lambda: 0, intercept: 0, r2: 0, samples: feesUsd.length };
  }

  const floor = Math.min(...positives) * 0.5;
  const points: Point[] = feesUsd.map((fee, index) => ({
    x: index,
    y: Math.log(Math.max(fee, floor, EPSILON)),
    w: index + 1,
  }));

  const { slope, intercept, r2 } = weightedLinearFit(points);
  return {
    lambda: clamp(-slope, LAMBDA_CLAMP.min, LAMBDA_CLAMP.max),
    intercept,
    r2,
    samples: feesUsd.length,
  };
}

export function projectFees(options: ProjectionOptions): number[] {
  const { lastFeeUsd, lambda, horizonDays, floorUsd } = options;
  const series: number[] = [];
  for (let t = 1; t <= horizonDays; t += 1) {
    const decayed = lastFeeUsd * Math.exp(-lambda * t);
    series.push(Math.max(decayed, floorUsd));
  }
  return series;
}

/// The share of pool fees a holder actually keeps, after the protocol skim. Every money figure has
/// to use this, or payback and present value disagree the moment `protocolFeeBps > 0`.
export function netLiquidityShare(liquidityShare: number, protocolFeeBps: number): number {
  return liquidityShare * (1 - protocolFeeBps / BPS_DENOMINATOR);
}

export function presentValue(projectedFeesUsd: number[], options: PresentValueOptions): number {
  const { liquidityShare, protocolFeeBps, discountRateAnnual, horizonDays } = options;
  const netShare = netLiquidityShare(liquidityShare, protocolFeeBps);
  let total = 0;
  for (let t = 1; t <= horizonDays; t += 1) {
    const fee = projectedFeesUsd[t - 1];
    if (fee === undefined) break;
    const discount = (1 + discountRateAnnual) ** (t / 365);
    total += (netShare * fee) / discount;
  }
  return total;
}

export function paybackDays(
  projectedFeesUsd: number[],
  liquidityShare: number,
  targetUsd: number,
): number {
  if (targetUsd <= 0) return 0;
  let cumulative = 0;
  for (let t = 1; t <= projectedFeesUsd.length; t += 1) {
    const fee = projectedFeesUsd[t - 1];
    if (fee === undefined) break;
    cumulative += liquidityShare * fee;
    if (cumulative >= targetUsd) return t;
  }
  return projectedFeesUsd.length;
}

/// Implied annual return, as a fraction. Both arguments are **per share**: what one share earns in a
/// year, and what that share costs.
///
/// Passing position-wide fees against a per-share price overstates the rate by the share supply —
/// at the default 1,000,000 shares that is a 1,000,000x error, e.g. 104.6% rendered as 104,579,020%.
export function impliedApr(annualFeesPerShareUsd: number, pricePerShareUsd: number): number {
  if (pricePerShareUsd <= 0) return Number.POSITIVE_INFINITY;
  return annualFeesPerShareUsd / pricePerShareUsd;
}
