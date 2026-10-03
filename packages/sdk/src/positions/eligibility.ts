export interface PositionLiquidity {
  unlocked: bigint;
  vested: bigint;
  permanentLocked: bigint;
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
}

export function evaluateEligibility(liquidity: PositionLiquidity): Eligibility {
  const reasons: string[] = [];
  if (liquidity.permanentLocked <= 0n) reasons.push("position has no permanent-locked liquidity");
  if (liquidity.unlocked > 0n) reasons.push("position has unlocked liquidity, split it first");
  if (liquidity.vested > 0n) reasons.push("position has vested liquidity, split it first");
  return { eligible: reasons.length === 0, reasons };
}
