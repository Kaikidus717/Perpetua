import { describe, expect, it, vi } from "vitest";
import { isRetryableStatus, resilientFetch, rpcEndpoints } from "../src/rpc.js";

const PUBLIC_DEVNET = "https://api.devnet.solana.com";

function reply(status: number, headers: Record<string, string> = {}): Response {
  return new Response("{}", { status, headers });
}

describe("rpcEndpoints", () => {
  it("falls back to the cluster's built-in endpoint", () => {
    expect(rpcEndpoints("devnet", {})).toEqual([PUBLIC_DEVNET]);
    expect(rpcEndpoints("localnet", {})).toEqual(["http://127.0.0.1:8899"]);
  });

  it("takes RPC_URLS as the whole list, so a private endpoint replaces the public one", () => {
    expect(rpcEndpoints("devnet", { RPC_URLS: "https://a.example, https://b.example" })).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("lets RPC_URL win the first attempt without dropping the fallbacks", () => {
    expect(
      rpcEndpoints("devnet", { RPC_URL: "https://primary.example", RPC_URLS: "https://b.example" }),
    ).toEqual(["https://primary.example", "https://b.example"]);
  });

  it("de-duplicates an endpoint that appears twice", () => {
    expect(
      rpcEndpoints("devnet", { RPC_URL: "https://a.example", RPC_URLS: "https://a.example" }),
    ).toEqual(["https://a.example"]);
  });
});

describe("isRetryableStatus", () => {
  it("retries rate limits, timeouts and server faults only", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("resilientFetch", () => {
  const noSleep = () => Promise.resolve();

  it("passes a healthy response through on the first attempt", async () => {
    const fetchFn = vi.fn(async () => reply(200));
    const doFetch = resilientFetch([PUBLIC_DEVNET], { fetchFn, sleep: noSleep });

    const response = await doFetch(`${PUBLIC_DEVNET}/`);

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails over to the next endpoint after a 429", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://a.example") ? reply(429) : reply(200),
    );
    const doFetch = resilientFetch(["https://a.example", "https://b.example"], {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    const response = await doFetch("https://a.example/");

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain("https://b.example");
  });

  it("keeps the path and query when it rotates the endpoint", async () => {
    const fetchFn = vi.fn(async () => reply(200));
    const doFetch = resilientFetch(["https://a.example", "https://b.example"], {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    await doFetch("https://a.example/?commitment=confirmed");

    expect(fetchFn).toHaveBeenCalledWith("https://a.example/?commitment=confirmed", undefined);
  });

  it("uses an endpoint that carries its own query verbatim, so a provider key survives", async () => {
    const fetchFn = vi.fn(async () => reply(200));
    const doFetch = resilientFetch(["https://devnet.helius-rpc.com/?api-key=SECRET"], {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    await doFetch("https://api.devnet.solana.com/");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://devnet.helius-rpc.com/?api-key=SECRET",
      undefined,
    );
  });

  it("retries a thrown connection error, which is what public devnet does under load", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return reply(200);
    });
    const doFetch = resilientFetch([PUBLIC_DEVNET], {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    await expect(doFetch(`${PUBLIC_DEVNET}/`)).resolves.toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("honours Retry-After instead of its own backoff", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn(async () => reply(429, { "retry-after": "3" }));
    const doFetch = resilientFetch([PUBLIC_DEVNET], {
      fetchFn: fetchFn as unknown as typeof fetch,
      attempts: 2,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });

    await expect(doFetch(`${PUBLIC_DEVNET}/`)).rejects.toThrow();
    expect(sleeps).toEqual([3_000]);
  });

  it("gives up after the attempt budget and reports the last failure", async () => {
    const fetchFn = vi.fn(async () => reply(503));
    const doFetch = resilientFetch([PUBLIC_DEVNET], {
      fetchFn: fetchFn as unknown as typeof fetch,
      attempts: 4,
      sleep: noSleep,
    });

    await expect(doFetch(`${PUBLIC_DEVNET}/`)).rejects.toThrow(/HTTP 503/);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("refuses to build without an endpoint", () => {
    expect(() => resilientFetch([], {})).toThrow(/at least one endpoint/);
  });
});
