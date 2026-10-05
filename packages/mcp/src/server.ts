import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PerpetuaApiPort } from "./ports.js";
import { TOOLS, type ToolContext } from "./tools.js";

export interface ServerOptions {
  api: PerpetuaApiPort;
  /// Label written into every response envelope so an agent can tell which deployment answered.
  source?: string;
  now?: () => Date;
  version?: string;
}

/**
 * Registers the Perpetua tool set on an MCP server. The server is transport-agnostic: the stdio
 * entrypoint connects it, and tests can drive it over an in-memory transport.
 *
 * Nothing here signs, holds or derives keys. `build_securitize_tx` returns an unsigned wire
 * transaction tagged `unsigned: true` for the caller's own wallet to sign.
 */
export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: "perpetua", version: options.version ?? "0.1.0" });
  const ctx: ToolContext = {
    now: options.now ?? (() => new Date()),
    source: options.source ?? "perpetua-api",
  };

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
      },
      async (args: unknown) => {
        try {
          const outcome = await tool.handle(args, options.api, ctx);
          const payload = { ...outcome.envelope, data: outcome.data };
          return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text" as const, text: `error: ${message}` }], isError: true };
        }
      },
    );
  }

  return server;
}
