import type { PoolDailySeries } from "@perpetua/shared";
import { z } from "zod";
import type { PerpetuaApiPort, ToolEnvelope, ToolOutcome } from "./ports.js";

export interface ToolContext {
  now: () => Date;
  source: string;
}

const PUBKEY = z.string().min(32).max(44);

/// The share mint is created by `create_vault`, so the caller supplies a fresh keypair whose account
/// does not exist yet, and that keypair signs the transaction.
const FRESH_SHARE_MINT =
  "A fresh share mint: this transaction creates it, so supply a new keypair that signs and whose " +
  "account does not exist yet.";

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
    share_mint: PUBKEY.describe(FRESH_SHARE_MINT),
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
        note:
          "Two signatures are required: the creator wallet, and the fresh share-mint keypair. " +
          "Perpetua never holds keys.",
      },
    };
  },
});

/// Which cluster a transaction is built against. Devnet is where the vault program lives; mainnet is
/// where Meteora's programs and real liquidity live. Both are wired into the API, and every route that
/// touches the chain takes this.
const clusterShape = {
  cluster: z
    .enum(["devnet", "mainnet-beta"])
    .optional()
    .describe("Cluster to build or read against. Defaults to mainnet-beta, the deploy's default."),
};

/// Every transaction tool answers the same way, so an agent learns the shape once: the base64 wire
/// transaction, who has to sign it, anything else the route returned, and the reminder that Perpetua
/// never holds a key. The cluster rides in the query because the body is validated field by field.
function txTool<S extends z.ZodObject<z.ZodRawShape>>(spec: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  path: string;
  body: (args: z.infer<S>) => Record<string, unknown>;
  signer: (args: z.infer<S>) => string;
}): AnyTool {
  return defineTool({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    async handler(args, port, ctx) {
      const { cluster } = args as { cluster?: string };
      const path = cluster ? `${spec.path}?cluster=${cluster}` : spec.path;
      const payload = record(await port.post(path, spec.body(args)));
      const transaction = payload.transaction;
      if (typeof transaction !== "string" || transaction.length === 0) {
        throw new Error("the api did not return an unsigned transaction");
      }
      const result = Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== "transaction"),
      );
      return {
        envelope: envelope(ctx, [path], null, true),
        data: {
          unsigned_transaction_base64: transaction,
          requires_signature: true,
          signer: spec.signer(args),
          result,
          note: "Sign this with the wallet named in `signer` and submit it. Perpetua never holds keys.",
        },
      };
    },
  });
}

/// Where an address lives, and what it is. Every other tool depends on this: a pool is priced on
/// mainnet, a vault lives on devnet, and an agent that skips this step looks in the wrong place.
const whereIsAddress = defineTool({
  name: "where_is_address",
  title: "Which cluster owns an address, and what kind of account it is",
  description:
    "Ask devnet and mainnet which of them owns an address, and whether it is a pool, wallet, mint, " +
    "token account or vault. Call this first with any address an agent is handed.",
  inputSchema: z.object({ address: PUBKEY.describe("Any Solana address.") }),
  async handler(args, port, ctx) {
    const path = `/v1/where/${args.address}`;
    return { envelope: envelope(ctx, [path], null), data: (await port.get(path)) ?? null };
  },
});

/// The clusters this deployment serves, and which one is the default.
const listClusters = defineTool({
  name: "list_clusters",
  title: "List the clusters Perpetua serves",
  description:
    "The clusters this deployment can reach and the one it defaults to. Mainnet carries pool fee " +
    "history; devnet carries the Perpetua vault program.",
  inputSchema: z.object({}),
  async handler(_args, port, ctx) {
    const path = "/v1/clusters";
    return { envelope: envelope(ctx, [path], null), data: (await port.get(path)) ?? null };
  },
});

/// A wallet's positions straight from the DAMM v2 program, with the securitization verdict attached.
const findPositions = defineTool({
  name: "find_positions",
  title: "A wallet's DAMM v2 positions, with a securitization verdict",
  description:
    "Read the positions a wallet owns from the DAMM v2 program: how much is unlocked, vested and " +
    "permanently locked, plus whether each can be securitized as it stands. Feed an eligible one " +
    "straight into build_securitize_tx.",
  inputSchema: z.object({
    wallet: PUBKEY.describe("Wallet to scan."),
    ...clusterShape,
  }),
  async handler(args, port, ctx) {
    const path = `/v1/positions/${args.wallet}/onchain${
      args.cluster ? `?cluster=${args.cluster}` : ""
    }`;
    const payload = record(await port.get(path));
    const positions = Array.isArray(payload.positions) ? payload.positions : [];
    return {
      envelope: envelope(ctx, [path], null),
      data: {
        wallet: args.wallet,
        count: positions.length,
        eligible: positions.filter((position) => record(position).eligibility).length,
        positions,
      },
    };
  },
});

