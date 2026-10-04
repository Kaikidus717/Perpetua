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
import { type Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import type { DbcConfigParams, DbcLaunchResult, DbcPoolParams, DbcPort } from "../ports.js";

const DEFAULT_CURVE_PRICES = [0.000000001, 0.00000000105, 0.000000002, 0.000001];
const DEFAULT_LIQUIDITY_WEIGHTS = [2, 1, 1];

export interface DbcAdapterOptions {
  connection: Connection;
  signer: Keypair;
  curvePrices?: number[];
  liquidityWeights?: number[];
}

export class DbcAdapter implements DbcPort {
  private readonly client: DynamicBondingCurveClient;

  constructor(private readonly options: DbcAdapterOptions) {
    this.client = DynamicBondingCurveClient.create(options.connection, "confirmed");
  }

  async createConfig(params: DbcConfigParams): Promise<string> {
    const config = Keypair.generate();
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

    const transaction = await this.client.partner.createConfig({
      ...curve,
      config: config.publicKey,
      feeClaimer: new PublicKey(params.feeClaimer),
      leftoverReceiver: new PublicKey(params.leftoverReceiver),
      quoteMint: new PublicKey(params.quoteMint),
      payer: this.options.signer.publicKey,
    });

    await sendAndConfirmTransaction(this.options.connection, transaction, [
      this.options.signer,
      config,
    ]);
    return config.publicKey.toBase58();
  }

  async createPool(params: DbcPoolParams): Promise<DbcLaunchResult> {
    const config = new PublicKey(params.config);
    const baseMint = new PublicKey(params.baseMint);

    const transaction = await this.client.creator.createPool({
      baseMint,
      config,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      payer: this.options.signer.publicKey,
      poolCreator: this.options.signer.publicKey,
    });

    await sendAndConfirmTransaction(this.options.connection, transaction, [this.options.signer]);

    return {
      config: params.config,
      pool: deriveDbcPoolAddress(new PublicKey(params.quoteMint), baseMint, config).toBase58(),
    };
  }
}
