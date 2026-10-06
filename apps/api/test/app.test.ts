import { StaticDataApi } from "@perpetua/sdk/data";
import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InMemoryStore } from "../src/store/memory.js";

/// A fixed series so these tests never touch the network.
///
/// This lives in the test file deliberately. The API ship no data of its own — `server.ts` points at
/// Meteora's data API — so a fixture here is a test input, not something a running server can serve.
const POOL = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const POSITION = "8sbCkYzQHNhcn3sRJuAVNXvVQdEoaq1eLE8b2EsqRsBp";

function fixedSeries(): PoolDailySeries {
  const days = Array.from({ length: 30 }, (_, index) => index + 1);
  return {
    pool: POOL,
    days,
    feesUsd: days.map((day) => 4200 * Math.exp(-0.045 * day)),
    volumeUsd: days.map((day) => 900_000 * Math.exp(-0.03 * day)),
    liquidityUsd: days.map(() => 750_000),
  };
}

function fixedPositions(): PositionSummary[] {
  return [
    {
      address: POSITION,
      pool: POOL,
      nftMint: "ELWTtHkjB8yH2pHMFA6L6o7EQGXn6UxVh2c5vS4cJ4FN",
      tokenAMint: "So11111111111111111111111111111111111111112",
      tokenBMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      unlockedLiquidity: "0",
      vestedLiquidity: "0",
      permanentLockedLiquidity: "1250000000",
    },
  ];
}

function app() {
  return createApp({
    store: new InMemoryStore(),
    dataApi: new StaticDataApi(
      new Map([[POOL, fixedSeries()]]),
      new Map([[WALLET, fixedPositions()]]),
    ),
  });
}

describe("perpetua api", () => {
  it("responds to health checks", async () => {
    const res = await app().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("prices a pool by address", async () => {
    const res = await app().request(`/v1/pools/${POOL}/yield`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      valuation: { fairValueUsd: number; scenarios: unknown[] };
    };
    expect(body.valuation.fairValueUsd).toBeGreaterThan(0);
    expect(body.valuation.scenarios).toHaveLength(3);
  });

  it("rejects a valuation request without a resolvable pool", async () => {
    const res = await app().request("/v1/valuation/SomePositionWithoutPool");
    expect(res.status).toBe(400);
  });

  it("returns an empty vault list and zeroed stats initially", async () => {
    const list = await app().request("/v1/vaults");
    expect(await list.json()).toEqual({ vaults: [] });
    const stats = await app().request("/v1/stats");
    expect(await stats.json()).toEqual({
      stats: {
        vaults: 0,
        positionsSecuritized: 0,
        feesDistributedUsd: 0,
        uniqueStakers: 0,
        dlmmVolumeUsd: 0,
      },
    });
  });

  it("builds a DLMM ask ladder plan from query params", async () => {
    const res = await app().request("/v1/sale/plan?fairValuePerShareUsd=1&totalShares=1000000");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { bins: unknown[]; totalOfferShares: number } };
    expect(body.plan.bins).toHaveLength(20);
    expect(body.plan.totalOfferShares).toBeCloseTo(600_000, 6);
  });

  it("rejects an impossible ladder", async () => {
    const res = await app().request("/v1/sale/plan?fairValuePerShareUsd=1&lowerPct=0.05");
    expect(res.status).toBe(400);
  });

  it("returns a validated financeable preset", async () => {
    const res = await app().request("/v1/dbc/preset");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { validation: { valid: boolean } };
    expect(body.validation.valid).toBe(true);
  });

  it("reports a failing data api instead of inventing a fee series", async () => {
    const failing = createApp({
      store: new InMemoryStore(),
      dataApi: {
        poolDaily: async () => {
          throw new Error("data api unreachable");
        },
        walletPositions: async () => [],
      },
    });

    const yield_ = await failing.request(`/v1/pools/${POOL}/yield`);
    expect(yield_.status).toBe(502);
    expect(await yield_.json()).toEqual({ error: "data api unreachable" });

    const series = await failing.request(`/v1/pools/${POOL}/series`);
    expect(series.status).toBe(502);
  });

  it("lists a wallet's indexed positions", async () => {
    const res = await app().request(`/v1/positions/${WALLET}`);
    const body = (await res.json()) as { positions: Array<{ permanentLockedLiquidity: string }> };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]?.permanentLockedLiquidity).toBe("1250000000");
  });

  it("404s on an unknown vault", async () => {
    const res = await app().request("/v1/vaults/unknown");
    expect(res.status).toBe(404);
  });
});
