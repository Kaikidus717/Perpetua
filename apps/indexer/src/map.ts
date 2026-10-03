import type { VaultAccountData } from "@perpetua/sdk";
import type { VaultSummary } from "@perpetua/shared";
import type { PublicKey } from "@solana/web3.js";

export function toVaultSummary(address: PublicKey, data: VaultAccountData): VaultSummary {
  return {
    address: address.toBase58(),
    pool: data.pool.toBase58(),
    position: data.position.toBase58(),
    shareMint: data.shareMint.toBase58(),
    creator: data.creator.toBase58(),
    totalStaked: data.totalStaked.toString(),
    totalClaimedA: data.totalClaimedA.toString(),
    totalClaimedB: data.totalClaimedB.toString(),
    createdAt: Number(data.createdAt.toString()),
  };
}
