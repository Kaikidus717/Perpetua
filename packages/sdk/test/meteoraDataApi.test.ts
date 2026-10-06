import { describe, expect, it } from "vitest";
import {
  MeteoraDataApi,
  type VolumeHistoryResponse,
  normalizePoolDaily,
} from "../src/data/meteoraDataApi.js";

const DAY = 86_400;
const POOL = "Pool1111111111111111111111111111111111111111";
/// 2026-01-01T00:00:00Z, the pool's creation.
const CREATED_MS = 1_767_225_600_000;
const CREATED_S = Math.floor(CREATED_MS / 1_000);
/// Five days of history.
const NOW_S = CREATED_S + 5 * DAY;

function buckets(fees: number[], startSeconds: number): VolumeHistoryResponse {
  return {
    start_time: startSeconds,
    end_time: startSeconds + fees.length * DAY,
    timeframe: "24h",
    data: fees.map((fee, index) => ({
      timestamp: startSeconds + index * DAY,
      volume: fee * 10,
      fees: fee,
      protocol_fees: fee / 4,
    })),
  };
}

describe("normalizePoolDaily", () => {
  it("projects buckets into the model's columns and repeats the current TVL", () => {
    const series = normalizePoolDaily(buckets([100, 90, 80], CREATED_S), {
      pool: POOL,
      tvlUsd: 1234,
      createdAtMs: CREATED_MS,
      nowSeconds: NOW_S,
      days: 30,
    });

    expect(series.pool).toBe(POOL);
    expect(series.days).toEqual([1, 2, 3]);
    expect(series.feesUsd).toEqual([100, 90, 80]);
    expect(series.volumeUsd).toEqual([1000, 900, 800]);
    expect(series.liquidityUsd).toEqual([1234, 1234, 1234]);
  });

  it("drops buckets that predate the pool", () => {
    const series = normalizePoolDaily(buckets([777, 777, 100, 90], CREATED_S - 2 * DAY), {
      pool: POOL,
      tvlUsd: 10,
      createdAtMs: CREATED_MS,
      nowSeconds: NOW_S,
      days: 30,
    });

    expect(series.feesUsd).toEqual([100, 90]);
  });

  it("drops the bucket that is still in flight", () => {
    const history = buckets([100, 90], CREATED_S);
    history.data.push({
      timestamp: NOW_S - 3_600,
      volume: 5,
      fees: 5,
      protocol_fees: 1,
    });

    const series = normalizePoolDaily(history, {
      pool: POOL,
      tvlUsd: 10,
      createdAtMs: CREATED_MS,
      nowSeconds: NOW_S,
      days: 30,
    });

    expect(series.feesUsd).toEqual([100, 90]);
  });

  it("keeps only the trailing window", () => {
    const series = normalizePoolDaily(buckets([1, 2, 3, 4, 5], CREATED_S), {
      pool: POOL,
      tvlUsd: 10,
      createdAtMs: CREATED_MS,
      nowSeconds: NOW_S,
      days: 2,
    });

    expect(series.feesUsd).toEqual([4, 5]);
  });

  it("returns an empty series for a pool younger than a day", () => {
    const series = normalizePoolDaily(buckets([500], CREATED_S), {
      pool: POOL,
      tvlUsd: 10,
      createdAtMs: CREATED_MS,
      nowSeconds: CREATED_S + 3_600,
      days: 30,
    });

    expect(series.feesUsd).toEqual([]);
    expect(series.days).toEqual([]);
  });
});

describe("MeteoraDataApi", () => {
  it("calls the documented volume-history endpoint and normalizes what comes back", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      const body = url.includes("/volume/history")
        ? buckets([10, 8, 6], CREATED_S)
        : { address: POOL, tvl: 5000, created_at: CREATED_MS };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const api = new MeteoraDataApi({
      baseUrl: "https://example.test/",
      fetchFn,
      now: () => NOW_S * 1_000,
    });
    const series = await api.poolDaily(POOL, 30);

    expect(calls).toContain(
      `https://example.test/pools/${POOL}/volume/history?timeframe=24h&start_time=${
        NOW_S - 30 * DAY
      }&end_time=${NOW_S}`,
    );
    expect(calls).toContain(`https://example.test/pools/${POOL}`);
    expect(series.feesUsd).toEqual([10, 8, 6]);
    expect(series.liquidityUsd).toEqual([5000, 5000, 5000]);
  });

  it("throws on a non-ok response instead of returning placeholder rows", async () => {
    const fetchFn = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const api = new MeteoraDataApi({ baseUrl: "https://example.test", fetchFn });
    await expect(api.poolDaily(POOL, 7)).rejects.toThrow(/500/);
  });
});
