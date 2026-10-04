import type { PublicKey } from "@solana/web3.js";

export interface VaultRef {
  address: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  totalStaked: bigint;
}

export interface CrankPort {
  listVaultRefs(): Promise<VaultRef[]>;
  /// Claimable fees in base units of both mints, read from the DAMM v2 position.
  claimableBaseUnits(vault: PublicKey): Promise<bigint>;
  crank(vault: PublicKey): Promise<string>;
}
