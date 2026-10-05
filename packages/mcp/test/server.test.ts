import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { PerpetuaApiPort, Query } from "../src/ports.js";
import { createServer } from "../src/server.js";

const POOL = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

const VALUATION = {
  pool: POOL,
  fairValueUsd: 12_000,
  fairValuePerShareUsd: 0.012,
  riskFlags: ["pool_too_young"],
  modelVersion: "perpetua-valuation/1.1.0",
};

function stubApi(): PerpetuaApiPort {
  return {
    async get(path: string, _query?: Query) {
      if (path === "/v1/vaults") return { vaults: [] };
      if (path.endsWith("/yield")) return { valuation: VALUATION };
      if (path.endsWith("/series")) {
        return {
          series: {
            pool: POOL,
            days: [1, 2],
            feesUsd: [10, 8],
            volumeUsd: [1, 1],
            liquidityUsd: [1, 1],
          },
        };
      }
      return null;
    },
    async post() {
      return { transaction: "AQIDBA==" };
    },
  };
}

let open: Client | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({
    api: stubApi(),
    source: "test",
    now: () => new Date("2026-01-02T03:04:05.000Z"),
  });
  const client = new Client({ name: "perpetua-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  open = client;
  return client;
}

function textOf(result: unknown): string {
  const blocks = (result as { content?: unknown }).content;
  const first = (Array.isArray(blocks) ? blocks[0] : undefined) as
    | { type?: string; text?: string }
    | undefined;
  if (first?.type !== "text" || typeof first.text !== "string") {
    throw new Error("expected a text content block");
  }
  return first.text;
}

describe("mcp server", () => {
  it("advertises the five tools with described inputs", async () => {
    const client = await connect();
    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "price_position",
      "list_vaults",
      "get_report",
      "simulate_preset",
      "build_securitize_tx",
    ]);

    const price = listed.tools.find((tool) => tool.name === "price_position");
    const properties =
      (price?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(properties)).toContain("pool");
    expect(Object.keys(properties)).toContain("liquidity_share");
    expect(properties.liquidity_share).toMatchObject({ description: expect.any(String) });

    expect(price?.description).toMatch(/fee stream/i);
  });

  it("answers a tool call with a stamped envelope", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "price_position", arguments: { pool: POOL } });
    const payload = JSON.parse(textOf(result)) as Record<string, unknown>;

    expect(payload.as_of).toBe("2026-01-02T03:04:05.000Z");
    expect(payload.source).toBe("test");
    expect(payload.model_version).toBe("perpetua-valuation/1.1.0");
    expect(payload.unsigned).toBe(false);
    expect(payload.endpoints).toEqual([`/v1/pools/${POOL}/yield`]);
    expect((payload.data as { valuation: { fairValueUsd: number } }).valuation.fairValueUsd).toBe(
      12_000,
    );
  });

  it("composes the report from two endpoints", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "get_report", arguments: { pool: POOL } });
    const payload = JSON.parse(textOf(result)) as {
      endpoints: string[];
      data: { series_summary: { total_fees_usd: number } };
    };

    expect(payload.endpoints).toHaveLength(2);
    expect(payload.data.series_summary.total_fees_usd).toBe(18);
  });

  it("marks the transaction builder unsigned", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "build_securitize_tx",
      arguments: {
        creator: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
        pool: POOL,
        position: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
        position_nft_mint: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        position_nft_account: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        position_nft_program: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        token_a_mint: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        token_b_mint: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        token_a_program: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        token_b_program: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
        share_mint: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
      },
    });
    const payload = JSON.parse(textOf(result)) as {
      unsigned: boolean;
      data: Record<string, unknown>;
    };

    expect(payload.unsigned).toBe(true);
    expect(payload.data.requires_signature).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/secret|private[_-]?key/i);
  });

  it("reports a handler failure as an error result, not a crash", async () => {
    const client = await connect();
    const result = (await client.callTool({ name: "price_position", arguments: {} })) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/position.*pool/i);
  });

  it("rejects an argument that fails the published schema", async () => {
    const client = await connect();
    const result = (await client.callTool({
      name: "price_position",
      arguments: { pool: POOL, liquidity_share: 99 },
    })) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });
});
