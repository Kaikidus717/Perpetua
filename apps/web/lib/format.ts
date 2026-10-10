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

/// The cluster this build is wired to, read from the RPC the browser talks to. It is the right answer
/// for everything the app itself creates — vaults, share mints, positions, transactions — because
/// those were made on that cluster and exist nowhere else.
export const APP_CLUSTER: Cluster = clusterFromRpc(
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
);

/// Pools are the exception, and the reason these helpers take a cluster at all: fee history comes
/// from Meteora's DAMM v2 data API, which indexes mainnet only. A pool priced on the Pricing page is
/// therefore a mainnet pool no matter which cluster the app is wired to — so its link has to say so,
/// or the visitor lands on a devnet page that has never heard of the address.
export const POOL_CLUSTER: Cluster = "mainnet";

/// The API names clusters the way Solana does (`mainnet-beta`); the explorer just says `mainnet`. A
/// page that has asked the API where an address lives converts the answer through here, so the link it
/// renders is the one that will actually find it.
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
  return `https://solscan.io/account/${address}${clusterSuffix(cluster)}`;
}

export function txUrl(signature: string, cluster: Cluster = APP_CLUSTER): string {
  return `https://solscan.io/tx/${signature}${clusterSuffix(cluster)}`;
}

export function riskLabel(flag: string): string {
  return flag.replace(/_/g, " ");
}