/// The raw daily series behind every valuation, for an agent that wants the data, not the model.
const getPoolSeries = defineTool({
  name: "get_pool_series",
  title: "The daily fee and volume series of a pool",
  description:
    "The raw trailing daily series a valuation is fitted to: fees, volume and liquidity per day. " +
    "Use it when the question is about the data rather than the price.",
  inputSchema: z.object({
    pool: PUBKEY.describe("DAMM v2 pool address."),
    days: z.number().int().min(7).max(30).optional().describe("Days of history, 7-30."),
  }),
  async handler(args, port, ctx) {
    const path = API.poolSeries(args.pool);
    const payload = record(await port.get(path, { days: args.days }));
    const series = record(payload.series);
    return {
      envelope: envelope(ctx, [path], null),
      data: { pool: args.pool, days: series.days ?? [], fees_usd: series.feesUsd ?? [] },
    };
  },
});

/// The DLMM presets a share market can be created at on a given cluster.
const listSalePresets = defineTool({
  name: "list_sale_presets",
  title: "The DLMM bin-step presets a share market can use",
  description:
    "The bin-step presets available on a cluster, which decide how finely a share sale is priced. " +
    "Pair with get_sale_plan to see the ladder a preset produces.",
  inputSchema: z.object({ ...clusterShape }),
  async handler(args, port, ctx) {
    const path = `/v1/sale/presets${args.cluster ? `?cluster=${args.cluster}` : ""}`;
    return { envelope: envelope(ctx, [path], null), data: (await port.get(path)) ?? null };
  },
});

/// The ask ladder a sale would post, without creating anything.
const getSalePlan = defineTool({
  name: "get_sale_plan",
  title: "The ask ladder a share sale would post",
  description:
    "Turn a fair value per share into the one-sided DLMM ladder a seller would post: the bins, their " +
    "prices and how many shares land in each. Read-only; nothing is created.",
  inputSchema: z.object({
    fair_value_per_share_usd: z.number().gt(0).describe("Fair value of one share, in USD."),
    total_shares: z
      .number()
      .int()
      .gt(0)
      .optional()
      .describe("Shares offered. Defaults to 1,000,000."),
    sale_fraction: z.number().gt(0).max(1).optional().describe("Fraction of idle shares to list."),
    lower_pct: z
      .number()
      .gt(0)
      .max(1)
      .optional()
      .describe("How far below fair value the ladder starts."),
    upper_pct: z.number().gt(0).optional().describe("How far above fair value the ladder ends."),
    bin_step: z
      .number()
      .int()
      .min(1)
      .max(400)
      .optional()
      .describe("DLMM bin step in basis points."),
    bin_count: z
      .number()
      .int()
      .min(1)
      .max(1400)
      .optional()
      .describe("Number of bins to spread over."),
  }),
  async handler(args, port, ctx) {
    const path = "/v1/sale/plan";
    const payload = record(
      await port.get(path, {
        fairValuePerShareUsd: args.fair_value_per_share_usd,
        totalShares: args.total_shares,
        saleFraction: args.sale_fraction,
        lowerPct: args.lower_pct,
        upperPct: args.upper_pct,
        binStep: args.bin_step,
        binCount: args.bin_count,
      }),
    );
    return { envelope: envelope(ctx, [path], null), data: payload.plan ?? null };
  },
});

/// A plain SPL mint, the first half of a launch.
const buildCreateMintTx = txTool({
  name: "build_create_mint_tx",
  title: "Build an unsigned mint transaction",
  description:
    "Build the unsigned transaction that creates the base token a launch needs. Nothing is signed " +
    "and nothing is sent.",
  inputSchema: z.object({
    payer: PUBKEY.describe("Wallet that pays for and owns the mint."),
    mint: PUBKEY.describe("The new mint's address. Generate a keypair and sign with it."),
    decimals: z.number().int().min(0).max(9).describe("Mint decimals. Six is what launches use."),
    ...clusterShape,
  }),
  path: "/v1/tx/create-mint",
  body: (args) => ({ payer: args.payer, mint: args.mint, decimals: args.decimals }),
  signer: (args) => args.payer,
});

