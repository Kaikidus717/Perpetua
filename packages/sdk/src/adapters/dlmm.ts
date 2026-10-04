import { createRequire } from "node:module";
import type { StrategyType } from "@meteora-ag/dlmm";
import { type Cluster, PROGRAM_IDS } from "@perpetua/shared";
import { type Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import type {
  DlmmPort,
  DlmmPreset,
  SeedLadderParams,
  SeedLadderResult,
  SharePoolParams,
} from "../ports.js";

const DLMM_PROGRAM_ID = new PublicKey(PROGRAM_IDS.dlmm);

/// The DLMM package ships CJS-flavoured types, so the static surface we depend on is
/// declared here explicitly instead of relying on the package's default-export typing.
interface DlmmPoolClient {
  getActiveBin(): Promise<{ binId: number }>;
  initializePositionAndAddLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: { minBinId: number; maxBinId: number; strategyType: StrategyType };
  }): Promise<import("@solana/web3.js").Transaction>;
}

interface DlmmStatic {
  create(
    connection: Connection,
    pool: PublicKey,
    opt?: { cluster: Cluster },
  ): Promise<DlmmPoolClient>;
  getAllPresetParameters(
    connection: Connection,
    opt?: { cluster: Cluster },
  ): Promise<{
    presetParameter2: Array<{ publicKey: PublicKey; account: { binStep: number } }>;
  }>;
  getBinIdFromPrice(price: string | number, binStep: number, min: boolean): number;
  createLbPair2(
    connection: Connection,
    funder: PublicKey,
    tokenX: PublicKey,
    tokenY: PublicKey,
    presetParameter: PublicKey,
    activeId: BN,
    opt?: { cluster: Cluster },
  ): Promise<import("@solana/web3.js").Transaction>;
}

interface DlmmModuleShape extends DlmmStatic {
  default?: DlmmStatic;
  StrategyType: { Spot: number; Curve: number; BidAsk: number };
}

// `@meteora-ag/dlmm`'s ESM build imports a CJS directory (`@coral-xyz/anchor/dist/cjs/utils/bytes`),
// which Node's ESM resolver rejects. Load the CJS build instead; this adapter is server-side only.
const dlmmModule = createRequire(import.meta.url)("@meteora-ag/dlmm") as DlmmModuleShape;
const DLMM: DlmmStatic = dlmmModule.default ?? dlmmModule;
const { StrategyType: DlmmStrategyType } = dlmmModule;

export interface DlmmAdapterOptions {
  connection: Connection;
  cluster: Cluster;
  signer: Keypair;
}

/// DLMM pair PDA: `["lb_pair", tokenX, tokenY, binStep(u16)]`, mints sorted ascending.
export function deriveLbPair(tokenX: PublicKey, tokenY: PublicKey, binStep: number): PublicKey {
  const [a, b] =
    tokenX.toBuffer().compare(tokenY.toBuffer()) < 0 ? [tokenX, tokenY] : [tokenY, tokenX];
  const step = Buffer.alloc(2);
  step.writeUInt16LE(binStep);
  return PublicKey.findProgramAddressSync(
    [Uint8Array.from("lb_pair", (c) => c.charCodeAt(0)), a.toBytes(), b.toBytes(), step],
    DLMM_PROGRAM_ID,
  )[0];
}

export class DlmmAdapter implements DlmmPort {
  constructor(private readonly options: DlmmAdapterOptions) {}

  async listPresets(): Promise<DlmmPreset[]> {
    const state = await DLMM.getAllPresetParameters(this.options.connection, {
      cluster: this.options.cluster,
    });
    return state.presetParameter2.map((preset) => ({
      address: preset.publicKey.toBase58(),
      binStep: preset.account.binStep,
    }));
  }

  private async exists(pool: PublicKey): Promise<boolean> {
    try {
      await DLMM.create(this.options.connection, pool, { cluster: this.options.cluster });
      return true;
    } catch {
      return false;
    }
  }

  async ensureSharePool(params: SharePoolParams): Promise<string> {
    const shareMint = new PublicKey(params.shareMint);
    const quoteMint = new PublicKey(params.quoteMint);
    const existing = deriveLbPair(shareMint, quoteMint, params.binStep);
    if (await this.exists(existing)) return existing.toBase58();

    const activeId = DLMM.getBinIdFromPrice(params.initialPrice, params.binStep, true);
    const transaction = await DLMM.createLbPair2(
      this.options.connection,
      this.options.signer.publicKey,
      shareMint,
      quoteMint,
      new PublicKey(params.presetParameter),
      new BN(activeId),
      { cluster: this.options.cluster },
    );
    await sendAndConfirmTransaction(this.options.connection, transaction, [this.options.signer]);
    return existing.toBase58();
  }

  async seedOneSidedAsk(params: SeedLadderParams): Promise<SeedLadderResult> {
    const pool = await DLMM.create(this.options.connection, new PublicKey(params.poolAddress), {
      cluster: this.options.cluster,
    });
    const activeBin = await pool.getActiveBin();

    const minBinId = DLMM.getBinIdFromPrice(params.plan.rangeLowUsd, params.binStep, true);
    const maxBinId = DLMM.getBinIdFromPrice(params.plan.rangeHighUsd, params.binStep, false);
    const bounded = Math.max(maxBinId, minBinId + 1);
    const shares = Math.round(params.plan.totalOfferShares);

    const position = Keypair.generate();
    const transaction = await pool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: position.publicKey,
      user: this.options.signer.publicKey,
      totalXAmount: new BN(shares),
      totalYAmount: new BN(0),
      strategy: {
        minBinId: Math.max(minBinId, activeBin.binId + 1),
        maxBinId: bounded,
        strategyType: DlmmStrategyType.BidAsk as StrategyType,
      },
    });

    await sendAndConfirmTransaction(this.options.connection, transaction, [
      this.options.signer,
      position,
    ]);

    return {
      poolAddress: params.poolAddress,
      positionAddress: position.publicKey.toBase58(),
      minBinId,
      maxBinId: bounded,
      sharesOffered: shares,
    };
  }
}
