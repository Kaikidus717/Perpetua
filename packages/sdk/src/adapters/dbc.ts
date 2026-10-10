import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithCustomSqrtPrices,
  createSqrtPrices,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { type Connection, PublicKey } from "@solana/web3.js";
import type { DbcLaunchParams, DbcLaunchResult, DbcPort } from "../ports.js";

const DEFAULT_CURVE_PRICES = [0.000000001, 0.00000000105, 0.000000002, 0.000001];
const DEFAULT_LIQUIDITY_WEIGHTS = [2, 1, 1];

export interface DbcAdapterOptions {
  connection: Connection;
  curvePrices?: number[];
  liquidityWeights?: number[];
}

/// Builds the financeable DBC launch: the config and the pool it governs, in one unsigned
/// transaction. Nothing is signed here — the creator's wallet signs, so no key material reaches the
/// API process.
export class DbcAdapter implements DbcPort {
  private readonly client: DynamicBondingCurveClient;

  constructor(private readonly options: DbcAdapterOptions) {
    this.client = DynamicBondingCurveClient.create(options.connection, "confirmed");
  }

  async buildLaunch(params: DbcLaunchParams): Promise<DbcLaunchResult> {
    const sqrtPrices = createSqrtPrices(
      this.options.curvePrices ?? DEFAULT_CURVE_PRICES,
      TokenDecimal.SIX,
      TokenDecimal.NINE,
    );

    const curve = buildCurveWithCustomSqrtPrices({
      token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority,
        totalTokenSupply: params.totalTokenSupply,
        leftover: 1_000,
      },
      fee: {
        baseFeeParams: {
          baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
          feeSchedulerParam: {
            startingFeeBps: 9_000,
            endingFeeBps: 120,
            numberOfPeriod: 60,
            totalDuration: 60,
          },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: params.creatorTradingFeePercentage,
        poolCreationFee: 1,
        enableFirstSwapWithMinFee: false,
      },
      migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
        migratedPoolFee: {
          collectFeeMode: MigratedCollectFeeMode.QuoteToken,
          dynamicFee: DammV2DynamicFeeMode.Enabled,
          poolFeeBps: 120,
          baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        },
      },
      liquidityDistribution: {
        partnerLiquidityPercentage: params.partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage: params.partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage: params.creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage: params.creatorPermanentLockedLiquidityPercentage,
      },
      lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
      },
      activationType: ActivationType.Timestamp,
      sqrtPrices,
      liquidityWeights: this.options.liquidityWeights ?? DEFAULT_LIQUIDITY_WEIGHTS,
    });

    const creator = new PublicKey(params.creator);
    const config = new PublicKey(params.config);
    const baseMint = new PublicKey(params.baseMint);
    const quoteMint = new PublicKey(params.quoteMint);

    const transaction = await this.client.partner.createConfigAndPool({
      ...curve,
      config,
      feeClaimer: new PublicKey(params.feeClaimer),
      leftoverReceiver: new PublicKey(params.leftoverReceiver),
      quoteMint,
      payer: creator,
      preCreatePoolParam: {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        poolCreator: creator,
        baseMint,
      },
    });

    return {
      config: params.config,
      pool: deriveDbcPoolAddress(quoteMint, baseMint, config).toBase58(),
      transaction,
    };
  }
}
