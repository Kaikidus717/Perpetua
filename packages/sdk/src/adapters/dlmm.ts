import type { StrategyType } from "@meteora-ag/dlmm";
import { type Cluster, PROGRAM_IDS } from "@perpetua/shared";
import { getMint } from "@solana/spl-token";
import { type Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import dlmmRequire from "./dlmmRequire.cjs";
import type {
  CreatePairResult,
  DlmmPort,
  DlmmPreset,
  SeedLadderParams,
  SeedLadderResult,
  SharePoolParams,
} from "../ports.js";

const DLMM_PROGRAM_ID = new PublicKey(PROGRAM_IDS.dlmm);

/// The DLMM package ships CJS-flavoured types, so the static surface we depend on is declared here
/// explicitly instead of relying on the package's default-export typing.
interface DlmmPoolClient {
  getActiveBin(): Promise<{ binId: number }>;
  initializePositionAndAddLiquidityByStrategy(params: {
    positionPubKey: PublicKey;
    user: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: {
      minBinId: number;
      maxBinId: number;
      strategyType: StrategyType;
      singleSidedX?: boolean;
    };
    slippage?: number;
  }): Promise<import("@solana/web3.js").Transaction>;
}

interface PresetParameter {
  publicKey: PublicKey;
  account: { binStep: number; baseFactor: BN };
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
  ): Promise<{ presetParameter2: PresetParameter[] }>;
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
  /// Preset pairs are addressed by `["lb_pair", tokenX, tokenY, binStep, baseFactor]`, not the old
  /// `["lb_pair", tokenX, tokenY, binStep]` seed. `deriveLbPair` is the deprecated one; using it would
  /// look for the pair at the wrong address, so `deriveLbPair2` is what we call.
  deriveLbPair2(
    tokenX: PublicKey,
    tokenY: PublicKey,
    binStep: BN,
    baseFactor: BN,
    programId: PublicKey,
  ): [PublicKey, number];
}

/// `@meteora-ag/dlmm` reaches this module through the CommonJS shim beside it; read the note in
/// `dlmmRequire.cts` for why it is a separate `.cts` file rather than a `createRequire` call. The
/// package's own types describe a default export, so the surface used here is declared as
/// `DlmmModuleShape` and the shim is cast to it once.
const dlmmModule = dlmmRequire as unknown as DlmmModuleShape;

function loadDlmm(): DlmmModuleShape {
  return dlmmModule;
}

function dlmm(): DlmmStatic {
  const module = loadDlmm();
  return module.default ?? module;
}

function dlmmStrategyType(): { Spot: number; Curve: number; BidAsk: number } {
  return loadDlmm().StrategyType;
}

function deriveLbPair2(
  tokenX: PublicKey,
  tokenY: PublicKey,
  binStep: BN,
  baseFactor: BN,
  programId: PublicKey,
): [PublicKey, number] {
  const module = loadDlmm();
  const derive = module.deriveLbPair2 ?? (module.default as DlmmModuleShape).deriveLbPair2;
  return derive(tokenX, tokenY, binStep, baseFactor, programId);
}

export interface DlmmAdapterOptions {
  connection: Connection;
  cluster: Cluster;
}

/// The program sizes the pair's token slots by `PublicKey` byte order, so the caller has to agree.
function sortMints(a: string, b: string): [PublicKey, PublicKey] {
  const left = new PublicKey(a);
  const right = new PublicKey(b);
  return left.toBuffer().compare(right.toBuffer()) < 0 ? [left, right] : [right, left];
}

function powerOfTen(decimals: number): BN {
  return new BN(10).pow(new BN(decimals));
}

/// DLMM pair PDA for a preset pair: `["lb_pair", tokenX, tokenY, binStep(u16LE), baseFactor]`.
export function deriveSharePoolAddress(
  tokenA: PublicKey,
  tokenB: PublicKey,
  binStep: number,
  baseFactor: string,
): PublicKey {
  const [x, y] =
    tokenA.toBuffer().compare(tokenB.toBuffer()) < 0 ? [tokenA, tokenB] : [tokenB, tokenA];
  return deriveLbPair2(x, y, new BN(binStep), new BN(baseFactor), DLMM_PROGRAM_ID)[0];
}

export class DlmmAdapter implements DlmmPort {
  constructor(private readonly options: DlmmAdapterOptions) {}

