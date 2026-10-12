import { PerpetuaVaultClient } from "@perpetua/sdk";
import { DammV2Adapter } from "@perpetua/sdk/adapters/damm-v2";
import { buildFinanceablePreset, validatePreset } from "@perpetua/sdk/dbc";
import type { DataApiPort } from "@perpetua/sdk/ports";
import { evaluateEligibility } from "@perpetua/sdk/positions";
import { buildLadder } from "@perpetua/sdk/sale";
import {
  DISCOUNT_RATE_ANNUAL,
  HORIZON_DAYS,
  MAX_POOL_HISTORY_DAYS,
  MIN_POOL_HISTORY_DAYS,
  type ValuationInput,
  type ValuationResult,
  type ValuationRiskInput,
  type VaultEvent,
  type VaultSummary,
} from "@perpetua/shared";
import { valuePosition } from "@perpetua/valuation";
import { type Connection, PublicKey } from "@solana/web3.js";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { readVaultEvents } from "./events.js";
import { createMcpEndpoint } from "./mcp.js";
import type { Store } from "./store/types.js";
import {
  BuilderError,
  buildCrankClaim,
  buildCreateMint,
  buildCreateVault,
  buildHarvest,
  buildLaunch,
  buildLockedPosition,
  buildOpenSale,
  buildSeedLadder,
  buildStake,
  buildUnstake,
  buildUnstakeNoClaim,
  listDlmmPresets,
  readonlyProvider,
} from "./tx.js";
import { SHARE_TOKEN_PROGRAM, SYSTEM_PROGRAM } from "./tx.js";

export interface AppDeps {
  store: Store;
  dataApi: DataApiPort;
  /// When set, the `/v1/tx/*` routes can build unsigned transactions for wallets.
  connection?: Connection;
  /// Per-cluster connections, so a request can name the cluster its wallet or pool lives on. When
  /// absent, `connection` is used for `defaultCluster`.
  connections?: Partial<Record<ClusterName, Connection>>;
  /// Which cluster `connection` belongs to. Defaults to devnet, where the vault program lives.
  defaultCluster?: ClusterName;
  /// The cluster the `perpetua_vault` program is deployed on — the one a vault registry is read from.
  /// Defaults to devnet (the only cluster it is deployed on today); changeable per deploy.
  vaultCluster?: ClusterName;
  /// Browser origins allowed to call the API. Defaults to `CORS_ORIGINS`.
  corsOrigins?: string[];
}

/// The two clusters this app talks to. A wallet, a pool, a mint and a vault each exist on exactly one
/// of them, so anything that reads or writes the chain has to be told which one it is dealing with —
/// and anything that shows an address has to link the explorer that will actually find it.
export type ClusterName = "devnet" | "mainnet-beta";

const DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];
const BPF_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

function asClusterName(value: unknown): ClusterName | undefined {
  return value === "devnet" || value === "mainnet-beta" ? value : undefined;
}

function clusterMap(deps: AppDeps): Partial<Record<ClusterName, Connection>> {
  if (deps.connections) return deps.connections;
  if (!deps.connection) return {};
  return { [deps.defaultCluster ?? "devnet"]: deps.connection };
}

/// The connection a request should use: the cluster it names, else the one this deploy defaults to.
function connectionFor(deps: AppDeps, requested?: unknown): Connection | undefined {
  const map = clusterMap(deps);
  const named = asClusterName(requested);
  if (named && map[named]) return map[named];
  const fallback =
    asClusterName(deps.defaultCluster) ?? (Object.keys(map)[0] as ClusterName | undefined);
  return fallback ? map[fallback] : undefined;
}

/// The connection the vault program lives behind. The registry is read from the chain, not an
/// indexer, which is what lets the hosted app show live vaults with no other service running.
function vaultConnection(deps: AppDeps): Connection | undefined {
  const map = clusterMap(deps);
  const named = deps.vaultCluster ?? "devnet";
  return map[named] ?? map.devnet ?? map["mainnet-beta"] ?? Object.values(map)[0];
}

/// How long a chain read of the vault registry is reused, so a warm instance answers the landing page
/// from memory instead of hitting the RPC on every request.
const VAULT_CACHE_MS = 30_000;
const vaultCache = new Map<string, { at: number; vaults: VaultSummary[] }>();

