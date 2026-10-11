import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  CpAmm,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  type PoolFeesParams,
  type PoolState,
  type PositionState,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  getTokenProgram,
} from "@meteora-ag/cp-amm-sdk";
import { CP_AMM_POOL_AUTHORITY, PROGRAM_IDS } from "@perpetua/shared";
import type { PositionSummary } from "@perpetua/shared";
import {
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { findCpAmmEventAuthority, findCpAmmPositionNftAccount } from "../vault/pda.js";
import type { ClaimAccounts } from "../vault/types.js";

export interface PositionDetail {
  address: string;
  pool: string;
  nftMint: string;
  nftAccount: string;
  positionNftProgram: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAProgram: string;
  tokenBProgram: string;
  unlockedLiquidity: string;
  vestedLiquidity: string;
  permanentLockedLiquidity: string;
  feeAPending: string;
  feeBPending: string;
}

export interface VaultFeeRefs {
  vault: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
}

export interface LockedPositionParams {
  /// Wallet that pays and will own the position. It signs both transactions.
  payer: string;
  /// Fresh keypairs the caller generated. The mints sign the setup, the NFT signs the pool.
  mintA: string;
  mintB: string;
  positionNft: string;
  decimals?: number;
}

export interface LockedPositionResult {
  pool: string;
  position: string;
  mintA: string;
  mintB: string;
  /// Creates the two mints, their token accounts and the supply. Sign with the two mints.
  setup: Transaction;
  /// Creates the pool and its permanently locked position. Sign with the position NFT.
  create: Transaction;
}

type PositionRow = { position: PublicKey } | PublicKey;

function rowAddress(row: PositionRow): PublicKey {
  return row instanceof PublicKey ? row : row.position;
}

export class DammV2Adapter {
  readonly cpAmm: CpAmm;

  constructor(readonly connection: Connection) {
    this.cpAmm = new CpAmm(connection);
  }

  async walletPositions(owner: PublicKey): Promise<PositionSummary[]> {
    const details = await this.walletPositionDetails(owner);
    return details.map((detail) => ({
      address: detail.address,
      pool: detail.pool,
      nftMint: detail.nftMint,
      tokenAMint: detail.tokenAMint,
      tokenBMint: detail.tokenBMint,
      unlockedLiquidity: detail.unlockedLiquidity,
      vestedLiquidity: detail.vestedLiquidity,
      permanentLockedLiquidity: detail.permanentLockedLiquidity,
    }));
  }

  async fetchPosition(address: PublicKey): Promise<PositionState> {
    return this.cpAmm.fetchPositionState(address);
  }

  async fetchPool(address: PublicKey): Promise<PoolState> {
    return this.cpAmm.fetchPoolState(address);
  }

  async positionDetail(address: PublicKey): Promise<PositionDetail> {
    const state = await this.fetchPosition(address);
    const poolState = await this.fetchPool(state.pool);
    return {
      address: address.toBase58(),
      pool: state.pool.toBase58(),
      nftMint: state.nftMint.toBase58(),
      nftAccount: findCpAmmPositionNftAccount(state.nftMint).toBase58(),
      positionNftProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
      tokenAMint: poolState.tokenAMint.toBase58(),
      tokenBMint: poolState.tokenBMint.toBase58(),
      tokenAProgram: getTokenProgram(poolState.tokenAFlag).toBase58(),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag).toBase58(),
      unlockedLiquidity: state.unlockedLiquidity.toString(),
      vestedLiquidity: state.vestedLiquidity.toString(),
      permanentLockedLiquidity: state.permanentLockedLiquidity.toString(),
      feeAPending: state.feeAPending.toString(),
      feeBPending: state.feeBPending.toString(),
    };
  }

  async walletPositionDetails(owner: PublicKey): Promise<PositionDetail[]> {
    const rows = (await this.cpAmm.getPositionsByUser(owner)) as PositionRow[];
    const details: PositionDetail[] = [];
    for (const row of rows) {
      details.push(await this.positionDetail(rowAddress(row)));
    }
    return details;
  }

  /// The position NFT account is a cp-amm PDA seeded by the NFT mint, **not** an associated token
  /// account. Deriving an ATA here silently produces an empty address and every flow that needs the
  /// NFT then fails on the owner check.
  positionNftAccount(nftMint: PublicKey): PublicKey {
    return findCpAmmPositionNftAccount(nftMint);
  }

  /// Builds a brand-new DAMM v2 pool whose initial position is **permanently locked**, so a wallet
  /// that owns nothing can create something to securitize. Two unsigned transactions come back — the
  /// mints first, then the pool that needs them to exist — because one transaction would not fit.
  /// Nothing is signed here: the caller's wallet signs, and so do the fresh keypairs it generated for
  /// the mints and the position NFT.
  async buildLockedPosition(params: LockedPositionParams): Promise<LockedPositionResult> {
    const payer = new PublicKey(params.payer);
    const mintA = new PublicKey(params.mintA);
    const mintB = new PublicKey(params.mintB);
    const positionNft = new PublicKey(params.positionNft);
    const decimals = params.decimals ?? 6;
    const amount = new BN(1_000_000_000);

    const rent = await getMinimumBalanceForRentExemptMint(this.connection);
    const setup = new Transaction();
    const fund: Array<{ mint: PublicKey; account: PublicKey }> = [];
    for (const mint of [mintA, mintB]) {
      setup.add(
        SystemProgram.createAccount({
          fromPubkey: payer,
          newAccountPubkey: mint,
          space: MINT_SIZE,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mint, decimals, payer, payer),
      );
      fund.push({
        mint,
        account: getAssociatedTokenAddressSync(mint, payer, true, TOKEN_PROGRAM_ID),
      });
    }
    for (const { mint, account } of fund) {
      setup.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer,
          account,
          payer,
          mint,
          TOKEN_PROGRAM_ID,
        ),
        createMintToInstruction(mint, account, payer, BigInt(amount.toString())),
      );
    }

    const initSqrtPrice = getSqrtPriceFromPrice("1", decimals, decimals);
    const poolFees: PoolFeesParams = {
      baseFee: getBaseFeeParams({
        baseFeeMode: BaseFeeMode.FeeTimeSchedulerExponential,
        feeTimeSchedulerParam: {
          startingFeeBps: 100,
          endingFeeBps: 25,
          numberOfPeriod: 60,
          totalDuration: 3600,
        },
      }),
      compoundingFeeBps: 0,
      padding: 0,
      dynamicFee: getDynamicFeeParams(25),
    };

    const created = await this.cpAmm.createCustomPool({
      payer,
      creator: payer,
      positionNft,
      tokenAMint: mintA,
      tokenBMint: mintB,
      tokenAAmount: amount,
      tokenBAmount: amount,
      sqrtMinPrice: MIN_SQRT_PRICE,
      sqrtMaxPrice: MAX_SQRT_PRICE,
      liquidityDelta: this.cpAmm.getLiquidityDelta({
        maxAmountTokenA: amount,
        maxAmountTokenB: amount,
        sqrtPrice: initSqrtPrice,
        sqrtMinPrice: MIN_SQRT_PRICE,
        sqrtMaxPrice: MAX_SQRT_PRICE,
        collectFeeMode: CollectFeeMode.BothToken,
      }),
      initSqrtPrice,
      poolFees,
      hasAlphaVault: false,
      activationType: ActivationType.Timestamp,
      collectFeeMode: CollectFeeMode.BothToken,
      activationPoint: null,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      isLockLiquidity: true,
    });

    return {
      pool: created.pool.toBase58(),
      position: created.position.toBase58(),
      mintA: params.mintA,
      mintB: params.mintB,
      setup,
      create: created.tx,
    };
  }

  isPermanentLocked(state: PositionState): boolean {
    return this.cpAmm.isPermanentLockedPosition(state);
  }

  /// Everything the vault program needs to CPI `claim_position_fee`.
  async claimAccountsFor(refs: VaultFeeRefs, treasury: PublicKey): Promise<ClaimAccounts> {
    const poolState = await this.fetchPool(refs.pool);
    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    return {
      poolAuthority: new PublicKey(CP_AMM_POOL_AUTHORITY),
      pool: refs.pool,
      position: refs.position,
      positionNftAccount: refs.positionNftAccount,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      eventAuthority: findCpAmmEventAuthority()[0],
      vaultAAccount: getAssociatedTokenAddressSync(
        poolState.tokenAMint,
        refs.vault,
        true,
        tokenAProgram,
      ),
      vaultBAccount: getAssociatedTokenAddressSync(
        poolState.tokenBMint,
        refs.vault,
        true,
        tokenBProgram,
      ),
      treasury,
      treasuryAAccount: getAssociatedTokenAddressSync(
        poolState.tokenAMint,
        treasury,
        true,
        tokenAProgram,
      ),
      treasuryBAccount: getAssociatedTokenAddressSync(
        poolState.tokenBMint,
        treasury,
        true,
        tokenBProgram,
      ),
      tokenAProgram,
      tokenBProgram,
      cpAmmProgram: new PublicKey(PROGRAM_IDS.dammV2),
    };
  }

  /// cp-amm pays the claimed fees into the vault's own token accounts, and the protocol skim pays
  /// into the treasury's. Both are derived as associated token accounts, and `create_vault` does not
  /// create either — so the first `crank_claim` fails with `AccountNotInitialized`. These creates are
  /// idempotent and belong in the same transaction as the claim.
  claimSetupInstructions(
    claim: ClaimAccounts,
    vault: PublicKey,
    payer: PublicKey,
  ): TransactionInstruction[] {
    const accounts = [
      {
        account: claim.vaultAAccount,
        mint: claim.tokenAMint,
        owner: vault,
        program: claim.tokenAProgram,
      },
      {
        account: claim.vaultBAccount,
        mint: claim.tokenBMint,
        owner: vault,
        program: claim.tokenBProgram,
      },
      {
        account: claim.treasuryAAccount,
        mint: claim.tokenAMint,
        owner: claim.treasury,
        program: claim.tokenAProgram,
      },
      {
        account: claim.treasuryBAccount,
        mint: claim.tokenBMint,
        owner: claim.treasury,
        program: claim.tokenBProgram,
      },
    ];
    // Argument order is (payer, associatedToken, owner, mint, tokenProgram) — owner comes first.
    return accounts.map(({ account, mint, owner, program }) =>
      createAssociatedTokenAccountIdempotentInstruction(payer, account, owner, mint, program),
    );
  }
}
