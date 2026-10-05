import type { PoolDailySeries } from "@perpetua/shared";
import { z } from "zod";
import type { PerpetuaApiPort, ToolEnvelope, ToolOutcome } from "./ports.js";

export interface ToolContext {
  now: () => Date;
  source: string;
}

const PUBKEY = z.string().min(32).max(44);

const API = {
  vaults: "/v1/vaults",
  poolYield: (pool: string) => `/v1/pools/${pool}/yield`,
  poolSeries: (pool: string) => `/v1/pools/${pool}/series`,
  positionValuation: (position: string) => `/v1/valuation/${position}`,
  dbcPreset: "/v1/dbc/preset",
  createVaultTx: "/v1/tx/create-vault",
} as const;

const valuationShape = {
  liquidity_share: z
    .number()
    .gt(0)
    .max(1)
    .optional()
    .describe("Fraction of the fee stream owned, 0-1. Defaults to the whole stream."),
  protocol_fee_bps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe("Protocol cut taken before distribution, in basis points."),
  discount_rate: z
    .number()
    .min(0)
    .max(5)
    .optional()
    .describe("Annual discount rate. Defaults to 0.25."),
  horizon_days: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .optional()
    .describe("Projection horizon in days."),
  days: z
    .number()
    .int()
    .min(7)
    .max(30)
    .optional()
    .describe("Days of pool history used to fit the decay. 7-30."),
};

interface ValuationArgs {
  liquidity_share?: number | undefined;
  protocol_fee_bps?: number | undefined;
  discount_rate?: number | undefined;
  horizon_days?: number | undefined;
  days?: number | undefined;
}

function valuationQuery(args: ValuationArgs) {
  return {
    liquidityShare: args.liquidity_share,
    protocolFeeBps: args.protocol_fee_bps,
    discountRate: args.discount_rate,
    horizonDays: args.horizon_days,
    days: args.days,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function modelVersionOf(payload: unknown): string | null {
  const version = record(payload).modelVersion;
  return typeof version === "string" ? version : null;
}

function envelope(
  ctx: ToolContext,
  endpoints: string[],
  modelVersion: string | null,
  unsigned = false,
): ToolEnvelope {
  return {
    as_of: ctx.now().toISOString(),
    source: ctx.source,
    endpoints,
    model_version: modelVersion,
    unsigned,
  };
}

interface SeriesSummary {
  days: number;
  total_fees_usd: number;
  mean_daily_fees_usd: number;
  last_daily_fees_usd: number;
  trend_usd_per_day: number;
  total_volume_usd: number;
  last_liquidity_usd: number;
}

/// A least-squares slope is reported rather than a "half-life": fitting a decay curve belongs to
/// the valuation model, and duplicating it here would let the two disagree silently.
export function summarizeSeries(series: PoolDailySeries): SeriesSummary {
  const fees = series.feesUsd ?? [];
  const count = fees.length;
  const total = fees.reduce((sum, fee) => sum + fee, 0);
  const mean = count > 0 ? total / count : 0;

  let slope = 0;
  if (count >= 2) {
    const meanX = (count - 1) / 2;
    let covariance = 0;
    let variance = 0;
    for (let index = 0; index < count; index += 1) {
      const dx = index - meanX;
      covariance += dx * ((fees[index] ?? 0) - mean);
      variance += dx * dx;
    }
    slope = variance === 0 ? 0 : covariance / variance;
  }

  return {
    days: count,
    total_fees_usd: total,
    mean_daily_fees_usd: mean,
    last_daily_fees_usd: fees.at(-1) ?? 0,
    trend_usd_per_day: slope,
    total_volume_usd: (series.volumeUsd ?? []).reduce((sum, volume) => sum + volume, 0),
    last_liquidity_usd: (series.liquidityUsd ?? []).at(-1) ?? 0,
  };
}

export interface AnyTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handle: (args: unknown, port: PerpetuaApiPort, ctx: ToolContext) => Promise<ToolOutcome>;
}

function defineTool<S extends z.ZodObject<z.ZodRawShape>>(spec: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<S>, port: PerpetuaApiPort, ctx: ToolContext) => Promise<ToolOutcome>;
}): AnyTool {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    handle: (args, port, ctx) => spec.handler(spec.inputSchema.parse(args), port, ctx),
  };
}

