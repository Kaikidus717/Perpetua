import type { DataApiPort } from "@perpetua/sdk";
import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";

export interface PoolDailyResponse {
  pool: string;
  data: Array<{ day: number; feesUsd: number; volumeUsd: number; liquidityUsd: number }>;
}

export interface PositionResponse {
  positions: PositionSummary[];
}

export function normalizePoolDaily(raw: PoolDailyResponse): PoolDailySeries {
  const sorted = [...raw.data].sort((a, b) => a.day - b.day);
  return {
    pool: raw.pool,
    days: sorted.map((row) => row.day),
    feesUsd: sorted.map((row) => row.feesUsd),
    volumeUsd: sorted.map((row) => row.volumeUsd),
    liquidityUsd: sorted.map((row) => row.liquidityUsd),
  };
}

export interface MeteoraDataApiConfig {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class MeteoraDataApi implements DataApiPort {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: MeteoraDataApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async poolDaily(pool: string, days: number): Promise<PoolDailySeries> {
    const raw = await this.get<PoolDailyResponse>(`/pools/${pool}/daily?days=${days}`);
    return normalizePoolDaily(raw);
  }

  async walletPositions(wallet: string): Promise<PositionSummary[]> {
    const raw = await this.get<PositionResponse>(`/wallets/${wallet}/positions`);
    return raw.positions;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`data api ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }
}
