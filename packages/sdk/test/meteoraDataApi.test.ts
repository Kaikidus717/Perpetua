import { describe, expect, it } from "vitest";
import { MeteoraDataApi, normalizePoolDaily } from "../src/data/meteoraDataApi.js";

describe("normalizePoolDaily", () => {
  it("sorts rows by day and projects to series columns", () => {
    const series = normalizePoolDaily({
      pool: "pool",
      data: [
        { day: 2, feesUsd: 20, volumeUsd: 200, liquidityUsd: 2000 },
        { day: 1, feesUsd: 10, volumeUsd: 100, liquidityUsd: 1000 },
      ],
    });
    expect(series.days).toEqual([1, 2]);
    expect(series.feesUsd).toEqual([10, 20]);
    expect(series.liquidityUsd).toEqual([1000, 2000]);
  });
});

describe("MeteoraDataApi", () => {
  it("requests the configured endpoint and normalizes the payload", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          pool: "p",
          data: [{ day: 1, feesUsd: 3, volumeUsd: 4, liquidityUsd: 5 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const api = new MeteoraDataApi({ baseUrl: "https://example.test/", fetchFn });
    const series = await api.poolDaily("p", 7);
    expect(calls[0]).toBe("https://example.test/pools/p/daily?days=7");
    expect(series.feesUsd).toEqual([3]);
  });

  it("reads wallet positions from the wallet endpoint", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ positions: [{ address: "pos" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const api = new MeteoraDataApi({ baseUrl: "https://example.test", fetchFn });
    const positions = await api.walletPositions("wallet");
    expect(calls[0]).toBe("https://example.test/wallets/wallet/positions");
    expect(positions).toEqual([{ address: "pos" }]);
  });

  it("throws on a non-ok response instead of returning placeholder rows", async () => {
    const fetchFn = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const api = new MeteoraDataApi({ baseUrl: "https://example.test", fetchFn });
    await expect(api.poolDaily("p", 7)).rejects.toThrow(/500/);
  });
});
