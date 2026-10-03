import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateDecay, projectFees } from "../src/model.js";

interface SyntheticPool {
  name: string;
  startFeeUsd: number;
  lambda: number;
  noise: number;
  seed: number;
}

const POOLS: SyntheticPool[] = [
  { name: "meme-graduated", startFeeUsd: 8_000, lambda: 0.08, noise: 0.35, seed: 1 },
  { name: "ai-token", startFeeUsd: 3_200, lambda: 0.05, noise: 0.3, seed: 2 },
  { name: "stock-quoted", startFeeUsd: 1_500, lambda: 0.02, noise: 0.25, seed: 3 },
  { name: "slow-burn", startFeeUsd: 600, lambda: 0.01, noise: 0.2, seed: 4 },
  { name: "fast-decay", startFeeUsd: 12_000, lambda: 0.12, noise: 0.4, seed: 5 },
  { name: "flat-blue-chip", startFeeUsd: 2_400, lambda: 0.0, noise: 0.15, seed: 6 },
];

const FIT_WINDOW = 30;
const FORECAST_DAYS = 30;
const HORIZON = FIT_WINDOW + FORECAST_DAYS;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(pool: SyntheticPool): number[] {
  const rand = mulberry32(pool.seed);
  return Array.from({ length: HORIZON }, (_, i) => {
    const trend = pool.startFeeUsd * Math.exp(-pool.lambda * i);
    const shock = 1 + (rand() * 2 - 1) * pool.noise;
    return Math.max(trend * shock, 0);
  });
}

interface Row {
  pool: string;
  trueLambda: number;
  fittedLambda: number;
  predicted30d: number;
  realized30d: number;
  errorPct: number;
}

function run(): void {
  const rows: Row[] = POOLS.map((pool) => {
    const fees = series(pool);
    const history = fees.slice(0, FIT_WINDOW);
    const realized = fees.slice(FIT_WINDOW, FIT_WINDOW + FORECAST_DAYS);
    const fit = estimateDecay(history);
    const lastFee = history.at(-1) ?? 0;
    const projected = projectFees({
      lastFeeUsd: lastFee,
      lambda: fit.lambda,
      horizonDays: FORECAST_DAYS,
      floorUsd: 0,
    });
    const predicted30d = projected.reduce((a, b) => a + b, 0);
    const realized30d = realized.reduce((a, b) => a + b, 0);
    const errorPct = realized30d === 0 ? 0 : (predicted30d - realized30d) / realized30d;
    return {
      pool: pool.name,
      trueLambda: pool.lambda,
      fittedLambda: fit.lambda,
      predicted30d,
      realized30d,
      errorPct,
    };
  });

  const maePct = rows.reduce((sum, r) => sum + Math.abs(r.errorPct), 0) / rows.length;
  const meanPredicted = rows.reduce((s, r) => s + r.predicted30d, 0) / rows.length;
  const meanRealized = rows.reduce((s, r) => s + r.realized30d, 0) / rows.length;
  const calibration = meanRealized === 0 ? 0 : meanPredicted / meanRealized;

  const table = rows
    .map(
      (r) =>
        `| ${r.pool} | ${r.trueLambda.toFixed(3)} | ${r.fittedLambda.toFixed(3)} | ` +
        `${r.predicted30d.toFixed(0)} | ${r.realized30d.toFixed(0)} | ${(r.errorPct * 100).toFixed(1)}% |`,
    )
    .join("\n");

  const report = `# Valuation backtest

Synthetic pools with a known decay rate and multiplicative noise. The model fits a
weighted log-linear decay on the first ${FIT_WINDOW} days and forecasts the next ${FORECAST_DAYS} days
of fees. Errors are (predicted - realized) / realized.

| Pool | True lambda | Fitted lambda | Predicted 30d | Realized 30d | Error |
|---|---|---|---|---|---|
${table}

- Mean absolute error: **${(maePct * 100).toFixed(1)}%**
- Calibration (mean predicted / mean realized): **${calibration.toFixed(3)}**

Calibration near 1.0 means the model is unbiased on average; individual-pool error
is the tightness of the fitted decay rate against the true one. Real series carry
regime changes that this synthetic set does not model, so treat these numbers as an
upper bound on accuracy.
`;

  const out = join(dirname(fileURLToPath(import.meta.url)), "results.md");
  writeFileSync(out, report, "utf8");
  process.stdout.write(report);
}

run();