/// The whole launch: the DBC config and its pool, in one transaction.
const buildLaunchTx = txTool({
  name: "build_launch_tx",
  title: "Build an unsigned DBC launch transaction",
  description:
    "Build the unsigned transaction that creates a Dynamic Bonding Curve config and its pool with " +
    "the liquidity split the caller chose. The metadata `uri` can point at Perpetua's own metadata " +
    "endpoint (/v1/token/metadata?name=…&symbol=…&description=…&image=…), so a launch needs no " +
    "hosted JSON file. Config and pool addresses come back in `result`.",
  inputSchema: z.object({
    creator: PUBKEY.describe("Wallet that pays, signs and receives the fees."),
    config: PUBKEY.describe("The new config's address. Generate a keypair and sign with it."),
    base_mint: PUBKEY.describe("The token created by build_create_mint_tx."),
    quote_mint: PUBKEY.describe("Quote token, usually wrapped SOL or USDC."),
    name: z.string().min(1).max(32).describe("Token name."),
    symbol: z.string().min(1).max(10).describe("Ticker."),
    uri: z.string().min(1).max(200).describe("Metadata link, at most 200 characters."),
    total_token_supply: z.number().int().gt(0).describe("Total supply minted into the curve."),
    creator_trading_fee_percentage: z.number().min(0).max(100).describe("Creator's cut of fees."),
    creator_liquidity_percentage: z.number().min(0).max(100).describe("Creator's liquidity share."),
    partner_liquidity_percentage: z.number().min(0).max(100).describe("Partner's liquidity share."),
    creator_permanent_locked_liquidity_percentage: z
      .number()
      .min(0)
      .max(100)
      .describe("Locked forever — the part that can become shares later."),
    partner_permanent_locked_liquidity_percentage: z.number().min(0).max(100),
    ...clusterShape,
  }),
  path: "/v1/tx/launch",
  body: (args) => ({
    creator: args.creator,
    config: args.config,
    baseMint: args.base_mint,
    quoteMint: args.quote_mint,
    feeClaimer: args.creator,
    leftoverReceiver: args.creator,
    name: args.name,
    symbol: args.symbol,
    uri: args.uri,
    totalTokenSupply: args.total_token_supply,
    creatorTradingFeePercentage: args.creator_trading_fee_percentage,
    creatorLiquidityPercentage: args.creator_liquidity_percentage,
    partnerLiquidityPercentage: args.partner_liquidity_percentage,
    creatorPermanentLockedLiquidityPercentage: args.creator_permanent_locked_liquidity_percentage,
    partnerPermanentLockedLiquidityPercentage: args.partner_permanent_locked_liquidity_percentage,
  }),
  signer: (args) => args.creator,
});

/// Stake and unstake: moving shares in and out of a vault.
const buildStakeTx = txTool({
  name: "build_stake_tx",
  title: "Build an unsigned stake transaction",
  description: "Build the unsigned transaction that stakes share tokens in a vault to earn fees.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Share holder signing."),
    vault: PUBKEY.describe("Perpetua vault address."),
    amount: z.string().regex(/^\d+$/).describe("Share amount in base units, as a decimal string."),
    ...clusterShape,
  }),
  path: "/v1/tx/stake",
  body: (args) => ({ owner: args.owner, vault: args.vault, amount: args.amount }),
  signer: (args) => args.owner,
});

const buildUnstakeTx = txTool({
  name: "build_unstake_tx",
  title: "Build an unsigned unstake transaction",
  description: "Build the unsigned transaction that takes staked shares back out of a vault.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Share holder signing."),
    vault: PUBKEY.describe("Perpetua vault address."),
    amount: z.string().regex(/^\d+$/).describe("Share amount in base units, as a decimal string."),
    ...clusterShape,
  }),
  path: "/v1/tx/unstake",
  body: (args) => ({ owner: args.owner, vault: args.vault, amount: args.amount }),
  signer: (args) => args.owner,
});

/// The escape hatch when a fee mint is paused or blocked and the normal unstake cannot claim.
const buildUnstakeNoClaimTx = txTool({
  name: "build_unstake_no_claim_tx",
  title: "Build an unsigned force-exit transaction",
  description:
    "Build the unsigned transaction that takes staked shares out without claiming fees first. This is " +
    "the escape hatch for a fee mint that is paused or blocked, where the normal unstake cannot run. " +
    "Fees stay in the position and are credited at the next successful claim.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Share holder signing."),
    vault: PUBKEY.describe("Perpetua vault address."),
    amount: z.string().regex(/^\d+$/).describe("Share amount in base units, as a decimal string."),
    ...clusterShape,
  }),
  path: "/v1/tx/unstake-no-claim",
  body: (args) => ({ owner: args.owner, vault: args.vault, amount: args.amount }),
  signer: (args) => args.owner,
});

