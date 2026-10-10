import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { PerpetuaApiPort } from "./ports.js";
import { createServer } from "./server.js";

export interface HttpHandlerOptions {
  api: PerpetuaApiPort;
  source?: string;
  version?: string;
}

/**
 * The tool set as a `Request -> Response` handler, for runtimes that speak Fetch: the hosted Netlify
 * Function, and the tests.
 *
 * The transport is stateless on purpose — no `sessionIdGenerator` — because a serverless invocation
 * has no memory to keep a session in, and every client call arrives as its own request.
 * `enableJsonResponse` asks for plain JSON replies rather than an SSE stream, which is what a
 * single-shot request can actually deliver.
 */
export function createHttpHandler(
  options: HttpHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = createServer({
      api: options.api,
      source: options.source,
      version: options.version,
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      // The response is fully formed by now, and nothing should outlive it.
      await server.close().catch(() => undefined);
    }
  };
}
