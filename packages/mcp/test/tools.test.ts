import { describe, expect, it } from "vitest";
import type { PerpetuaApiPort, Query } from "../src/ports.js";
import { TOOLS, type ToolContext, callTool, summarizeSeries } from "../src/tools.js";

const POOL = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const POSITION = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const CREATOR = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const MINT = "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh";

const CTX: ToolContext = { now: () => new Date("2026-01-02T03:04:05.000Z"), source: "test" };

interface Call {
  method: "GET" | "POST";
  path: string;
  query?: Query | undefined;
  body?: unknown;
}

function fake(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const port: PerpetuaApiPort = {
    async get(path, query) {
      calls.push({ method: "GET", path, query });
      return responses[path] ?? null;
    },
    async post(path, body) {
      calls.push({ method: "POST", path, body });
      return responses[path] ?? null;
    },
  };
  return { port, calls };
}

const VALUATION = {
  pool: POOL,
  fairValueUsd: 12_000,
  fairValueRangeUsd: { low: 6_000, base: 12_000, high: 24_000 },
  fairValuePerShareUsd: 0.012,
  impliedAprAtFairValue: 0.31,
  scenarios: [],
  riskFlags: ["pool_too_young"],
  modelVersion: "perpetua-valuation/1.1.0",
  inputsHash: "0badc0de",
};

const SERIES = {
  pool: POOL,
  days: [1, 2, 3, 4],
  feesUsd: [100, 90, 80, 70],
  volumeUsd: [1_000, 900, 800, 700],
  liquidityUsd: [50_000, 49_000, 48_000, 47_000],
};

