import type { PoolDailySeries, PositionSummary } from "@perpetua/shared";
import type { LadderPlan } from "./sale/ladder.js";

export interface DataApiPort {
  poolDaily(pool: string, days: number): Promise<PoolDailySeries>;
  walletPositions(wallet: string): Promise<PositionSummary[]>;
}

export interface SeedLadderResult {
  poolAddress: string;
  positionAddress: string;
  binsSeeded: number;
}

export interface DlmmPort {
  ensureSharePool(params: {
    shareMint: string;
    quoteMint: string;
    binStep: number;
    baseFeeBps: number;
  }): Promise<string>;
  seedOneSidedAsk(params: {
    poolAddress: string;
    owner: string;
    plan: LadderPlan;
    shareMint: string;
  }): Promise<SeedLadderResult>;
}

export interface DbcLaunchResult {
  config: string;
  pool: string;
}

export interface DbcPort {
  createConfig(preset: unknown): Promise<string>;
  createPool(params: {
    config: string;
    name: string;
    symbol: string;
    uri: string;
  }): Promise<DbcLaunchResult>;
}
