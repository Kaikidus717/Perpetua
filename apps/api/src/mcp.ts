import {
  PerpetuaApiError,
  type PerpetuaApiPort,
  type Query,
  createHttpHandler,
} from "@perpetua/mcp";
import type { Hono } from "hono";

/// The MCP tools reach Perpetua through a port (`PerpetuaApiPort`). Rather than pay for a second
/// HTTP hop — and a second invocation of this same function — the port calls the app's own routes in
/// process, which is also what keeps the hosted endpoint honest: it can only ever expose what the
/// public API already exposes.
function createInProcessApi(app: Hono): PerpetuaApiPort {
  async function send(path: string, init: RequestInit, query?: Query): Promise<unknown> {
    const url = new URL(`http://perpetua.internal${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await app.fetch(new Request(url, init));
    const text = await response.text();
    if (!response.ok) throw new PerpetuaApiError(response.status, path, text.slice(0, 500));
    return text.length > 0 ? (JSON.parse(text) as unknown) : null;
  }

  return {
    get: (path, query) => send(path, { method: "GET" }, query),
    post: (path, body) =>
      send(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

/// The MCP endpoint, served by the API itself at `/mcp` — `/api/mcp` on the hosted deploy. Perpetua
/// speaks Model Context Protocol without a second service to run, host or pay for, and an agent
/// needs nothing but that URL.
export function createMcpEndpoint(app: Hono): (request: Request) => Promise<Response> {
  const hosted = process.env.URL ? `${process.env.URL}/api` : "same-origin";
  return createHttpHandler({ api: createInProcessApi(app), source: `perpetua-api ${hosted}` });
}
