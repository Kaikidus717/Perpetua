import type {
  PoolDailySeries,
  PositionSummary,
  RiskFlag,
  StatsSummary,
  VaultEvent,
  VaultSummary,
} from "@perpetua/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

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

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return (await response.json()) as T;
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
  stats: () => get<{ stats: StatsSummary }>("/v1/stats"),
  positions: (wallet: string) => get<{ positions: PositionSummary[] }>(`/v1/positions/${wallet}`),
  positionsOnchain: (wallet: string) =>
    get<{ positions: OnchainPosition[] }>(`/v1/positions/${wallet}/onchain`),
};