/// Every vault the program holds, read from `program.account.vault.all()`. `null` on any failure, so a
/// flaky RPC degrades to "no vaults" rather than a 500 on the landing page; a previous successful
/// read is served stale rather than dropped.
async function chainVaults(deps: AppDeps): Promise<VaultSummary[] | null> {
  const connection = vaultConnection(deps);
  if (!connection) return null;
  const key = deps.vaultCluster ?? "devnet";
  const cached = vaultCache.get(key);
  if (cached && Date.now() - cached.at < VAULT_CACHE_MS) return cached.vaults;
  try {
    const provider = readonlyProvider(connection, PublicKey.default);
    const rows = await PerpetuaVaultClient.create(provider).listVaults();
    const vaults = rows.map(({ address, account }) => ({
      address: address.toBase58(),
      pool: account.pool.toBase58(),
      position: account.position.toBase58(),
      shareMint: account.shareMint.toBase58(),
      creator: account.creator.toBase58(),
      totalStaked: account.totalStaked.toString(),
      totalClaimedA: account.totalClaimedA.toString(),
      totalClaimedB: account.totalClaimedB.toString(),
      createdAt: Number(account.createdAt.toString()),
    }));
    vaultCache.set(key, { at: Date.now(), vaults });
    return vaults;
  } catch {
    return cached?.vaults ?? null;
  }
}

/// What the Vaults page shows: the chain's vaults, plus anything an indexer has stored that the chain
/// does not already hold. The chain wins a collision, because it is the authority.
async function mergedVaults(deps: AppDeps): Promise<VaultSummary[]> {
  const [chain, indexed] = await Promise.all([chainVaults(deps), deps.store.listVaults()]);
  if (!chain) return indexed;
  const known = new Set(chain.map((vault) => vault.address));
  return [...chain, ...indexed.filter((vault) => !known.has(vault.address))];
}

/// How far back the activity feed looks, and how long a result is reused. A vault page re-reads every
/// 15s, and without the cache each read would replay the same transactions against the RPC.
const EVENTS_LOOKBACK = 15;
const EVENTS_CACHE_LIMIT = 50;
const EVENTS_CACHE_MS = 20_000;
const eventsCache = new Map<string, { at: number; events: VaultEvent[] }>();

/// A vault's activity feed: what the chain recorded for it, plus anything an indexer has stored that
/// the chain does not already show. Decoded on demand from transaction logs, so no indexer runs.
async function vaultEvents(deps: AppDeps, id: string): Promise<VaultEvent[]> {
  const key = `${deps.vaultCluster ?? "devnet"}:${id}`;
  const cached = eventsCache.get(key);
  if (cached && Date.now() - cached.at < EVENTS_CACHE_MS) return cached.events;

  const indexed = await deps.store.listVaultEvents(id, EVENTS_CACHE_LIMIT);
  let chain: VaultEvent[] = [];
  const connection = vaultConnection(deps);
  if (connection) {
    try {
      chain = await readVaultEvents(connection, new PublicKey(id), EVENTS_LOOKBACK);
    } catch {
      chain = [];
    }
  }

  const seen = new Set(chain.map((event) => `${event.signature}:${event.name}`));
  const merged = [
    ...chain,
    ...indexed.filter((event) => !seen.has(`${event.signature}:${event.name}`)),
  ].sort((a, b) => b.slot - a.slot);
  eventsCache.set(key, { at: Date.now(), events: merged });
  return merged;
}

/// What an account is, told by the program that owns it. Enough to label an address in the UI without
/// sending the visitor to an explorer to find out.
function kindOf(owner: string, size: number): string {
  if (owner === DAMM_V2_PROGRAM) return "pool";
  if (owner === SYSTEM_PROGRAM.toBase58()) return "wallet";
  if (owner === BPF_LOADER) return "program";
  if (TOKEN_PROGRAMS.includes(owner)) return size === 82 ? "mint" : "token account";
  if (owner === SHARE_TOKEN_PROGRAM.toBase58()) return "account";
  return "account";
}

