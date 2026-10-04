import type { AnchorProvider } from "@coral-xyz/anchor";
import { type PerpetuaVaultClient, findConfigPda } from "@perpetua/sdk";
import { DammV2Adapter } from "@perpetua/sdk/adapters/damm-v2";
import { type PublicKey, Transaction } from "@solana/web3.js";
import type { CrankPort, VaultRef } from "./ports.js";

export class RpcCrankPort implements CrankPort {
  private readonly dammV2: DammV2Adapter;

  constructor(
    private readonly client: PerpetuaVaultClient,
    private readonly provider: AnchorProvider,
  ) {
    this.dammV2 = new DammV2Adapter(provider.connection);
  }

  async listVaultRefs(): Promise<VaultRef[]> {
    const rows = await this.client.listVaults();
    return rows.map((row) => ({
      address: row.address,
      pool: row.account.pool,
      position: row.account.position,
      totalStaked: BigInt(row.account.totalStaked.toString()),
    }));
  }

  /// Pending token A + B fees on the position, read straight from the DAMM v2 program.
  async claimableBaseUnits(vaultAddress: PublicKey): Promise<bigint> {
    const vault = await this.client.fetchVault(vaultAddress);
    const detail = await this.dammV2.positionDetail(vault.position);
    return BigInt(detail.feeAPending) + BigInt(detail.feeBPending);
  }

  async crank(vaultAddress: PublicKey): Promise<string> {
    const vault = await this.client.fetchVault(vaultAddress);
    const config = findConfigPda(this.client.programId)[0];
    const cfg = await this.client.fetchConfig(config);

    const claim = await this.dammV2.claimAccountsFor(
      {
        vault: vaultAddress,
        pool: vault.pool,
        position: vault.position,
        positionNftAccount: vault.positionNftAccount,
        tokenAMint: vault.tokenAMint,
        tokenBMint: vault.tokenBMint,
        tokenAProgram: vault.tokenAProgram,
        tokenBProgram: vault.tokenBProgram,
      },
      cfg.treasury,
    );

    const instruction = await this.client.crankClaim({
      caller: this.provider.wallet.publicKey,
      config,
      vault: vaultAddress,
      ...claim,
    });

    return this.provider.sendAndConfirm(new Transaction().add(instruction));
  }
}
