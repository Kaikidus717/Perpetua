import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";

export const DEMO_POOL = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
export const DEMO_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
export const DEMO_POSITION = "8sbCkYzQHNhcn3sRJuAVNXvVQdEoaq1eLE8b2EsqRsBp";

export function demoPositions(): Map<string, PositionSummary[]> {
  return new Map([
    [
      DEMO_WALLET,
      [
        {
          address: DEMO_POSITION,
          pool: DEMO_POOL,
          nftMint: "ELWTtHkjB8yH2pHMFA6L6o7EQGXn6UxVh2c5vS4cJ4FN",
          tokenAMint: "So11111111111111111111111111111111111111112",
          tokenBMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          unlockedLiquidity: "0",
          vestedLiquidity: "0",
          permanentLockedLiquidity: "1250000000",
        },
      ],
    ],
  ]);
}

export function demoPools(): Map<string, PoolDailySeries> {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return new Map([
    [
      DEMO_POOL,
      {
        pool: DEMO_POOL,
        days,
        feesUsd: days.map((day) => 4200 * Math.exp(-0.045 * day)),
        volumeUsd: days.map((day) => 900_000 * Math.exp(-0.03 * day)),
        liquidityUsd: days.map(() => 750_000),
      },
    ],
  ]);
}