/// Harvest pulls the pool's earned fees into the vault; crank claims them for stakeholders.
const buildHarvestTx = txTool({
  name: "build_harvest_tx",
  title: "Build an unsigned harvest transaction",
  description:
    "Build the unsigned transaction that moves the fees the pool has earned into the vault, ready " +
    "for holders to claim.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Wallet signing; anyone may harvest."),
    vault: PUBKEY.describe("Perpetua vault address."),
    ...clusterShape,
  }),
  path: "/v1/tx/harvest",
  body: (args) => ({ owner: args.owner, vault: args.vault }),
  signer: (args) => args.owner,
});

const buildCrankTx = txTool({
  name: "build_crank_tx",
  title: "Build an unsigned crank-claim transaction",
  description:
    "Build the unsigned transaction that claims a vault's fees on behalf of stakeholders. " +
    "Permissionless: any wallet can send it.",
  inputSchema: z.object({
    caller: PUBKEY.describe("Wallet signing; anyone may crank."),
    vault: PUBKEY.describe("Perpetua vault address."),
    ...clusterShape,
  }),
  path: "/v1/tx/crank-claim",
  body: (args) => ({ owner: args.caller, vault: args.vault }),
  signer: (args) => args.caller,
});

/// The market side: create the share pair, then post the ladder of asks.
const buildOpenSaleTx = txTool({
  name: "build_open_sale_tx",
  title: "Build an unsigned create-market transaction",
  description:
    "Build the unsigned transaction that creates the DLMM pair a share sale trades in. If the pair " +
    "already exists the API says so in `result` and returns no transaction.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Wallet creating the market."),
    share_mint: PUBKEY,
    quote_mint: PUBKEY,
    preset_parameter: PUBKEY.describe("Preset account from list_sale_presets."),
    bin_step: z.number().int().min(1).max(400),
    base_factor: z.string().regex(/^\d+$/).describe("Base factor, as a decimal string."),
    initial_price: z.number().gt(0).describe("Starting price of one share, in the quote token."),
    ...clusterShape,
  }),
  path: "/v1/tx/open-sale",
  body: (args) => ({
    owner: args.owner,
    shareMint: args.share_mint,
    quoteMint: args.quote_mint,
    presetParameter: args.preset_parameter,
    binStep: args.bin_step,
    baseFactor: args.base_factor,
    initialPrice: args.initial_price,
  }),
  signer: (args) => args.owner,
});

const buildSeedLadderTx = txTool({
  name: "build_seed_ladder_tx",
  title: "Build an unsigned seed-ladder transaction",
  description:
    "Build the unsigned transaction that posts a one-sided ask ladder of shares. Pass the plan from " +
    "get_sale_plan unchanged, and a freshly generated position keypair to sign with.",
  inputSchema: z.object({
    owner: PUBKEY.describe("Wallet posting the ladder."),
    pool_address: PUBKEY.describe("The share market from build_open_sale_tx."),
    share_mint: PUBKEY,
    quote_mint: PUBKEY,
    position_pubkey: PUBKEY.describe("New position account. Generate a keypair and sign with it."),
    bin_step: z.number().int().min(1).max(400),
    plan: z.object({
      bins: z.array(z.object({ index: z.number(), priceUsd: z.number(), shares: z.number() })),
      rangeLowUsd: z.number(),
      rangeHighUsd: z.number(),
      totalOfferShares: z.number(),
      weightedAveragePriceUsd: z.number(),
    }),
    ...clusterShape,
  }),
  path: "/v1/tx/seed-ladder",
  body: (args) => ({
    owner: args.owner,
    poolAddress: args.pool_address,
    shareMint: args.share_mint,
    quoteMint: args.quote_mint,
    positionPubKey: args.position_pubkey,
    binStep: args.bin_step,
    plan: args.plan,
  }),
  signer: (args) => args.owner,
});

/// Every tool below is the same thing the web app can do, in the same order an agent would need it:
/// find out where an address lives, price it, find what a wallet owns, then build the transactions.
export const TOOLS: AnyTool[] = [
  whereIsAddress,
  listClusters,
  pricePosition,
  getPoolSeries,
  getReport,
  findPositions,
  listVaults,
  simulatePreset,
  getSalePlan,
  listSalePresets,
  buildCreateMintTx,
  buildLaunchTx,
  buildSecuritizeTx,
  buildStakeTx,
  buildUnstakeTx,
  buildUnstakeNoClaimTx,
  buildHarvestTx,
  buildCrankTx,
  buildOpenSaleTx,
  buildSeedLadderTx,
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
