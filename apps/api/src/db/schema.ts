import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const vaults = pgTable("vaults", {
  address: text("address").primaryKey(),
  pool: text("pool").notNull(),
  position: text("position").notNull(),
  shareMint: text("share_mint").notNull(),
  creator: text("creator").notNull(),
  totalStaked: text("total_staked").notNull().default("0"),
  totalClaimedA: text("total_claimed_a").notNull().default("0"),
  totalClaimedB: text("total_claimed_b").notNull().default("0"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const vaultEvents = pgTable("vault_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  vault: text("vault").notNull(),
  signature: text("signature").notNull(),
  slot: bigint("slot", { mode: "number" }).notNull(),
  blockTime: bigint("block_time", { mode: "number" }),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
});

export const poolRisk = pgTable("pool_risk", {
  pool: text("pool").primaryKey(),
  feeCollectMode: text("fee_collect_mode").notNull(),
  poolAgeDays: integer("pool_age_days").notNull(),
  pausableMint: boolean("pausable_mint").notNull(),
  permanentDelegate: boolean("permanent_delegate").notNull(),
  liquidityUsd: doublePrecision("liquidity_usd").notNull(),
  topWalletVolumeShare: doublePrecision("top_wallet_volume_share").notNull(),
});

export const positions = pgTable("positions", {
  position: text("position").primaryKey(),
  pool: text("pool").notNull(),
});

export const stats = pgTable("stats", {
  id: integer("id").primaryKey().default(1),
  vaults: integer("vaults").notNull().default(0),
  positionsSecuritized: integer("positions_securitized").notNull().default(0),
  feesDistributedUsd: doublePrecision("fees_distributed_usd").notNull().default(0),
  uniqueStakers: integer("unique_stakers").notNull().default(0),
  dlmmVolumeUsd: doublePrecision("dlmm_volume_usd").notNull().default(0),
});
