"use client";

import { useQuery } from "@tanstack/react-query";
import { CLUSTER_LABEL, type ClusterName, api } from "./api";

/// A wallet lives on exactly one cluster, and only the chain can say which: wallet extensions do not
/// report their network in a way they all agree on — Phantom has no cluster field at all. So the
/// answer comes from the same "where is this address" lookup the pages already make, under the same
/// query key. Every page that asks therefore shares one request and one answer, which is also what
/// keeps the header badge from contradicting the page underneath it.
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

/// The network's name as it reads inside a sentence. Text that names the network a wallet is on
/// cannot be a build-time constant: this one deployment serves both clusters at once, so the answer
/// depends on which wallet is connected.
export function networkLabel(cluster: ClusterName | string | null | undefined): string {
  if (cluster === "mainnet-beta") return "mainnet";
  return cluster ?? "an unknown network";
}
