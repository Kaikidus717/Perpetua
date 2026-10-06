import type { PoolDailySeries } from "@perpetua/shared";
import type { DataApiPort } from "../ports.js";

function tail<T>(values: T[], days: number): T[] {
  return days >= values.length ? values : values.slice(values.length - days);
}

export class StaticDataApi implements DataApiPort {
  constructor(private readonly pools: Map<string, PoolDailySeries>) {}

  async poolDaily(pool: string, days: number): Promise<PoolDailySeries> {
    const series = this.pools.get(pool);
    if (!series) throw new Error(`unknown pool ${pool}`);
    return {
      pool,
      days: tail(series.days, days),
      feesUsd: tail(series.feesUsd, days),
      volumeUsd: tail(series.volumeUsd, days),
      liquidityUsd: tail(series.liquidityUsd, days),
    };
  }
}