const pricePosition = defineTool({
  name: "price_position",
  title: "Price a locked liquidity position as a fee stream",
  description:
    "Fair-value a permanently locked DAMM v2 position, or a whole pool, as a decaying fee stream. " +
    "Returns the base case, a bear/base/bull range, implied APR at fair value, risk flags and the model version. " +
    "Pass `position` for one position, or `pool` for every position in the pool.",
  inputSchema: z.object({
    position: PUBKEY.optional().describe("DAMM v2 position address."),
    pool: PUBKEY.optional().describe("DAMM v2 pool address."),
    ...valuationShape,
  }),
  async handler(args, port, ctx) {
    const query = valuationQuery(args);

    if (args.position) {
      const path = API.positionValuation(args.position);
      const payload = record(await port.get(path, { ...query, pool: args.pool }));
      return {
        envelope: envelope(ctx, [path], modelVersionOf(payload.valuation)),
        data: {
          position: args.position,
          pool: payload.pool ?? args.pool ?? null,
          valuation: payload.valuation ?? null,
        },
      };
    }

    if (!args.pool) throw new Error("provide either `position` or `pool`");

    const path = API.poolYield(args.pool);
    const payload = record(await port.get(path, query));
    return {
      envelope: envelope(ctx, [path], modelVersionOf(payload.valuation)),
      data: { position: null, pool: args.pool, valuation: payload.valuation ?? null },
    };
  },
});

const listVaults = defineTool({
  name: "list_vaults",
  title: "List Perpetua vaults",
  description:
    "List the on-chain Perpetua vaults known to the indexer. Each vault wraps one permanently locked " +
    "DAMM v2 position and issues a tradable share mint against its fee stream.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(500).optional().describe("Return at most this many vaults."),
  }),
  async handler(args, port, ctx) {
    const path = API.vaults;
    const payload = record(await port.get(path));
    const vaults = Array.isArray(payload.vaults) ? payload.vaults : [];
    const limited = args.limit === undefined ? vaults : vaults.slice(0, args.limit);
    return {
      envelope: envelope(ctx, [path], null),
      data: { total: vaults.length, count: limited.length, vaults: limited },
    };
  },
});

const getReport = defineTool({
  name: "get_report",
  title: "Fee Report Card for a pool",
  description:
    "Build a Fee Report Card for one DAMM v2 pool: the full valuation plus pooled fee and volume " +
    "statistics over the observation window. Use this before recommending a purchase price.",
  inputSchema: z.object({
    pool: PUBKEY.describe("DAMM v2 pool address."),
    ...valuationShape,
  }),
  async handler(args, port, ctx) {
    const yieldPath = API.poolYield(args.pool);
    const seriesPath = API.poolSeries(args.pool);
    const [yieldPayload, seriesPayload] = await Promise.all([
      port.get(yieldPath, valuationQuery(args)),
      port.get(seriesPath, { days: args.days }),
    ]);

    const valuation = record(yieldPayload).valuation;
    const series = record(seriesPayload).series as unknown as PoolDailySeries;
    return {
      envelope: envelope(ctx, [yieldPath, seriesPath], modelVersionOf(valuation)),
      data: {
        pool: args.pool,
        valuation: valuation ?? null,
        series_summary: summarizeSeries(series),
        series,
      },
    };
  },
});

