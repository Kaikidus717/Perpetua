import type {
  Scenario,
  ScenarioValuation,
  ValuationInput,
  ValuationResult,
  ValuationRiskInput,
} from "@perpetua/shared";

export type { Scenario, ScenarioValuation, ValuationInput, ValuationResult, ValuationRiskInput };

export interface DecayFit {
  lambda: number;
  intercept: number;
  r2: number;
  samples: number;
}

export interface ProjectionOptions {
  lastFeeUsd: number;
  lambda: number;
  horizonDays: number;
  floorUsd: number;
}

export interface PresentValueOptions {
  liquidityShare: number;
  protocolFeeBps: number;
  discountRateAnnual: number;
  horizonDays: number;
}

export interface ValuationConfig {
  risk: ValuationRiskInput;
  protocolFeeBps: number;
  horizonDays: number;
  discountRateAnnual: number;
  shareSupply: number;
}
