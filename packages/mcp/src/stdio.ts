#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApi } from "./httpApi.js";
import { createServer } from "./server.js";

/// stdio is the protocol channel, so all diagnostics go to stderr.
///
/// The hosted API is the default, so an agent can be pointed at Perpetua without a local checkout.
/// `PERPETUA_API_URL` overrides it — a local dev API (`http://localhost:8787`), a preview deploy, or
/// a deployment of your own.
const HOSTED_API_URL = "https://perpetua-meteora.netlify.app/api";

async function main(): Promise<void> {
  const baseUrl = process.env.PERPETUA_API_URL ?? HOSTED_API_URL;
  const api = createHttpApi({ baseUrl });
  const server = createServer({ api, source: `perpetua-api ${baseUrl}` });

  await server.connect(new StdioServerTransport());
  console.error(`perpetua-mcp ready (api=${baseUrl})`);
}

main().catch((error: unknown) => {
  console.error("perpetua-mcp failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
