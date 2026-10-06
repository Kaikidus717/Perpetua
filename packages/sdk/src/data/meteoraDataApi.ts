import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";
import type { DataApiPort } from "../ports.js";

/// The rows Meteora's data API returns for `GET /pools/:pool/daily`.
export interface PoolDailyResponse {
  pool: string;
  data: Array<{ day: number; feesUsd: number; volumeUsd: number; liquidityUsd: number }>;
}

export interface PositionResponse {
  positions: PositionSummary[];
}

/// Rows are keyed by `day` and arrive in whatever order the endpoint chose. The model wants ascending
/// columns that line up index-by-index (`feesUsd[3]` belongs to `days[3]`), so sort once here rather
/// than trusting every caller to.
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

/// Live fee history and wallet positions from Meteora's data API — the only source this project
/// prices from.
///
/// Every failure is thrown, never absorbed. A stale or unreachable endpoint has to surface as an
/// error, because the alternative is a number that looks live and is not; a placeholder fee stream
/// is indistinguishable from a real one once it reaches a chart.
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
