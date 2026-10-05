import { LAMBDA_CLAMP, type Scenario } from "@perpetua/shared";

interface ScenarioShape {
  name: Scenario["name"];
  lambdaFactor: number;
  volumeMultiplier: number;
}

const SCENARIO_SHAPES: ScenarioShape[] = [
  { name: "bear", lambdaFactor: 1.5, volumeMultiplier: 0.7 },
  { name: "base", lambdaFactor: 1, volumeMultiplier: 1 },
  { name: "bull", lambdaFactor: 0.6, volumeMultiplier: 1.25 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function buildScenarios(baseLambda: number): Scenario[] {
  return SCENARIO_SHAPES.map((shape) => ({
    name: shape.name,
    lambda: clamp(baseLambda * shape.lambdaFactor, LAMBDA_CLAMP.min, LAMBDA_CLAMP.max),
    volumeMultiplier: shape.volumeMultiplier,
  }));
}
