import type { Store } from "@perpetua/api";
import type { DataApiPort, PerpetuaVaultClient } from "@perpetua/sdk";
import type { Connection } from "@solana/web3.js";
import { toVaultSummary } from "./map.js";

export interface IndexerDeps {
  connection: Connection;
  vault: PerpetuaVaultClient;
  store: Store;
  dataApi: DataApiPort;
}

const POLL_INTERVAL_MS = 60_000;

export class Indexer {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: IndexerDeps) {}

  async ingestVaults(): Promise<number> {
    const rows = await this.deps.vault.listVaults();
    for (const row of rows) {
      await this.deps.store.upsertVault(toVaultSummary(row.address, row.account));
      await this.deps.store.setPositionPool(
        row.account.position.toBase58(),
        row.account.pool.toBase58(),
      );
    }
    await this.deps.store.incrementStats({
      vaults: rows.length,
      positionsSecuritized: rows.length,
    });
    return rows.length;
  }

  async ingestPoolSeries(pool: string, days = 30): Promise<void> {
    const series = await this.deps.dataApi.poolDaily(pool, days);
    const liquidity = series.liquidityUsd.at(-1) ?? 0;
    const existing = await this.deps.store.getPoolRisk(pool);
    if (!existing) {
      await this.deps.store.setPoolRisk(pool, {
        feeCollectMode: "claimable",
        poolAgeDays: series.days.length,
        pausableMint: false,
        permanentDelegate: false,
        liquidityUsd: liquidity,
        topWalletVolumeShare: 0,
      });
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => console.error("indexer tick failed", error));
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const count = await this.ingestVaults();
    console.log(`indexed ${count} vaults`);
  }
}
