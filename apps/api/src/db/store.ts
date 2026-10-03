import type { StatsSummary, ValuationRiskInput, VaultEvent, VaultSummary } from "@perpetua/shared";
import { desc, eq } from "drizzle-orm";
import type { Store, VaultEventRecord } from "../store/types.js";
import type { Database } from "./client.js";
import { poolRisk, positions, stats, vaultEvents, vaults } from "./schema.js";

export class DrizzleStore implements Store {
  constructor(private readonly db: Database) {}

  async listVaults(): Promise<VaultSummary[]> {
    const rows = await this.db.select().from(vaults);
    return rows.map(toSummary);
  }

  async getVault(address: string): Promise<VaultSummary | null> {
    const [row] = await this.db.select().from(vaults).where(eq(vaults.address, address)).limit(1);
    return row ? toSummary(row) : null;
  }

  async upsertVault(vault: VaultSummary): Promise<void> {
    await this.db
      .insert(vaults)
      .values(vault)
      .onConflictDoUpdate({ target: vaults.address, set: vault });
  }

  async listVaultEvents(vault: string, limit: number): Promise<VaultEvent[]> {
    const rows = await this.db
      .select()
      .from(vaultEvents)
      .where(eq(vaultEvents.vault, vault))
      .orderBy(desc(vaultEvents.slot))
      .limit(limit);
    return rows.map(toEvent);
  }

  async listRecentEvents(limit: number): Promise<VaultEventRecord[]> {
    const rows = await this.db
      .select()
      .from(vaultEvents)
      .orderBy(desc(vaultEvents.slot))
      .limit(limit);
    return rows.map((row) => ({ ...toEvent(row), vault: row.vault }));
  }

  async addVaultEvent(event: VaultEventRecord): Promise<void> {
    await this.db.insert(vaultEvents).values(event);
  }

  async getPoolRisk(pool: string): Promise<ValuationRiskInput | null> {
    const [row] = await this.db.select().from(poolRisk).where(eq(poolRisk.pool, pool)).limit(1);
    if (!row) return null;
    return {
      feeCollectMode: row.feeCollectMode === "compounding" ? "compounding" : "claimable",
      poolAgeDays: row.poolAgeDays,
      pausableMint: row.pausableMint,
      permanentDelegate: row.permanentDelegate,
      liquidityUsd: row.liquidityUsd,
      topWalletVolumeShare: row.topWalletVolumeShare,
    };
  }

  async setPoolRisk(pool: string, risk: ValuationRiskInput): Promise<void> {
    await this.db
      .insert(poolRisk)
      .values({ pool, ...risk })
      .onConflictDoUpdate({ target: poolRisk.pool, set: risk });
  }

  async getPositionPool(position: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(positions)
      .where(eq(positions.position, position))
      .limit(1);
    return row?.pool ?? null;
  }

  async setPositionPool(position: string, pool: string): Promise<void> {
    await this.db
      .insert(positions)
      .values({ position, pool })
      .onConflictDoUpdate({ target: positions.position, set: { pool } });
  }

  async stats(): Promise<StatsSummary> {
    const [row] = await this.db.select().from(stats).where(eq(stats.id, 1)).limit(1);
    if (!row) {
      return {
        vaults: 0,
        positionsSecuritized: 0,
        feesDistributedUsd: 0,
        uniqueStakers: 0,
        dlmmVolumeUsd: 0,
      };
    }
    return {
      vaults: row.vaults,
      positionsSecuritized: row.positionsSecuritized,
      feesDistributedUsd: row.feesDistributedUsd,
      uniqueStakers: row.uniqueStakers,
      dlmmVolumeUsd: row.dlmmVolumeUsd,
    };
  }

  async incrementStats(delta: Partial<StatsSummary>): Promise<void> {
    const current = await this.stats();
    const next = { ...current, ...delta };
    await this.db
      .insert(stats)
      .values({ id: 1, ...next })
      .onConflictDoUpdate({ target: stats.id, set: next });
  }
}

function toSummary(row: typeof vaults.$inferSelect): VaultSummary {
  return {
    address: row.address,
    pool: row.pool,
    position: row.position,
    shareMint: row.shareMint,
    creator: row.creator,
    totalStaked: row.totalStaked,
    totalClaimedA: row.totalClaimedA,
    totalClaimedB: row.totalClaimedB,
    createdAt: row.createdAt,
  };
}

function toEvent(row: typeof vaultEvents.$inferSelect): VaultEvent {
  return {
    signature: row.signature,
    slot: row.slot,
    blockTime: row.blockTime,
    name: row.name,
    data: (row.data ?? {}) as VaultEvent["data"],
  };
}
