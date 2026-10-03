import type { StatsSummary, ValuationRiskInput, VaultEvent, VaultSummary } from "@perpetua/shared";

export interface VaultEventRecord extends VaultEvent {
  vault: string;
}

export interface Store {
  listVaults(): Promise<VaultSummary[]>;
  getVault(address: string): Promise<VaultSummary | null>;
  upsertVault(vault: VaultSummary): Promise<void>;
  listVaultEvents(vault: string, limit: number): Promise<VaultEvent[]>;
  listRecentEvents(limit: number): Promise<VaultEventRecord[]>;
  addVaultEvent(event: VaultEventRecord): Promise<void>;
  getPoolRisk(pool: string): Promise<ValuationRiskInput | null>;
  setPoolRisk(pool: string, risk: ValuationRiskInput): Promise<void>;
  getPositionPool(position: string): Promise<string | null>;
  setPositionPool(position: string, pool: string): Promise<void>;
  stats(): Promise<StatsSummary>;
  incrementStats(delta: Partial<StatsSummary>): Promise<void>;
}
