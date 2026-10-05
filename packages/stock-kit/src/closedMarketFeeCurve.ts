import { hoursUntilOpen, isReferenceLive } from "@perpetua/valuation";

export interface ClosedMarketFeeCurveInput {
  /// When the pool is created.
  launchTimeMs: number;
  /// When the reference market reopens.
  targetBoundaryMs: number;
  /// Fee charged at launch, while there is no reference price. Should be high.
  cliffFeeBps: number;
  /// Fee the schedule decays to at the boundary.
  baseFeeBps: number;
  mode?: "linear" | "exponential";
  /// Refuse to schedule a decay shorter than this.
  minWindowSeconds?: number;
  holidays?: ReadonlySet<string>;
}

/// DBC fee-scheduler fields. VERIFY these names against the deployed DBC IDL before mainnet.
export interface FeeSchedulerParam {
  startingFeeBps: number;
  endingFeeBps: number;
  numberOfPeriod: number;
  totalDuration: number;
}

export interface ClosedMarketFeeCurve {
  mode: "linear" | "exponential";
  schedulerParam: FeeSchedulerParam;
  durationSeconds: number;
  recommendedLaunchTimeMs: number;
  warnings: string[];
}

const HOUR_SECONDS = 3600;
const DEFAULT_MIN_WINDOW_SECONDS = 2 * HOUR_SECONDS;

/// The distinct mechanic from 10B: with no reference price the pool is a price-discovery
/// venue for arbitrageurs, so the fee starts at a cliff and decays to the base fee exactly
/// as the reference market reopens.
export function buildClosedMarketFeeCurve(input: ClosedMarketFeeCurveInput): ClosedMarketFeeCurve {
  const {
    launchTimeMs,
    targetBoundaryMs,
    cliffFeeBps,
    baseFeeBps,
    mode = "linear",
    minWindowSeconds = DEFAULT_MIN_WINDOW_SECONDS,
    holidays = new Set<string>(),
  } = input;

  const warnings: string[] = [];

  if (cliffFeeBps < baseFeeBps) {
    throw new Error("cliffFeeBps must be at least baseFeeBps");
  }
  if (targetBoundaryMs <= launchTimeMs) {
    throw new Error("targetBoundaryMs must be after launchTimeMs");
  }

  const durationSeconds = Math.floor((targetBoundaryMs - launchTimeMs) / 1000);
  if (durationSeconds < minWindowSeconds) {
    warnings.push(
      `window is ${Math.round(durationSeconds / 60)}m, shorter than the ${Math.round(minWindowSeconds / 60)}m minimum`,
    );
  }

  const launchDate = new Date(launchTimeMs);
  if (isReferenceLive(launchDate, holidays)) {
    warnings.push("launch lands inside a live session; the reference is already trading");
  }
  const hoursToOpen = hoursUntilOpen(launchDate, holidays);
  if (hoursToOpen === 0) {
    warnings.push("no closed window ahead of the launch; the curve has nothing to decay across");
  }

  // Periods are hourly, clamped to at least one, so the schedule is expressible on-chain.
  const numberOfPeriod = Math.max(1, Math.floor(durationSeconds / HOUR_SECONDS));

  // If the window is too short, recommend moving the launch earlier rather than shipping a
  // cliff that ends before it can bite.
  const recommendedLaunchTimeMs =
    durationSeconds >= minWindowSeconds ? launchTimeMs : targetBoundaryMs - minWindowSeconds * 1000;

  return {
    mode,
    schedulerParam: {
      startingFeeBps: cliffFeeBps,
      endingFeeBps: baseFeeBps,
      numberOfPeriod,
      totalDuration: durationSeconds,
    },
    durationSeconds,
    recommendedLaunchTimeMs,
    warnings,
  };
}