  async listPresets(): Promise<DlmmPreset[]> {
    const state = await dlmm().getAllPresetParameters(this.options.connection, {
      cluster: this.options.cluster,
    });
    return state.presetParameter2.map((preset) => ({
      address: preset.publicKey.toBase58(),
      binStep: preset.account.binStep,
      baseFactor: preset.account.baseFactor.toString(),
    }));
  }

  deriveSharePool(params: {
    shareMint: string;
    quoteMint: string;
    binStep: number;
    baseFactor: string;
  }): string {
    return deriveSharePoolAddress(
      new PublicKey(params.shareMint),
      new PublicKey(params.quoteMint),
      params.binStep,
      params.baseFactor,
    ).toBase58();
  }

  private async exists(pool: PublicKey): Promise<boolean> {
    try {
      await dlmm().create(this.options.connection, pool, { cluster: this.options.cluster });
      return true;
    } catch {
      return false;
    }
  }

  async buildCreatePair(params: SharePoolParams): Promise<CreatePairResult> {
    const [tokenX, tokenY] = sortMints(params.shareMint, params.quoteMint);
    const pool = deriveLbPair2(
      tokenX,
      tokenY,
      new BN(params.binStep),
      new BN(params.baseFactor),
      DLMM_PROGRAM_ID,
    )[0];
    if (await this.exists(pool)) {
      return { pool: pool.toBase58(), created: false, transaction: null };
    }

    const activeId = dlmm().getBinIdFromPrice(params.initialPrice, params.binStep, true);
    const transaction = await dlmm().createLbPair2(
      this.options.connection,
      new PublicKey(params.owner),
      tokenX,
      tokenY,
      new PublicKey(params.presetParameter),
      new BN(activeId),
      { cluster: this.options.cluster },
    );
    return { pool: pool.toBase58(), created: true, transaction };
  }

  async buildSeedLadder(params: SeedLadderParams): Promise<SeedLadderResult> {
    const pool = await dlmm().create(this.options.connection, new PublicKey(params.poolAddress), {
      cluster: this.options.cluster,
    });
    const activeBin = await pool.getActiveBin();

    const share = new PublicKey(params.shareMint);
    const shareIsTokenX = share.toBuffer().compare(new PublicKey(params.quoteMint).toBuffer()) < 0;

    // Shares are whole tokens; DLMM deposits are denominated in the share's smallest unit.
    const decimals = (await getMint(this.options.connection, share)).decimals;
    const baseUnits = new BN(Math.round(params.plan.totalOfferShares).toString()).mul(
      powerOfTen(decimals),
    );

    let minBinId: number;
    let maxBinId: number;
    let totalX = new BN(0);
    let totalY = new BN(0);

    if (shareIsTokenX) {
      // Selling X is an ask: liquidity above the active bin, priced in quote per share.
      minBinId = dlmm().getBinIdFromPrice(params.plan.rangeLowUsd, params.binStep, true);
      maxBinId = dlmm().getBinIdFromPrice(params.plan.rangeHighUsd, params.binStep, false);
      minBinId = Math.max(minBinId, activeBin.binId + 1);
      maxBinId = Math.max(maxBinId, minBinId + 1);
      totalX = baseUnits;
    } else {
      // Selling Y mirrors the ladder below the active bin, priced in share per quote.
      minBinId = dlmm().getBinIdFromPrice(1 / params.plan.rangeHighUsd, params.binStep, true);
      maxBinId = dlmm().getBinIdFromPrice(1 / params.plan.rangeLowUsd, params.binStep, false);
      maxBinId = Math.min(maxBinId, activeBin.binId - 1);
      minBinId = Math.min(minBinId, maxBinId - 1);
      totalY = baseUnits;
    }

    const transaction = await pool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: new PublicKey(params.positionPubKey),
      user: new PublicKey(params.owner),
      totalXAmount: totalX,
      totalYAmount: totalY,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: dlmmStrategyType().BidAsk as StrategyType,
        singleSidedX: shareIsTokenX,
      },
    });

    return {
      poolAddress: params.poolAddress,
      positionAddress: params.positionPubKey,
      minBinId,
      maxBinId,
      sharesOffered: Math.round(params.plan.totalOfferShares),
      shareIsTokenX,
      transaction,
    };
  }
}