const simulatePreset = defineTool({
  name: "simulate_preset",
  title: "Build and check a DBC fee-split preset",
  description:
    "Build a Dynamic Bonding Curve preset from a fee-split and validate it, then optionally price the " +
    "permanently locked share against a live pool. This checks config legality and the economics of the " +
    "resulting fee stream; it does NOT run a Monte Carlo launch simulation.",
  inputSchema: z.object({
    creator_trading_fee_pct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Creator trading fee share."),
    creator_liquidity_pct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Share of liquidity to the creator."),
    partner_liquidity_pct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Share of liquidity to partners."),
    locked_pct: z.number().min(0).max(100).optional().describe("Share permanently locked."),
    pool: PUBKEY.optional().describe("Optional pool to price the locked share against."),
  }),
  async handler(args, port, ctx) {
    const path = API.dbcPreset;
    const payload = record(
      await port.get(path, {
        creatorTradingFeePct: args.creator_trading_fee_pct,
        creatorLiquidityPct: args.creator_liquidity_pct,
        partnerLiquidityPct: args.partner_liquidity_pct,
        lockedPct: args.locked_pct,
      }),
    );

    const endpoints: string[] = [path];
    let economics: unknown = null;
    let modelVersion: string | null = null;

    if (args.pool) {
      const lockedShare = (args.locked_pct ?? 20) / 100;
      const yieldPath = API.poolYield(args.pool);
      const yieldPayload = record(await port.get(yieldPath, { liquidityShare: lockedShare }));
      endpoints.push(yieldPath);
      economics = {
        permanently_locked_share: lockedShare,
        valuation: yieldPayload.valuation ?? null,
      };
      modelVersion = modelVersionOf(yieldPayload.valuation);
    }

    return {
      envelope: envelope(ctx, endpoints, modelVersion),
      data: {
        pool: args.pool ?? null,
        preset: payload.preset ?? null,
        validation: payload.validation ?? null,
        economics,
      },
    };
  },
});

const buildSecuritizeTx = defineTool({
  name: "build_securitize_tx",
  title: "Build an unsigned create_vault transaction",
  description:
    "Build the unsigned transaction that securitizes a permanently locked DAMM v2 position into a " +
    "Perpetua vault. Returns a base64 wire transaction for the `creator` wallet to sign. " +
    "The transaction is never signed here and no key material is ever held.",
  inputSchema: z.object({
    creator: PUBKEY.describe("Wallet that will sign and pay."),
    pool: PUBKEY,
    position: PUBKEY,
    position_nft_mint: PUBKEY,
    position_nft_account: PUBKEY,
    position_nft_program: PUBKEY.describe("Token program owning the position NFT."),
    token_a_mint: PUBKEY,
    token_b_mint: PUBKEY,
    token_a_program: PUBKEY,
    token_b_program: PUBKEY,
    share_mint: PUBKEY.describe("Share mint; must already exist and be owned by the creator."),
  }),
  async handler(args, port, ctx) {
    const path = API.createVaultTx;
    const payload = record(
      await port.post(path, {
        creator: args.creator,
        pool: args.pool,
        position: args.position,
        positionNftMint: args.position_nft_mint,
        positionNftAccount: args.position_nft_account,
        positionNftProgram: args.position_nft_program,
        tokenAMint: args.token_a_mint,
        tokenBMint: args.token_b_mint,
        tokenAProgram: args.token_a_program,
        tokenBProgram: args.token_b_program,
        shareMint: args.share_mint,
      }),
    );

    const transaction = payload.transaction;
    if (typeof transaction !== "string" || transaction.length === 0) {
      throw new Error("the api did not return an unsigned transaction");
    }

    return {
      envelope: envelope(ctx, [path], null, true),
      data: {
        unsigned_transaction_base64: transaction,
        requires_signature: true,
        signer: args.creator,
        note: "Sign this with the creator wallet and submit it. Perpetua never holds keys.",
      },
    };
  },
});

export const TOOLS: AnyTool[] = [
  pricePosition,
  listVaults,
  getReport,
  simulatePreset,
  buildSecuritizeTx,
];

export function findTool(name: string): AnyTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export async function callTool(
  name: string,
  args: unknown,
  port: PerpetuaApiPort,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const tool = findTool(name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.handle(args, port, ctx);
}
