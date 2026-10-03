import type { AnchorProvider } from "@coral-xyz/anchor";
import { type PerpetuaVaultClient, findConfigPda } from "@perpetua/sdk";
import { PROGRAM_IDS } from "@perpetua/shared";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { CrankPort, VaultRef } from "./ports.js";

export class RpcCrankPort implements CrankPort {
  private readonly cpAmmProgram = new PublicKey(PROGRAM_IDS.dammV2);

  constructor(
    private readonly client: PerpetuaVaultClient,
    private readonly provider: AnchorProvider,
  ) {}

  async listVaultRefs(): Promise<VaultRef[]> {
    const rows = await this.client.listVaults();
    return rows.map((row) => ({
      address: row.address,
      pool: row.account.pool,
      position: row.account.position,
      totalStaked: BigInt(row.account.totalStaked.toString()),
    }));
  }

  async claimableUsd(): Promise<number> {
    return 0;
  }

  async crank(vaultAddress: PublicKey): Promise<string> {
    const vault = await this.client.fetchVault(vaultAddress);
    const config = findConfigPda(this.client.programId)[0];
    const cfg = await this.client.fetchConfig(config);

    const vaultAAccount = getAssociatedTokenAddressSync(
      vault.tokenAMint,
      vaultAddress,
      true,
      vault.tokenAProgram,
    );
    const vaultBAccount = getAssociatedTokenAddressSync(
      vault.tokenBMint,
      vaultAddress,
      true,
      vault.tokenBProgram,
    );
    const treasuryAAccount = getAssociatedTokenAddressSync(
      vault.tokenAMint,
      cfg.treasury,
      true,
      vault.tokenAProgram,
    );
    const treasuryBAccount = getAssociatedTokenAddressSync(
      vault.tokenBMint,
      cfg.treasury,
      true,
      vault.tokenBProgram,
    );

    const instruction = await this.client.crankClaim({
      caller: this.provider.wallet.publicKey,
      config,
      vault: vaultAddress,
      pool: vault.pool,
      position: vault.position,
      positionNftAccount: vault.positionNftAccount,
      tokenAMint: vault.tokenAMint,
      tokenBMint: vault.tokenBMint,
      vaultAAccount,
      vaultBAccount,
      treasury: cfg.treasury,
      treasuryAAccount,
      treasuryBAccount,
      tokenAProgram: vault.tokenAProgram,
      tokenBProgram: vault.tokenBProgram,
      cpAmmProgram: this.cpAmmProgram,
    });

    return this.provider.sendAndConfirm(new Transaction().add(instruction));
  }
}
