import {
  HORIZON_DAYS,
  SHARE_DECIMALS,
  SHARE_SUPPLY,
  type ScenarioValuation,
  type ValuationInput,
  type ValuationResult,
} from "@perpetua/shared";
import { estimateDecay, impliedApr, paybackDays, presentValue, projectFees } from "./model.js";
import { computeRiskFlags } from "./risk.js";
import { buildScenarios } from "./scenarios.js";
import type { ValuationConfig } from "./types.js";

const FEE_FLOOR_FRACTION = 0.02;
const WHOLE_TOKENS = Number(SHARE_SUPPLY / 10n ** BigInt(SHARE_DECIMALS));

export function resolveConfig(input: ValuationInput): ValuationConfig {
  return {
    risk: input.risk,
    protocolFeeBps: input.protocolFeeBps,
    horizonDays: input.horizonDays || HORIZON_DAYS,
    discountRateAnnual: input.discountRateAnnual,
    shareSupply: WHOLE_TOKENS,
  };
}

export function valuePosition(input: ValuationInput): ValuationResult {
  const config = resolveConfig(input);
  const { feesUsd } = input.series;
  const fit = estimateDecay(feesUsd);
  const lastFee = feesUsd.at(-1) ?? 0;
  const floorUsd = Math.max(lastFee * FEE_FLOOR_FRACTION, 1e-6);

  const scenarios = buildScenarios(fit.lambda);
  const valuations: ScenarioValuation[] = scenarios.map((scenario) => {
    const projected = projectFees({
      lastFeeUsd: lastFee * scenario.volumeMultiplier,
      lambda: scenario.lambda,
      horizonDays: config.horizonDays,
      floorUsd,
    });
    const pv = presentValue(projected, {
      liquidityShare: input.liquidityShare,
      protocolFeeBps: config.protocolFeeBps,
      discountRateAnnual: config.discountRateAnnual,
      horizonDays: config.horizonDays,
    });
    return {
      scenario,
      presentValueUsd: pv,
      fairValuePerShareUsd: pv / config.shareSupply,
      paybackDays: paybackDays(projected, input.liquidityShare, pv),
    };
  });

  const byName = new Map(valuations.map((v) => [v.scenario.name, v]));
  const base = byName.get("base") ?? valuations[0];
  const bear = byName.get("bear") ?? base;
  const bull = byName.get("bull") ?? base;
  if (!base || !bear || !bull) throw new Error("valuation produced no scenarios");

  const annualFeesUsd = projectFees({
    lastFeeUsd: lastFee,
    lambda: fit.lambda,
    horizonDays: 365,
    floorUsd,
  }).reduce((sum, fee) => sum + fee, 0);

  return {
    pool: input.pool,
    fairValueUsd: base.presentValueUsd,
    fairValueRangeUsd: {
      low: bear.presentValueUsd,
      base: base.presentValueUsd,
      high: bull.presentValueUsd,
    },
    fairValuePerShareUsd: base.fairValuePerShareUsd,
    scenarios: valuations,
    riskFlags: computeRiskFlags(config.risk),
    impliedAprAt: (priceUsd: number) => impliedApr(annualFeesUsd, input.liquidityShare, priceUsd),
  };
}