describe("price_position", () => {
  it("prices a pool through /v1/pools/:pool/yield", async () => {
    const { port, calls } = fake({ [`/v1/pools/${POOL}/yield`]: { valuation: VALUATION } });

    const outcome = await callTool(
      "price_position",
      { pool: POOL, liquidity_share: 0.4 },
      port,
      CTX,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe(`/v1/pools/${POOL}/yield`);
    expect(calls[0]?.query?.liquidityShare).toBe(0.4);
    expect(outcome.data).toMatchObject({ pool: POOL, position: null });
    expect(outcome.envelope.model_version).toBe("perpetua-valuation/1.1.0");
  });

  it("prices a single position and passes the pool through as a hint", async () => {
    const { port, calls } = fake({
      [`/v1/valuation/${POSITION}`]: { position: POSITION, pool: POOL, valuation: VALUATION },
    });

    const outcome = await callTool("price_position", { position: POSITION, pool: POOL }, port, CTX);

    expect(calls[0]?.path).toBe(`/v1/valuation/${POSITION}`);
    expect(calls[0]?.query?.pool).toBe(POOL);
    expect(outcome.data).toMatchObject({ position: POSITION, pool: POOL });
  });

  it("refuses to guess when neither position nor pool is given", async () => {
    const { port, calls } = fake({});
    await expect(callTool("price_position", {}, port, CTX)).rejects.toThrow(/position.*pool/i);
    expect(calls).toHaveLength(0);
  });
});

describe("list_vaults", () => {
  it("returns everything when no limit is set", async () => {
    const vaults = [{ address: "a" }, { address: "b" }, { address: "c" }];
    const { port } = fake({ "/v1/vaults": { vaults } });

    const outcome = await callTool("list_vaults", {}, port, CTX);

    expect(outcome.data).toMatchObject({ total: 3, count: 3 });
  });

  it("applies the limit", async () => {
    const vaults = [{ address: "a" }, { address: "b" }, { address: "c" }];
    const { port } = fake({ "/v1/vaults": { vaults } });

    const outcome = await callTool("list_vaults", { limit: 2 }, port, CTX);

    expect(outcome.data).toMatchObject({ total: 3, count: 2 });
  });

  it("survives a malformed payload without throwing", async () => {
    const { port } = fake({ "/v1/vaults": { vaults: "nope" } });
    const outcome = await callTool("list_vaults", {}, port, CTX);
    expect(outcome.data).toMatchObject({ total: 0, count: 0, vaults: [] });
  });
});

describe("get_report", () => {
  it("merges the valuation with pooled fee statistics", async () => {
    const { port, calls } = fake({
      [`/v1/pools/${POOL}/yield`]: { valuation: VALUATION },
      [`/v1/pools/${POOL}/series`]: { series: SERIES },
    });

    const outcome = await callTool("get_report", { pool: POOL, days: 7 }, port, CTX);
    const data = outcome.data as {
      series_summary: { days: number; total_fees_usd: number; trend_usd_per_day: number };
      valuation: { fairValueUsd: number };
    };

    expect(calls.map((call) => call.path)).toEqual([
      `/v1/pools/${POOL}/yield`,
      `/v1/pools/${POOL}/series`,
    ]);
    expect(calls[1]?.query?.days).toBe(7);
    expect(data.valuation.fairValueUsd).toBe(12_000);
    expect(data.series_summary.days).toBe(4);
    expect(data.series_summary.total_fees_usd).toBe(340);
    expect(data.series_summary.trend_usd_per_day).toBeCloseTo(-10, 6);
    expect(outcome.envelope.endpoints).toHaveLength(2);
  });
});

describe("simulate_preset", () => {
  it("maps snake_case arguments onto the api's camelCase query", async () => {
    const { port, calls } = fake({
      "/v1/dbc/preset": { preset: { feeBps: 100 }, validation: { valid: true } },
    });

    const outcome = await callTool(
      "simulate_preset",
      {
        creator_trading_fee_pct: 15,
        creator_liquidity_pct: 30,
        partner_liquidity_pct: 50,
        locked_pct: 20,
      },
      port,
      CTX,
    );

    expect(calls[0]?.query).toMatchObject({
      creatorTradingFeePct: 15,
      creatorLiquidityPct: 30,
      partnerLiquidityPct: 50,
      lockedPct: 20,
    });
    expect(outcome.data).toMatchObject({ economics: null });
    expect(outcome.envelope.model_version).toBeNull();
  });

  it("prices the permanently locked share when a pool is supplied", async () => {
    const { port, calls } = fake({
      "/v1/dbc/preset": { preset: {}, validation: { valid: true } },
      [`/v1/pools/${POOL}/yield`]: { valuation: VALUATION },
    });

    const outcome = await callTool("simulate_preset", { pool: POOL, locked_pct: 40 }, port, CTX);

    expect(calls[1]?.query?.liquidityShare).toBeCloseTo(0.4, 10);
    expect(outcome.envelope.model_version).toBe("perpetua-valuation/1.1.0");
  });
});

describe("build_securitize_tx", () => {
  const keys = {
    creator: CREATOR,
    pool: POOL,
    position: POSITION,
    position_nft_mint: MINT,
    position_nft_account: MINT,
    position_nft_program: MINT,
    token_a_mint: MINT,
    token_b_mint: MINT,
    token_a_program: MINT,
    token_b_program: MINT,
    share_mint: MINT,
  };

  it("posts camelCase and returns an unsigned transaction", async () => {
    const { port, calls } = fake({ "/v1/tx/create-vault": { transaction: "AQIDBA==" } });

    const outcome = await callTool("build_securitize_tx", keys, port, CTX);
    const body = calls[0]?.body as Record<string, unknown>;

    expect(calls[0]?.method).toBe("POST");
    expect(body.positionNftMint).toBe(MINT);
    expect(body.tokenAProgram).toBe(MINT);
    expect(body.shareMint).toBe(MINT);
    expect(outcome.envelope.unsigned).toBe(true);
    expect(outcome.data).toMatchObject({
      unsigned_transaction_base64: "AQIDBA==",
      requires_signature: true,
      signer: CREATOR,
    });
  });

  it("errors instead of returning an empty transaction", async () => {
    const { port } = fake({ "/v1/tx/create-vault": { transaction: "" } });
    await expect(callTool("build_securitize_tx", keys, port, CTX)).rejects.toThrow(
      /unsigned transaction/i,
    );
  });

  it("rejects a malformed signer before calling the api", async () => {
    const { port, calls } = fake({});
    await expect(
      callTool("build_securitize_tx", { ...keys, creator: "tooshort" }, port, CTX),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

const SECURITIZE_ARGS = {
  creator: CREATOR,
  pool: POOL,
  position: POSITION,
  position_nft_mint: MINT,
  position_nft_account: MINT,
  position_nft_program: MINT,
  token_a_mint: MINT,
  token_b_mint: MINT,
  token_a_program: MINT,
  token_b_program: MINT,
  share_mint: MINT,
};

const ARGS_BY_TOOL: Record<string, unknown> = {
  price_position: { pool: POOL },
  list_vaults: {},
  get_report: { pool: POOL },
  simulate_preset: {},
  build_securitize_tx: SECURITIZE_ARGS,
};

describe("envelope", () => {
  it("stamps as_of, source, model_version and endpoints on every tool", async () => {
    const { port } = fake({
      "/v1/vaults": { vaults: [] },
      "/v1/dbc/preset": { preset: {}, validation: { valid: true } },
      "/v1/tx/create-vault": { transaction: "AQIDBA==" },
      [`/v1/pools/${POOL}/yield`]: { valuation: VALUATION },
      [`/v1/pools/${POOL}/series`]: { series: SERIES },
    });

    // The tool list is a published contract, so pin the names and their order.
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "price_position",
      "list_vaults",
      "get_report",
      "simulate_preset",
      "build_securitize_tx",
    ]);

    for (const tool of TOOLS) {
      const outcome = await callTool(tool.name, ARGS_BY_TOOL[tool.name], port, CTX);
      expect(outcome.envelope.as_of, tool.name).toBe("2026-01-02T03:04:05.000Z");
      expect(outcome.envelope.source, tool.name).toBe("test");
      expect(outcome.envelope.endpoints.length, tool.name).toBeGreaterThan(0);
      expect(typeof outcome.envelope.unsigned, tool.name).toBe("boolean");
      const version = outcome.envelope.model_version;
      expect(version === null || typeof version === "string", tool.name).toBe(true);
    }
  });

  it("only marks the transaction builder as unsigned", async () => {
    const { port } = fake({
      "/v1/vaults": { vaults: [] },
      "/v1/dbc/preset": { preset: {}, validation: { valid: true } },
      "/v1/tx/create-vault": { transaction: "AQIDBA==" },
      [`/v1/pools/${POOL}/yield`]: { valuation: VALUATION },
      [`/v1/pools/${POOL}/series`]: { series: SERIES },
    });

    for (const tool of TOOLS) {
      const outcome = await callTool(tool.name, ARGS_BY_TOOL[tool.name], port, CTX);
      expect(outcome.envelope.unsigned, tool.name).toBe(tool.name === "build_securitize_tx");
    }
  });

  it("rejects an out-of-range argument", async () => {
    const { port } = fake({});
    await expect(
      callTool("price_position", { pool: POOL, liquidity_share: 5 }, port, CTX),
    ).rejects.toThrow();
  });

  it("rejects an unknown tool", async () => {
    const { port } = fake({});
    await expect(callTool("nope", {}, port, CTX)).rejects.toThrow(/unknown tool/);
  });
});

describe("summarizeSeries", () => {
  it("reports zeroes for an empty series", () => {
    const summary = summarizeSeries({
      pool: POOL,
      days: [],
      feesUsd: [],
      volumeUsd: [],
      liquidityUsd: [],
    });
    expect(summary).toMatchObject({
      days: 0,
      total_fees_usd: 0,
      mean_daily_fees_usd: 0,
      trend_usd_per_day: 0,
    });
  });

  it("reports a flat slope for constant fees", () => {
    const summary = summarizeSeries({
      pool: POOL,
      days: [1, 2, 3],
      feesUsd: [50, 50, 50],
      volumeUsd: [0, 0, 0],
      liquidityUsd: [0, 0, 0],
    });
    expect(summary.trend_usd_per_day).toBe(0);
    expect(summary.last_daily_fees_usd).toBe(50);
  });
});
