export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export interface NetworkConfig {
  cluster: Cluster;
  rpcUrl: string;
  dammV2DataApi: string;
  dlmmDataApi: string;
  faucet: string;
}

export const NETWORKS: Record<Cluster, NetworkConfig> = {
  localnet: {
    cluster: "localnet",
    rpcUrl: "http://127.0.0.1:8899",
    dammV2DataApi: "https://damm-v2.datapi.meteora.ag",
    dlmmDataApi: "https://dlmm.datapi.meteora.ag",
    faucet: "http://127.0.0.1:8899",
  },
  devnet: {
    cluster: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    dammV2DataApi: "https://damm-v2.datapi.meteora.ag",
    dlmmDataApi: "https://dlmm.datapi.meteora.ag",
    faucet: "https://faucet.solana.com",
  },
  "mainnet-beta": {
    cluster: "mainnet-beta",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    dammV2DataApi: "https://damm-v2.datapi.meteora.ag",
    dlmmDataApi: "https://dlmm.datapi.meteora.ag",
    faucet: "https://faucet.solana.com",
  },
};

export const DEFAULT_CLUSTER: Cluster = "devnet";

export function resolveNetwork(cluster?: string): NetworkConfig {
  if (cluster === "devnet" || cluster === "localnet" || cluster === "mainnet-beta") {
    return NETWORKS[cluster];
  }
  return NETWORKS[DEFAULT_CLUSTER];
}
