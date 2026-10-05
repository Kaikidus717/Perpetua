import type { PerpetuaApiPort, Query } from "./ports.js";

export class PerpetuaApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string,
  ) {
    super(`perpetua api returned ${status} for ${path}: ${detail}`);
    this.name = "PerpetuaApiError";
  }
}

export interface HttpApiOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createHttpApi(options: HttpApiOptions): PerpetuaApiPort {
  const base = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 20_000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("no fetch available; upgrade Node or pass fetchImpl");
  }

  async function send(method: "GET" | "POST", path: string, query?: Query, body?: unknown) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new PerpetuaApiError(response.status, path, text.slice(0, 500));
      }
      return text.length > 0 ? (JSON.parse(text) as unknown) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: (path, query) => send("GET", path, query),
    post: (path, body) => send("POST", path, undefined, body),
  };
}
