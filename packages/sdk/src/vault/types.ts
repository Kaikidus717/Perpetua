import type { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

export interface VaultAccountData {
  pool: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  positionNftAccount: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  shareMint: PublicKey;
  totalStaked: BN;
  accFeePerShareA: BN;
  accFeePerShareB: BN;
  carryA: BN;
  carryB: BN;
  totalClaimedA: BN;
  totalClaimedB: BN;
  creator: PublicKey;
  createdAt: BN;
}

export interface StakeAccountData {
  vault: PublicKey;
  owner: PublicKey;
  amount: BN;
  debtA: BN;
  debtB: BN;
  pendingA: BN;
  pendingB: BN;
}

export interface ConfigAccountData {
  admin: PublicKey;
  treasury: PublicKey;
  protocolFeeBps: number;
}

export interface ClaimAccounts {
  pool: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  vaultAAccount: PublicKey;
  vaultBAccount: PublicKey;
  treasury: PublicKey;
  treasuryAAccount: PublicKey;
  treasuryBAccount: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  cpAmmProgram: PublicKey;
}

export interface CreateVaultAccounts {
  creator: PublicKey;
  config: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  positionNftAccount: PublicKey;
  positionNftProgram: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  vault: PublicKey;
  shareMint: PublicKey;
  creatorShareAccount: PublicKey;
  tokenProgram: PublicKey;
  associatedTokenProgram: PublicKey;
  systemProgram: PublicKey;
  cpAmmProgram: PublicKey;
}