/// Browser origins allowed to call the API, comma-separated in `CORS_ORIGINS`. Development
/// defaults to the local web app; production is same-origin only until a deploy opts in, so the
/// transaction-building routes are not callable from any page on the internet.
function allowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];
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

const pubkey = z.string().min(32).max(44);

/// The fields a token metadata document needs, sized so the `uri` a launch stores on-chain — this
/// endpoint plus its query string — stays well inside the 1232 bytes a Solana transaction may occupy.
/// A longer description or image link has to be hosted by the creator instead, and the launch page
/// says so rather than letting the transaction fail.
///
/// Both a long and a short spelling are accepted (`name`/`n`, `symbol`/`s`, …). The short one is what
/// new launches use because every character of the link is a character the launch transaction cannot
/// spend elsewhere; the long one is kept so tokens whose on-chain `uri` already carries it still
/// resolve.
/// The logo a launch gets when the creator leaves the image field blank. It rides in the document this
/// endpoint serves rather than in the on-chain `uri`, so a token always has an image without making the
/// launch link longer than the 200 characters a launch has to fit into.
const DEFAULT_TOKEN_IMAGE =
  process.env.TOKEN_IMAGE_URL ?? "https://perpetua-meteora.netlify.app/token-default.png";

const metadataQuery = z.object({
  name: z.string().min(1).max(24).optional(),
  n: z.string().min(1).max(24).optional(),
  symbol: z.string().min(1).max(10).optional(),
  s: z.string().min(1).max(10).optional(),
  description: z.string().min(1).max(60).optional(),
  d: z.string().min(1).max(60).optional(),
  image: z.string().url().max(80).optional(),
  i: z.string().url().max(80).optional(),
  external: z.string().url().max(60).optional(),
  e: z.string().url().max(60).optional(),
});

const createVaultBody = z.object({
  creator: pubkey,
  pool: pubkey,
  position: pubkey,
  positionNftMint: pubkey,
  positionNftAccount: pubkey,
  positionNftProgram: pubkey,
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  tokenAProgram: pubkey,
  tokenBProgram: pubkey,
  shareMint: pubkey,
});

const ownerVaultBody = z.object({ owner: pubkey, vault: pubkey });
const stakeBody = ownerVaultBody.extend({ amount: z.string().regex(/^\d+$/) });

