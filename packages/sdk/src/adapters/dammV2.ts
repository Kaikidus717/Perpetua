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
  getMint,
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

export interface VolumeSwapParams {
  /// Wallet that pays and trades. It signs in the browser; nothing is signed here.
  owner: string;
  pool: string;
  tokenAMint: string;
  tokenBMint: string;
  /// Whole tokens of token A to trade. Small on purpose: the fee it leaves behind is the point.
  tokens?: number;
}

export interface VolumeSwapResult {
  pool: string;
  swap: Transaction;
  /// Instructions that give a wallet holding none of token A something to trade, when it still has the
  /// mint authority. `null` once the wallet already has some.
  fuel: Transaction | null;
  amountIn: string;
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

  /// Builds an ordinary swap on this pool — token A in, token B out — plus, when the wallet still holds
  /// the pool token's mint authority and has nothing to trade, the instructions that give it some.
  ///
  /// A locked position only ever earns from swaps, so a pool nobody trades can never pay a share
  /// holder: this is what lets a devnet demo show a crank and a harvest with real numbers in them,
  /// without a second wallet or a faucet. Two transactions come back because the fuel and the swap
  /// together do not fit one 1232-byte packet, and `fuel` is null once the wallet has some.
  async buildVolumeSwap(params: VolumeSwapParams): Promise<VolumeSwapResult> {
    const payer = new PublicKey(params.owner);
    const pool = new PublicKey(params.pool);
    const tokenA = new PublicKey(params.tokenAMint);
    const tokenB = new PublicKey(params.tokenBMint);
    const state = await this.fetchPool(pool);

    /// The pool's tokens are plain SPL mints (created by the wallet that opened the pool), so the
    /// classic token program is the right one for both the mint lookup and the swap.
    const decimals = (await getMint(this.connection, tokenA, "confirmed", TOKEN_PROGRAM_ID))
      .decimals;
    const amountIn = new BN(params.tokens ?? 10).mul(new BN(10).pow(new BN(decimals)));
    const account = getAssociatedTokenAddressSync(tokenA, payer, false, TOKEN_PROGRAM_ID);
    const held = await this.connection
      .getTokenAccountBalance(account)
      .then((balance) => BigInt(balance.value.amount))
      .catch(() => 0n);

    let fuel: Transaction | null = null;
    if (held < BigInt(amountIn.toString())) {
      const authority = (await getMint(this.connection, tokenA, "confirmed", TOKEN_PROGRAM_ID))
        .mintAuthority;
      if (authority?.equals(payer)) {
        /// Mint enough for several rounds of volume, so only the first click carries two signatures.
        const fuelAmount = BigInt(amountIn.toString()) * 10n;
        fuel = new Transaction()
          .add(
            createAssociatedTokenAccountIdempotentInstruction(
              payer,
              account,
              payer,
              tokenA,
              TOKEN_PROGRAM_ID,
            ),
          )
          .add(createMintToInstruction(tokenA, account, payer, fuelAmount, [], TOKEN_PROGRAM_ID));
      }
    }

    const swap = await this.cpAmm.swap({
      payer,
      pool,
      inputTokenMint: tokenA,
      outputTokenMint: tokenB,
      amountIn,
      /// A demo trade against your own pool: the point is the fee it leaves behind, not the price.
      minimumAmountOut: new BN(0),
      tokenAMint: tokenA,
      tokenBMint: tokenB,
      tokenAVault: state.tokenAVault,
      tokenBVault: state.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null,
    });

    return { pool: pool.toBase58(), swap, fuel, amountIn: amountIn.toString() };
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
