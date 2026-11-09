"use client";

import { useQuery } from "@tanstack/react-query";
import { CLUSTER_LABEL, type ClusterName, api } from "./api";

export interface WalletNetwork {
  /// `null` while the answer is unknown: no wallet connected, still loading, or an address that
  /// neither cluster has heard of.
  cluster: ClusterName | null;
  /// What to print for a reader: "mainnet", "devnet", or `null` when unknown.
  label: string | null;
}

export function useWalletNetwork(address: string | null | undefined): WalletNetwork {
  const location = useQuery({
    queryKey: ["where", address ?? null],
    queryFn: () => (address ? api.where(address) : Promise.reject(new Error("no wallet"))),
    enabled: Boolean(address),
  });

  /// A disconnected wallet is not described by the previous wallet's answer.
  const cluster = address ? (location.data?.cluster ?? null) : null;

  return { cluster, label: cluster ? CLUSTER_LABEL[cluster] : null };
}

export function networkLabel(cluster: ClusterName | string | null | undefined): string {
  if (cluster === "mainnet-beta") return "mainnet";
  return cluster ?? "an unknown network";
}
