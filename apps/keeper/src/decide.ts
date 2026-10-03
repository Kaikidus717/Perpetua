export interface CrankDecision {
  crank: boolean;
  reason: string;
}

export function shouldCrank(claimableUsd: number, thresholdUsd: number): CrankDecision {
  if (thresholdUsd <= 0) return { crank: true, reason: "threshold disabled" };
  if (claimableUsd < thresholdUsd) {
    return {
      crank: false,
      reason: `claimable ${claimableUsd.toFixed(2)} below threshold ${thresholdUsd}`,
    };
  }
  return {
    crank: true,
    reason: `claimable ${claimableUsd.toFixed(2)} reached threshold ${thresholdUsd}`,
  };
}
