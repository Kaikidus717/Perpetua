import type { StatsSummary, ValuationRiskInput, VaultEvent, VaultSummary } from "@perpetua/shared";
import type { Store, VaultEventRecord } from "./types.js";

const EMPTY_STATS: StatsSummary = {
  vaults: 0,
  positionsSecuritized: 0,
  feesDistributedUsd: 0,
  uniqueStakers: 0,
  dlmmVolumeUsd: 0,
};

export class InMemoryStore implements Store {
  private readonly vaults = new Map<string, VaultSummary>();
  private readonly events = new Map<string, VaultEvent[]>();
  private readonly risk = new Map<string, ValuationRiskInput>();
  private readonly positionPool = new Map<string, string>();
  private metrics: StatsSummary = { ...EMPTY_STATS };

  async listVaults(): Promise<VaultSummary[]> {
    return [...this.vaults.values()];
  }

  async getVault(address: string): Promise<VaultSummary | null> {
    return this.vaults.get(address) ?? null;
  }

  async upsertVault(vault: VaultSummary): Promise<void> {
    this.vaults.set(vault.address, vault);
  }

  async listVaultEvents(vault: string, limit: number): Promise<VaultEvent[]> {
    return (this.events.get(vault) ?? []).slice(0, limit);
  }

  async listRecentEvents(limit: number): Promise<VaultEventRecord[]> {
    const all = [...this.events.entries()].flatMap(([vault, list]) =>
      list.map((event) => ({ ...event, vault })),
    );
    return all.sort((a, b) => b.slot - a.slot).slice(0, limit);
  }

  async addVaultEvent(event: VaultEventRecord): Promise<void> {
    const { vault, ...rest } = event;
    const list = this.events.get(vault) ?? [];
    list.unshift(rest);
    this.events.set(vault, list);
  }

  async getPoolRisk(pool: string): Promise<ValuationRiskInput | null> {
    return this.risk.get(pool) ?? null;
  }

  async setPoolRisk(pool: string, value: ValuationRiskInput): Promise<void> {
    this.risk.set(pool, value);
  }

  async getPositionPool(position: string): Promise<string | null> {
    return this.positionPool.get(position) ?? null;
  }

  async setPositionPool(position: string, pool: string): Promise<void> {
    this.positionPool.set(position, pool);
  }

  async stats(): Promise<StatsSummary> {
    return { ...this.metrics };
  }

  async incrementStats(delta: Partial<StatsSummary>): Promise<void> {
    this.metrics = { ...this.metrics, ...delta };
  }
}
