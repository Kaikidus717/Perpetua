#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApi } from "./httpApi.js";
import { createServer } from "./server.js";

/// stdio is the protocol channel, so all diagnostics go to stderr.
async function main(): Promise<void> {
  const baseUrl = process.env.PERPETUA_API_URL ?? "http://localhost:8787";
  const api = createHttpApi({ baseUrl });
  const server = createServer({ api, source: `perpetua-api ${baseUrl}` });

  await server.connect(new StdioServerTransport());
  console.error(`perpetua-mcp ready (api=${baseUrl})`);
}

main().catch((error: unknown) => {
  console.error("perpetua-mcp failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
