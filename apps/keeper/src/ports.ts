import type { PublicKey } from "@solana/web3.js";

export interface VaultRef {
  address: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  totalStaked: bigint;
}

export interface CrankPort {
  listVaultRefs(): Promise<VaultRef[]>;
  claimableUsd(vault: PublicKey): Promise<number>;
  crank(vault: PublicKey): Promise<string>;
}
