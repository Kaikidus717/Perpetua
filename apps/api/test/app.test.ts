import { StaticDataApi } from "@perpetua/sdk/data";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEMO_POOL, DEMO_WALLET, demoPools, demoPositions } from "../src/demo.js";
import { InMemoryStore } from "../src/store/memory.js";

function app() {
  return createApp({
    store: new InMemoryStore(),
    dataApi: new StaticDataApi(demoPools(), demoPositions()),
    demoPool: DEMO_POOL,
    demoWallet: DEMO_WALLET,
  });
}

describe("perpetua api", () => {
  it("responds to health checks", async () => {
    const res = await app().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("prices a pool by address", async () => {
    const res = await app().request(`/v1/pools/${DEMO_POOL}/yield`);
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

  it("exposes the demo pool and wallet", async () => {
    const res = await app().request("/v1/demo");
    const body = (await res.json()) as { pool: string | null; wallet: string | null };
    expect(body.pool).toBe(DEMO_POOL);
    expect(body.wallet).toBe(DEMO_WALLET);
  });

  it("lists the demo wallet's eligible position", async () => {
    const res = await app().request(`/v1/positions/${DEMO_WALLET}`);
    const body = (await res.json()) as { positions: Array<{ permanentLockedLiquidity: string }> };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]?.permanentLockedLiquidity).toBe("1250000000");
  });

  it("404s on an unknown vault", async () => {
    const res = await app().request("/v1/vaults/unknown");
    expect(res.status).toBe(404);
  });
});
