export interface CrankDecision {
  crank: boolean;
  reason: string;
}

export function shouldCrank(claimableBaseUnits: bigint, thresholdBaseUnits: bigint): CrankDecision {
  if (thresholdBaseUnits <= 0n) return { crank: true, reason: "threshold disabled" };
  if (claimableBaseUnits < thresholdBaseUnits) {
    return {
      crank: false,
      reason: `claimable ${claimableBaseUnits} below threshold ${thresholdBaseUnits}`,
    };
  }
  return {
    crank: true,
    reason: `claimable ${claimableBaseUnits} reached threshold ${thresholdBaseUnits}`,
  };
}
