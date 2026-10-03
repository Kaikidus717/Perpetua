import { buildFinanceablePreset, validatePreset } from "@perpetua/sdk/dbc";
import type { DataApiPort } from "@perpetua/sdk/ports";
import { buildLadder } from "@perpetua/sdk/sale";
import {
  DISCOUNT_RATE_ANNUAL,
  HORIZON_DAYS,
  MAX_POOL_HISTORY_DAYS,
  MIN_POOL_HISTORY_DAYS,
  type ValuationInput,
  type ValuationResult,
  type ValuationRiskInput,
} from "@perpetua/shared";
import { valuePosition } from "@perpetua/valuation";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Store } from "./store/types.js";

export interface AppDeps {
  store: Store;
  dataApi: DataApiPort;
  demoPool?: string;
  demoWallet?: string;
}

const DEFAULT_RISK: ValuationRiskInput = {
  feeCollectMode: "claimable",
  poolAgeDays: MIN_POOL_HISTORY_DAYS,
  pausableMint: false,
  permanentDelegate: false,
  liquidityUsd: 0,
  topWalletVolumeShare: 0,
};

const valuationQuery = z.object({
  pool: z.string().optional(),
  liquidityShare: z.coerce.number().gt(0).max(1).default(1),
  protocolFeeBps: z.coerce.number().int().min(0).max(10_000).default(0),
  discountRate: z.coerce.number().min(0).max(5).default(DISCOUNT_RATE_ANNUAL),
  horizonDays: z.coerce.number().int().min(1).max(3650).default(HORIZON_DAYS),
  days: z.coerce.number().int().min(MIN_POOL_HISTORY_DAYS).max(MAX_POOL_HISTORY_DAYS).default(30),
});

const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });

const presetQuery = z.object({
  creatorTradingFeePct: z.coerce.number().min(0).max(100).default(10),
  creatorLiquidityPct: z.coerce.number().min(0).max(100).default(40),
  partnerLiquidityPct: z.coerce.number().min(0).max(100).default(40),
  lockedPct: z.coerce.number().min(0).max(100).default(20),
});

const saleQuery = z.object({
  fairValuePerShareUsd: z.coerce.number().positive(),
  totalShares: z.coerce.number().positive().default(1_000_000),
  saleFraction: z.coerce.number().gt(0).lte(1).default(0.6),
  lowerPct: z.coerce.number().min(-1).lt(0).default(-0.05),
  upperPct: z.coerce.number().gt(0).max(10).default(0.25),
  binStep: z.coerce.number().int().min(1).max(400).default(20),
  binCount: z.coerce.number().int().min(1).max(69).default(20),
});

function serialize(result: ValuationResult) {
  return {
    pool: result.pool,
    fairValueUsd: result.fairValueUsd,
    fairValueRangeUsd: result.fairValueRangeUsd,
    fairValuePerShareUsd: result.fairValuePerShareUsd,
    impliedAprAtFairValue: result.impliedAprAt(result.fairValuePerShareUsd),
    scenarios: result.scenarios,
    riskFlags: result.riskFlags,
  };
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/v1/vaults", async (c) => c.json({ vaults: await deps.store.listVaults() }));

  app.get("/v1/vaults/:id", async (c) => {
    const vault = await deps.store.getVault(c.req.param("id"));
    if (!vault) return c.json({ error: "vault not found" }, 404);
    return c.json({ vault });
  });

  app.get("/v1/vaults/:id/events", async (c) => {
    const parsed = limitQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const events = await deps.store.listVaultEvents(c.req.param("id"), parsed.data.limit);
    return c.json({ events });
  });

  app.get("/v1/positions/:wallet", async (c) => {
    const positions = await deps.dataApi.walletPositions(c.req.param("wallet"));
    return c.json({ positions });
  });

  app.get("/v1/valuation/:position", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

    const position = c.req.param("position");
    const pool = parsed.data.pool ?? (await deps.store.getPositionPool(position));
    if (!pool) return c.json({ error: "unknown pool; pass ?pool=" }, 400);

    const result = await pricePool(deps, pool, parsed.data);
    return c.json({ position, valuation: serialize(result) });
  });

  app.get("/v1/demo", (c) =>
    c.json({ pool: deps.demoPool ?? null, wallet: deps.demoWallet ?? null }),
  );

  app.get("/v1/dbc/preset", (c) => {
    const parsed = presetQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const preset = buildFinanceablePreset(parsed.data);
    return c.json({ preset, validation: validatePreset(preset) });
  });

  app.get("/v1/pools/:pool/series", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const series = await deps.dataApi.poolDaily(c.req.param("pool"), parsed.data.days);
    return c.json({ series });
  });

  app.get("/v1/pools/:pool/yield", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const result = await pricePool(deps, c.req.param("pool"), parsed.data);
    return c.json({ valuation: serialize(result) });
  });

  app.get("/v1/sale/plan", (c) => {
    const parsed = saleQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const { fairValuePerShareUsd, totalShares, ...rest } = parsed.data;
    try {
      const plan = buildLadder({ fairValuePerShareUsd, totalShares, ...rest });
      return c.json({ plan });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "invalid ladder" }, 400);
    }
  });

  app.get("/v1/stats", async (c) => c.json({ stats: await deps.store.stats() }));

  app.get("/v1/stream", (c) =>
    streamSSE(c, async (stream) => {
      let lastSlot = 0;
      let active = true;
      stream.onAbort(() => {
        active = false;
      });
      while (active) {
        const events = await deps.store.listRecentEvents(20);
        for (const event of events) {
          if (event.slot > lastSlot) {
            await stream.writeSSE({ event: "vault_event", data: JSON.stringify(event) });
            lastSlot = Math.max(lastSlot, event.slot);
          }
        }
        await stream.sleep(5000);
      }
    }),
  );

  return app;
}

async function pricePool(
  deps: AppDeps,
  pool: string,
  query: z.infer<typeof valuationQuery>,
): Promise<ValuationResult> {
  const series = await deps.dataApi.poolDaily(pool, query.days);
  const risk = (await deps.store.getPoolRisk(pool)) ?? DEFAULT_RISK;
  const input: ValuationInput = {
    pool,
    liquidityShare: query.liquidityShare,
    protocolFeeBps: query.protocolFeeBps,
    discountRateAnnual: query.discountRate,
    horizonDays: query.horizonDays,
    series,
    risk: { ...risk, liquidityUsd: risk.liquidityUsd || (series.liquidityUsd.at(-1) ?? 0) },
  };
  return valuePosition(input);
}