const lockedPositionBody = z.object({
  owner: pubkey,
  mintA: pubkey,
  mintB: pubkey,
  positionNft: pubkey,
});

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
  const origins = deps.corsOrigins ?? allowedOrigins();
  if (origins.length > 0) app.use("*", cors({ origin: origins }));

  app.get("/health", (c) => c.json({ ok: true }));

  // The MCP endpoint. An agent connects here over Streamable HTTP and gets the same tools whether
  // it reached the hosted deploy or a local API; the tools call the routes below in process.
  const mcp = createMcpEndpoint(app);
  app.all("/mcp", (c) => mcp(c.req.raw));

  // The vault registry is read from the chain the program is deployed on, so the list is live even
  // with no indexer running; an indexer's store, when present, is merged on top.
  app.get("/v1/vaults", async (c) => c.json({ vaults: await mergedVaults(deps) }));

  app.get("/v1/vaults/:id", async (c) => {
    const id = c.req.param("id");
    const indexed = await deps.store.getVault(id);
    if (indexed) return c.json({ vault: indexed });
    const chain = await chainVaults(deps);
    const found = chain?.find((vault) => vault.address === id);
    if (!found) return c.json({ error: "vault not found" }, 404);
    return c.json({ vault: found });
  });

  // The activity feed is decoded from the chain on demand — the vault's transactions, then the Anchor
  // events inside their logs — so the page shows a real history with no indexer running.
  app.get("/v1/vaults/:id/events", async (c) => {
    const parsed = limitQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const events = await vaultEvents(deps, c.req.param("id"));
    return c.json({ events: events.slice(0, parsed.data.limit) });
  });

  // Read from the DAMM v2 program rather than Meteora's data API. The data API does expose wallet
  // endpoints (`/wallets/{wallet}/open_positions`), but it indexes mainnet only, while this app runs
  // on devnet by default — and the chain is the authority on which positions exist regardless.
  app.get("/v1/positions/:wallet", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    try {
      const adapter = new DammV2Adapter(connection);
      const positions = await adapter.walletPositions(new PublicKey(c.req.param("wallet")));
      return c.json({ positions });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "lookup failed" }, 400);
    }
  });

  // On-chain position detail straight from the DAMM v2 program, including the derived NFT token
  // account, the token programs and `evaluateEligibility`'s verdict on whether the position can
  // be securitized as-is.
  app.get("/v1/positions/:wallet/onchain", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    try {
      const adapter = new DammV2Adapter(connection);
      const positions = await adapter.walletPositionDetails(new PublicKey(c.req.param("wallet")));
      return c.json({
        positions: positions.map((position) => ({
          ...position,
          eligibility: evaluateEligibility({
            unlocked: BigInt(position.unlockedLiquidity),
            vested: BigInt(position.vestedLiquidity),
            permanentLocked: BigInt(position.permanentLockedLiquidity),
          }),
        })),
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "lookup failed" }, 400);
    }
  });

  app.get("/v1/valuation/:position", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

    const position = c.req.param("position");
    const pool = parsed.data.pool ?? (await deps.store.getPositionPool(position));
    if (!pool) return c.json({ error: "unknown pool; pass ?pool=" }, 400);

    try {
      const result = await pricePool(deps, pool, parsed.data);
      return c.json({ position, valuation: serialize(result) });
    } catch (error) {
      const { status, body } = priceError(error);
      return c.json(body, status);
    }
  });

  app.get("/v1/dbc/preset", (c) => {
    const parsed = presetQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const preset = buildFinanceablePreset(parsed.data);
    return c.json({ preset, validation: validatePreset(preset) });
  });

  app.get("/v1/pools/:pool/series", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      const series = await deps.dataApi.poolDaily(c.req.param("pool"), parsed.data.days);
      return c.json({ series });
    } catch (error) {
      return c.json({ error: dataApiError(error) }, 502);
    }
  });

  app.get("/v1/pools/:pool/yield", async (c) => {
    const parsed = valuationQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      const result = await pricePool(deps, c.req.param("pool"), parsed.data);
      return c.json({ valuation: serialize(result) });
    } catch (error) {
      const { status, body } = priceError(error);
      return c.json(body, status);
    }
  });

  /// Which clusters this deploy can reach, so the UI offers them instead of guessing.
  app.get("/v1/clusters", (c) =>
    c.json({
      default: asClusterName(deps.defaultCluster) ?? Object.keys(clusterMap(deps))[0] ?? "devnet",
      available: Object.keys(clusterMap(deps)),
    }),
  );

  /// Where an address lives, and what it is. A pool, a wallet, a mint and a vault are all just
  /// accounts; only one cluster has the account at all, and the owner program says which kind it is.
  /// The pages use this to name the network under an address and link the explorer that finds it.
  app.get("/v1/where/:address", async (c) => {
    let key: PublicKey;
    try {
      key = new PublicKey(c.req.param("address"));
    } catch {
      return c.json({ error: "that is not a Solana address" }, 400);
    }

    const found: Array<{ cluster: ClusterName; owner: string; kind: string }> = [];
    /// Mainnet first. An address can exist on both clusters — wrapped SOL does — and when it does, the
    /// mainnet one is the meaningful answer: a devnet copy is usually a fixture of the same token.
    const order = (["mainnet-beta", "devnet"] as ClusterName[]).filter(
      (name) => clusterMap(deps)[name],
    );
    for (const cluster of order) {
      const connection = clusterMap(deps)[cluster];
      if (!connection) continue;
      const info = await connection.getAccountInfo(key).catch(() => null);
      if (!info) continue;
      const owner = info.owner.toBase58();
      found.push({ cluster, owner, kind: kindOf(owner, info.data.length) });
    }

    if (found.length === 0) {
      return c.json({ address: key.toBase58(), cluster: null, kind: "unknown", found: [] });
    }
    return c.json({ address: key.toBase58(), ...found[0], found });
  });

  /// The token metadata document wallets read, built here from the fields a creator typed. Hosting it
  /// is the difference between a launch that needs someone to publish a JSON file somewhere first and
  /// a launch that is one form: every field the document needs travels in this URL, and the URL is
  /// what the pool stores on-chain as the token's `uri`.
  ///
  /// Served at both spellings: the long path for readability, and the short `/v1/t` + one-letter keys
  /// that a launch actually links to, because the whole link lives inside the launch transaction.
  app.get("/v1/token/metadata", tokenMetadataDocument);
  app.get("/v1/t", tokenMetadataDocument);

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

  app.get("/v1/sale/presets", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    try {
      return c.json({ presets: await listDlmmPresets(connection) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  const openSaleBody = z.object({
    owner: pubkey,
    shareMint: pubkey,
    quoteMint: pubkey,
    presetParameter: pubkey,
    binStep: z.coerce.number().int().min(1).max(400),
    baseFactor: z.string().regex(/^\d+$/),
    initialPrice: z.coerce.number().gt(0),
  });

  app.post("/v1/tx/open-sale", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = openSaleBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json(await buildOpenSale(connection, parsed.data));
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  const seedLadderBody = z.object({
    owner: pubkey,
    poolAddress: pubkey,
    shareMint: pubkey,
    quoteMint: pubkey,
    positionPubKey: pubkey,
    binStep: z.coerce.number().int().min(1).max(400),
    plan: z.object({
      bins: z.array(z.object({ index: z.number(), priceUsd: z.number(), shares: z.number() })),
      rangeLowUsd: z.number(),
      rangeHighUsd: z.number(),
      totalOfferShares: z.number(),
      weightedAveragePriceUsd: z.number(),
    }),
  });

  app.post("/v1/tx/seed-ladder", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = seedLadderBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json(await buildSeedLadder(connection, parsed.data));
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  const createMintBody = z.object({
    payer: pubkey,
    mint: pubkey,
    decimals: z.coerce.number().int().min(0).max(9),
  });

  app.post("/v1/tx/create-mint", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = createMintBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({ transaction: await buildCreateMint(connection, parsed.data) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  const launchBody = z.object({
    creator: pubkey,
    config: pubkey,
    baseMint: pubkey,
    quoteMint: pubkey,
    feeClaimer: pubkey,
    leftoverReceiver: pubkey,
    name: z.string().min(1).max(32),
    symbol: z.string().min(1).max(10),
    uri: z.string().min(1).max(200),
    totalTokenSupply: z.coerce.number().int().gt(0),
    creatorTradingFeePercentage: z.coerce.number().min(0).max(100),
    partnerLiquidityPercentage: z.coerce.number().min(0).max(100),
    partnerPermanentLockedLiquidityPercentage: z.coerce.number().min(0).max(100),
    creatorLiquidityPercentage: z.coerce.number().min(0).max(100),
    creatorPermanentLockedLiquidityPercentage: z.coerce.number().min(0).max(100),
  });

  app.post("/v1/tx/launch", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = launchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json(await buildLaunch(connection, parsed.data));
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/create-locked-position", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = lockedPositionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json(await buildLockedPosition(connection, parsed.data));
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/create-vault", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = createVaultBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({ transaction: await buildCreateVault(connection, parsed.data) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/crank-claim", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = ownerVaultBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({
        transaction: await buildCrankClaim(connection, {
          caller: parsed.data.owner,
          vault: parsed.data.vault,
        }),
      });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/stake", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = stakeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({ transaction: await buildStake(connection, parsed.data) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/unstake", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = stakeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({ transaction: await buildUnstake(connection, parsed.data) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/unstake-no-claim", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = stakeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({ transaction: await buildUnstakeNoClaim(connection, parsed.data) });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.post("/v1/tx/harvest", async (c) => {
    const connection = connectionFor(deps, c.req.query("cluster"));
    if (!connection) return c.json({ error: "rpc connection is not configured" }, 503);
    const parsed = ownerVaultBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    try {
      return c.json({
        transaction: await buildHarvest(connection, {
          owner: parsed.data.owner,
          vault: parsed.data.vault,
        }),
      });
    } catch (error) {
      const { status, message } = chainError(error);
      return c.json({ error: message }, status);
    }
  });

  app.get("/v1/stats", async (c) => {
    const [stored, chain] = await Promise.all([deps.store.stats(), chainVaults(deps)]);
    const live = chain?.length ?? 0;
    // Counts come from the chain when no indexer has already totalled them.
    return c.json({
      stats: {
        ...stored,
        vaults: Math.max(stored.vaults, live),
        positionsSecuritized: Math.max(stored.positionsSecuritized, live),
      },
    });
  });

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

/// The token metadata document wallets read. Built from the query string, so a creator fills in a form
/// and the token has metadata — nobody has to publish a JSON file first. Accepts the long field names
/// and the short ones the launch page links with.
function tokenMetadataDocument(c: Context): Response {
  const parsed = metadataQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

  const name = parsed.data.name ?? parsed.data.n;
  const symbol = parsed.data.symbol ?? parsed.data.s;
  const description = parsed.data.description ?? parsed.data.d;
  if (!name || !symbol || !description) {
    return c.json({ error: "metadata needs a name, a symbol and a description" }, 400);
  }

  const external = parsed.data.external ?? parsed.data.e;
  // A blank image falls back to the default logo, so a launch with no hosted art still renders.
  const image = parsed.data.image ?? parsed.data.i ?? DEFAULT_TOKEN_IMAGE;

  return c.json(
    {
      name,
      symbol,
      description,
      image,
      ...(external ? { external_url: external } : {}),
      properties: { files: [{ uri: image, type: "image" }], category: "image" },
    },
    200,
    { "cache-control": "public, max-age=31536000, immutable" },
  );
}

/// The data API is the only source of fee history. When it is unreachable, or has nothing for the
/// pool, say so — a stand-in series is indistinguishable from a real one once it reaches a chart.
function dataApiError(error: unknown): string {
  return error instanceof Error ? error.message : "data api request failed";
}

/// A pool the data API knows about, but which has not completed a single day yet. There is no fee
/// stream to price, and answering "0" would read as "worthless" rather than "not yet".
class NoHistoryError extends Error {}

/// 404 for an address the data API has never heard of, 422 for a pool we cannot price yet, and 502
/// for an upstream that let us down. They are different things and the caller should be able to tell
/// them apart: only the first two mean "look at the address".
function priceError(error: unknown): { status: 404 | 422 | 502; body: { error: string } } {
  if (error instanceof NoHistoryError) return { status: 422, body: { error: error.message } };
  const message = dataApiError(error);
  if (/failed with 404/.test(message)) {
    return { status: 404, body: { error: "no Meteora pool at that address" } };
  }
  return { status: 502, body: { error: message } };
}

/// The transaction builders read the chain — a blockhash, the config account, the vault account — so
/// they fail for three very different reasons: the request asks for something that cannot work (a
/// stake that does not exist, a transaction too large for the network), the request names something
/// that is not there, or the RPC itself is unhappy. Each gets its own status and its own sentence,
/// because the pages word their errors per cause.
function chainError(error: unknown): { status: 400 | 502; message: string } {
  if (error instanceof BuilderError) return { status: error.status, message: error.message };
  const message = error instanceof Error ? error.message : "could not build the transaction";
  const missing = /does not exist|no data|could not find|not found|invalid public key/i.test(
    message,
  );
  return { status: missing ? 400 : 502, message };
}

async function pricePool(
  deps: AppDeps,
  pool: string,
  query: z.infer<typeof valuationQuery>,
): Promise<ValuationResult> {
  const series = await deps.dataApi.poolDaily(pool, query.days);
  if (series.days.length === 0) {
    throw new NoHistoryError(`${pool} has no complete day of fee history yet`);
  }
  const risk = (await deps.store.getPoolRisk(pool)) ?? DEFAULT_RISK;
  const input: ValuationInput = {
    pool,
    liquidityShare: query.liquidityShare,
    protocolFeeBps: query.protocolFeeBps,
    discountRateAnnual: query.discountRate,
    horizonDays: query.horizonDays,
    series,
    risk: {
      ...risk,
      // However old the stored record claims the pool is, it cannot be older than the history we
      // actually observed — otherwise a two-day-old pool is priced as though it were a month old.
      poolAgeDays: Math.min(risk.poolAgeDays, series.days.length),
      liquidityUsd: risk.liquidityUsd || (series.liquidityUsd.at(-1) ?? 0),
    },
  };
  return valuePosition(input);
}
