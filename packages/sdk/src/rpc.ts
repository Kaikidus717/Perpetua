import { type Cluster, resilientFetch, resolveNetwork, rpcEndpoints } from "@perpetua/shared";
import { type Commitment, Connection } from "@solana/web3.js";

export interface ConnectionOptions {
  cluster?: string;
  env?: Record<string, string | undefined>;
  commitment?: Commitment;
  /// Total attempts per request across all endpoints. Defaults to `max(3, endpoints * 4)`.
  attempts?: number;
  onRetry?: (info: { url: string; attempt: number; reason: string; delayMs: number }) => void;
}

/// Every part of Perpetua builds its RPC connection here, so a flaky public endpoint cannot take the
/// app down mid-demo. Requests are retried with backoff and failed over across `RPC_URLS`.
export function createConnection(options: ConnectionOptions = {}): Connection {
  const cluster: Cluster = resolveNetwork(options.cluster).cluster;
  const endpoints = rpcEndpoints(cluster, options.env);
  const primary = endpoints[0];
  if (!primary) throw new Error(`no RPC endpoint configured for ${cluster}`);
  return new Connection(primary, {
    commitment: options.commitment ?? "confirmed",
    fetch: resilientFetch(endpoints, { attempts: options.attempts, onRetry: options.onRetry }),
  });
}
