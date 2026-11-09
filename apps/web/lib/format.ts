/// Shown when a value is genuinely unknown: not loaded yet, or the API is unreachable. Rendering a
/// zero in its place would state a fact we do not have.
export const UNKNOWN = "—";

export function usd(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

export function compactUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function money(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  if (value >= 1) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

export function pct(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${(value * 100).toFixed(digits)}%`;
}

/// Counts. A count we have not read yet is unknown, not zero.
export function count(value: number | undefined): string {
  return value === undefined ? UNKNOWN : String(value);
}

export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/// Which cluster a link should open on. Solscan needs an explicit `?cluster=` for devnet and
/// testnet; mainnet is the bare default, which is why a bare URL is also the correct one there.
export type Cluster = "mainnet" | "devnet" | "testnet";

function clusterFromRpc(endpoint: string): Cluster {
  if (endpoint.includes("devnet")) return "devnet";
  if (endpoint.includes("testnet")) return "testnet";
  return "mainnet";
}

export const APP_CLUSTER: Cluster = clusterFromRpc(
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
);

export const POOL_CLUSTER: Cluster = "mainnet";

export function explorerCluster(apiCluster: string | null | undefined): Cluster {
  if (apiCluster === "devnet") return "devnet";
  if (apiCluster === "mainnet-beta") return "mainnet";
  if (apiCluster === "testnet") return "testnet";
  return APP_CLUSTER;
}

function clusterSuffix(cluster: Cluster): string {
  return cluster === "mainnet" ? "" : `?cluster=${cluster}`;
}

export function explorerUrl(address: string, cluster: Cluster = APP_CLUSTER): string {
  return cluster === "mainnet"
    ? `https://solscan.io/account/${address}`
    : `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

export function txUrl(signature: string, cluster: Cluster = APP_CLUSTER): string {
  return `https://solscan.io/tx/${signature}${clusterSuffix(cluster)}`;
}

export function riskLabel(flag: string): string {
  return flag.replace(/_/g, " ");
}
