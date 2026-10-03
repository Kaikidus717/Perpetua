import type { PoolDailySeries } from "@perpetua/shared";
import { describe, expect, it } from "vitest";
import { StaticDataApi } from "../src/data/staticDataApi.js";

const series: PoolDailySeries = {
  pool: "Pool1111111111111111111111111111111111111111",
  days: [1, 2, 3, 4, 5, 6, 7, 8],
  feesUsd: [80, 70, 60, 50, 40, 30, 20, 10],
  volumeUsd: [1, 1, 1, 1, 1, 1, 1, 1],
  liquidityUsd: [1, 1, 1, 1, 1, 1, 1, 1],
};

describe("StaticDataApi", () => {
  it("returns only the trailing window", async () => {
    const api = new StaticDataApi(new Map([[series.pool, series]]));
    const window = await api.poolDaily(series.pool, 3);
    expect(window.feesUsd).toEqual([30, 20, 10]);
    expect(window.days).toEqual([6, 7, 8]);
  });

  it("throws for unknown pools and returns empty position lists", async () => {
    const api = new StaticDataApi(new Map());
    await expect(api.poolDaily("missing", 7)).rejects.toThrow(/unknown pool/);
    expect(await api.walletPositions("wallet")).toEqual([]);
  });
});
