export interface AccrualState {
  totalStaked: bigint;
  accFeePerShareA: bigint;
  accFeePerShareB: bigint;
  carryA: bigint;
  carryB: bigint;
}

export interface AccrualDelta {
  deltaA: bigint;
  deltaB: bigint;
}

export function accrue(state: AccrualState, delta: AccrualDelta, precision: bigint): AccrualState {
  if (state.totalStaked === 0n) {
    return {
      ...state,
      carryA: state.carryA + delta.deltaA,
      carryB: state.carryB + delta.deltaB,
    };
  }
  const total = state.totalStaked;
  return {
    totalStaked: total,
    accFeePerShareA: state.accFeePerShareA + ((delta.deltaA + state.carryA) * precision) / total,
    accFeePerShareB: state.accFeePerShareB + ((delta.deltaB + state.carryB) * precision) / total,
    carryA: 0n,
    carryB: 0n,
  };
}

export function pending(
  amount: bigint,
  accFeePerShare: bigint,
  debt: bigint,
  precision: bigint,
): bigint {
  if (amount === 0n || accFeePerShare <= debt) return 0n;
  return (amount * (accFeePerShare - debt)) / precision;
}
