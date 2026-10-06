import { type Cluster, DEFAULT_CLUSTER, NETWORKS } from "./networks.js";

type Env = Record<string, string | undefined>;

/// Public RPC endpoints are shared by every wallet on the network and rate-limit aggressively, which
/// is fatal in the middle of a demo. Requests are therefore retried and failed over to the next
/// endpoint rather than surfacing a `429` to the user.
const BUILT_IN: Record<Cluster, string[]> = {
  localnet: [NETWORKS.localnet.rpcUrl],
  devnet: ["https://api.devnet.solana.com"],
  "mainnet-beta": ["https://api.mainnet-beta.solana.com"],
};

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/// Endpoints to try, in order.
///
/// * `RPC_URLS` (comma-separated) replaces the list outright — point it at a private endpoint
///   (Helius, QuickNode, Triton) and nothing will rate-limit you.
/// * `RPC_URL` still wins the first attempt, so a single-URL config keeps working unchanged.
/// * Otherwise the cluster's built-in public endpoint is used.
export function rpcEndpoints(
  cluster: Cluster = DEFAULT_CLUSTER,
  env: Env = defaultEnv(),
): string[] {
  const listed = (env.RPC_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const endpoints = listed.length > 0 ? listed : [...BUILT_IN[cluster]];
  if (env.RPC_URL && !endpoints.includes(env.RPC_URL)) endpoints.unshift(env.RPC_URL);
  return [...new Set(endpoints)];
}

export interface RetryPolicy {
  /// Total attempts across all endpoints before giving up.
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { url: string; attempt: number; reason: string; delayMs: number }) => void;
}

/// `429`, `408` and any `5xx` mean "try again", not "fail".
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/// `fetch`'s own parameter types, so this module needs no DOM or Node type package of its own.
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

/// `input` is a plain string for JSON-RPC, but it can be a `Request`; neither `URL` nor `RequestInfo`
/// is guaranteed to exist as a global type here, so read the field structurally.
function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  const candidate = input as { url?: unknown } | null;
  if (candidate && typeof candidate.url === "string") return candidate.url;
  return String(input);
}

/// Everything from the first `/` after the scheme, i.e. the path and query of an absolute URL.
function pathSuffix(url: string): string {
  const scheme = url.indexOf("://");
  const start = scheme === -1 ? 0 : url.indexOf("/", scheme + 3);
  return start === -1 ? "" : url.slice(start);
}

/// Swaps the endpoint while preserving the request path. An endpoint that already carries its own
/// path or query — a provider key such as `https://devnet.helius-rpc.com/?api-key=...` — is used
/// verbatim, because appending to it would corrupt the key.
export function withEndpoint(endpoint: string, requested: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return pathSuffix(base) === "" ? `${base}${pathSuffix(requested)}` : base;
}

/// A `fetch` that rotates across `endpoints` with exponential backoff, honouring `Retry-After`.
/// Solana de-duplicates transactions by signature, so retrying a `sendTransaction` against a second
/// endpoint is safe.
export function resilientFetch(endpoints: string[], policy: RetryPolicy = {}): typeof fetch {
  if (endpoints.length === 0) throw new Error("resilientFetch needs at least one endpoint");
  const attempts = Math.max(1, policy.attempts ?? Math.max(3, endpoints.length * 4));
  const base = policy.baseDelayMs ?? 250;
  const cap = policy.maxDelayMs ?? 8_000;
  const doFetch = policy.fetchFn ?? fetch;
  const sleep =
    policy.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const rotate: typeof fetch = async (input: FetchInput, init?: FetchInit) => {
    const requested = requestUrl(input);
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const endpoint = endpoints[attempt % endpoints.length] ?? endpoints[0] ?? "";
      const url = withEndpoint(endpoint, requested);
      let reason: string;
      let delayMs = Math.min(cap, base * 2 ** attempt);
      try {
        const response = await doFetch(url, init);
        if (!isRetryableStatus(response.status)) return response;
        reason = `HTTP ${response.status}`;
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        if (retryAfter > 0) delayMs = Math.min(cap, retryAfter * 1_000);
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
      lastError = new Error(`${url} failed: ${reason}`);
      // Sleeping after the final attempt would only delay the error we are about to throw.
      if (attempt < attempts - 1) {
        policy.onRetry?.({ url, attempt, reason, delayMs });
        await sleep(delayMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`rpc request failed after ${attempts} attempts`);
  };

  return rotate;
}
