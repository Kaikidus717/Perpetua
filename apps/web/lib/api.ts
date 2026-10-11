import type {
  PoolDailySeries,
  PositionSummary,
  RiskFlag,
  StatsSummary,
  VaultEvent,
  VaultSummary,
} from "@perpetua/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/// The clusters this app serves. A wallet, a pool and a vault each live on exactly one of them, so
/// anything that shows or signs for an address has to know which one it is.
export type ClusterName = "devnet" | "mainnet-beta";

export const CLUSTER_LABEL: Record<ClusterName, string> = {
  devnet: "devnet",
  "mainnet-beta": "mainnet",
};

/// Where an address lives and what it is, as the API sees it. `cluster` is null when nothing owns it
/// on either cluster, which is how the pages tell "wrong address" from "wrong network".
export interface AddressLocation {
  address: string;
  cluster: ClusterName | null;
  kind: string;
  owner?: string;
  found: Array<{ cluster: ClusterName; owner: string; kind: string }>;
}

/// The `uri` a launch stores on-chain: this app's own metadata document, with every field wallets
/// need carried in the query string. A creator fills in a form and the token has metadata — nobody has
/// to go and publish a JSON file first.
export function metadataUri(fields: {
  name: string;
  symbol: string;
  description: string;
  /// Optional. Leave it blank and the metadata endpoint fills in the default logo, so a launch never
  /// needs a hosted image before it works.
  image?: string;
  external?: string;
}): string {
  const search = new URLSearchParams({
    name: fields.name,
    symbol: fields.symbol,
    description: fields.description,
  });
  if (fields.image) search.set("image", fields.image);
  if (fields.external) search.set("external", fields.external);
  return `${apiBase()}/v1/token/metadata?${search.toString()}`;
}

/// One build, either cluster. Visiting any page with `?api=<url>` pins the API base in the browser
/// (stored in `localStorage`), so the same deployment — or the same local build — can point at
/// devnet or mainnet without a rebuild. Falls back to `NEXT_PUBLIC_API_URL`.
const API_OVERRIDE_KEY = "perpetua.apiBase";

export function apiBase(): string {
  if (typeof window === "undefined") return API_URL;
  try {
    const override = new URLSearchParams(window.location.search).get("api");
    if (override) {
      const trimmed = override.replace(/\/$/, "");
      window.localStorage.setItem(API_OVERRIDE_KEY, trimmed);
      return trimmed;
    }
    return window.localStorage.getItem(API_OVERRIDE_KEY) ?? API_URL;
  } catch {
    return API_URL;
  }
}

export interface ScenarioView {
  scenario: { name: "bear" | "base" | "bull"; lambda: number; volumeMultiplier: number };
  presentValueUsd: number;
  fairValuePerShareUsd: number;
  paybackDays: number;
}

export interface ValuationView {
  pool: string;
  fairValueUsd: number;
  fairValueRangeUsd: { low: number; base: number; high: number };
  fairValuePerShareUsd: number;
  impliedAprAtFairValue: number;
  scenarios: ScenarioView[];
  riskFlags: RiskFlag[];
}

export interface LadderView {
  bins: Array<{ index: number; priceUsd: number; shares: number }>;
  rangeLowUsd: number;
  rangeHighUsd: number;
  totalOfferShares: number;
  weightedAveragePriceUsd: number;
}

export interface OnchainPosition {
  address: string;
  pool: string;
  nftMint: string;
  nftAccount: string;
  positionNftProgram: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAProgram: string;
  tokenBProgram: string;
  unlockedLiquidity: string;
  vestedLiquidity: string;
  permanentLockedLiquidity: string;
  feeAPending: string;
  feeBPending: string;
  eligibility: { eligible: boolean; reasons: string[] };
}

export interface ValuationParams {
  liquidityShare?: number;
  protocolFeeBps?: number;
  discountRate?: number;
  horizonDays?: number;
  days?: number;
}

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" || typeof value === "string") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/// An HTTP failure that keeps its status, so a page can tell "that address is not a pool" (404), "a
/// pool with no fee history yet" (422) and "the service is having a moment" (500s) apart — and say
/// something useful about each.

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

/// A failed request that keeps its status code, so a page can tell "that address is not a pool"
/// (404, or 422 for a pool with no fee history yet) from "the service is having a moment" (500s and
/// network failures) — and say something useful either way.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

/// True when the request failed because of what was asked for, rather than because the service is
/// down. Those are the cases worth telling a visitor to check their address.
export function isAddressProblem(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 422);
}

/// The HTTP status behind a failed call, when there was one. Pages that word their errors per cause
/// need to tell 404 from 422 from a 502, and the message alone does not carry that.
export function apiStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export const api = {
  preset: (params: {
    creatorTradingFeePct?: number;
    creatorLiquidityPct?: number;
    partnerLiquidityPct?: number;
    lockedPct?: number;
  }) =>
    get<{ preset: unknown; validation: { valid: boolean; errors: string[] } }>(
      `/v1/dbc/preset${query(params)}`,
    ),
  vaults: () => get<{ vaults: VaultSummary[] }>("/v1/vaults"),
  vault: (id: string) => get<{ vault: VaultSummary }>(`/v1/vaults/${id}`),
  events: (id: string, limit = 25) =>
    get<{ events: VaultEvent[] }>(`/v1/vaults/${id}/events?limit=${limit}`),
  valuation: (pool: string, params: ValuationParams = {}) =>
    get<{ valuation: ValuationView }>(`/v1/pools/${pool}/yield${query(params)}`),
  series: (pool: string, days = 30) =>
    get<{ series: PoolDailySeries }>(`/v1/pools/${pool}/series?days=${days}`),
  ladder: (fairValuePerShareUsd: number, totalShares = 1_000_000) =>
    get<{ plan: LadderView }>(`/v1/sale/plan${query({ fairValuePerShareUsd, totalShares })}`),
  salePresets: () =>
    get<{ presets: Array<{ address: string; binStep: number; baseFactor: string }> }>(
      "/v1/sale/presets",
    ),
  stats: () => get<{ stats: StatsSummary }>("/v1/stats"),
  positions: (wallet: string, cluster?: ClusterName) =>
    get<{ positions: PositionSummary[] }>(
      `/v1/positions/${wallet}${cluster ? `?cluster=${cluster}` : ""}`,
    ),
  positionsOnchain: (wallet: string, cluster?: ClusterName) =>
    get<{ positions: OnchainPosition[] }>(
      `/v1/positions/${wallet}/onchain${cluster ? `?cluster=${cluster}` : ""}`,
    ),
  clusters: () => get<{ default: ClusterName; available: ClusterName[] }>("/v1/clusters"),
  where: (address: string) => get<AddressLocation>(`/v1/where/${address}`),
};
