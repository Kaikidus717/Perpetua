import type { PoolDailySeries } from "@perpetua/shared";
import type { DataApiPort } from "../ports.js";

/// The volume-history endpoint buckets by whole UTC days at `timeframe=24h`.
const SECONDS_PER_DAY = 86_400;

/// `GET /pools/{address}/volume/history`. Each bucket carries the fees *and* the volume for that
/// day, so one call produces the entire series the valuation model fits.
export interface VolumeHistoryResponse {
  start_time: number;
  end_time: number;
  timeframe?: string | null;
  data: Array<{
    timestamp: number;
    timestamp_str?: string;
    volume: number;
    fees: number;
    protocol_fees: number;
  }>;
}

/// `GET /pools/{address}`. Only `tvl` and `created_at` are used here.
export interface PoolResponse {
  address: string;
  tvl: number;
  created_at: number;
}

export interface NormalizeOptions {
  pool: string;
  /// Current pool TVL. The API reports one current figure rather than a per-day history, so every
  /// bucket carries today's; that is what the `low_liquidity` risk flag reads.
  tvlUsd: number;
  /// Pool creation, in milliseconds — the API returns this field as a millisecond epoch.
  createdAtMs: number;
  nowSeconds: number;
  days: number;
}

/// Turns raw buckets into the column-oriented series the model fits.
///
/// Two kinds of bucket are dropped on purpose:
///
/// * **Before the pool existed.** Those days are not days with zero fees, they are not days at all,
///   and leaving them in reads as fees growing out of nothing.
/// * **The bucket still in flight.** Its fees are a partial day, and a partial trailing day reads as
///   a collapse in the decay fit.
export function normalizePoolDaily(
  raw: VolumeHistoryResponse,
  options: NormalizeOptions,
): PoolDailySeries {
  const createdSeconds = Math.floor(options.createdAtMs / 1_000);
  const rows = [...(raw.data ?? [])]
    .filter((row) => row.timestamp >= createdSeconds)
    .filter((row) => row.timestamp + SECONDS_PER_DAY <= options.nowSeconds)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-options.days);

  return {
    pool: options.pool,
    days: rows.map((_, index) => index + 1),
    feesUsd: rows.map((row) => row.fees),
    volumeUsd: rows.map((row) => row.volume),
    liquidityUsd: rows.map(() => options.tvlUsd),
  };
}

export interface MeteoraDataApiConfig {
  baseUrl: string;
  fetchFn?: typeof fetch;
  /// Injectable clock, so tests do not depend on wall time.
  now?: () => number;
}

/// Live fee history from Meteora's DAMM v2 data API — the only source this project prices from.
///
/// The paths come from the published OpenAPI spec (`https://damm-v2.datapi.meteora.ag/swagger-ui/`):
/// `/pools`, `/pools/{address}`, `/pools/{address}/ohlcv` and `/pools/{address}/volume/history`.
/// The API also exposes wallet endpoints (`/wallets/{wallet}/open_positions`, `/wallets/{wallet}/total`
/// and friends), but it indexes mainnet only, so positions are read from the chain instead — see
/// `DammV2Adapter`. That keeps the devnet flows working, and custody decisions should not rest on an
/// indexer when the chain can answer directly.
///
/// Every failure is thrown, never absorbed. An unreachable endpoint has to surface as an error,
/// because the alternative is a number that looks live and is not.
export class MeteoraDataApi implements DataApiPort {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(config: MeteoraDataApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => Date.now());
  }

  async poolDaily(pool: string, days: number): Promise<PoolDailySeries> {
    const nowSeconds = Math.floor(this.now() / 1_000);
    const startSeconds = nowSeconds - days * SECONDS_PER_DAY;

    const [history, detail] = await Promise.all([
      this.get<VolumeHistoryResponse>(
        `/pools/${pool}/volume/history?timeframe=24h&start_time=${startSeconds}&end_time=${nowSeconds}`,
      ),
      this.get<PoolResponse>(`/pools/${pool}`),
    ]);

    return normalizePoolDaily(history, {
      pool,
      tvlUsd: detail.tvl ?? 0,
      createdAtMs: detail.created_at ?? 0,
      nowSeconds,
      days,
    });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`data api ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }
}
