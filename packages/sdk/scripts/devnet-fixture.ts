import { readFileSync } from "node:fs";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  CpAmm,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  type PoolFeesParams,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
} from "@meteora-ag/cp-amm-sdk";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeMintInstruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  type Connection,
  Keypair,
  type PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";

export interface DevnetFixture {
  pool: PublicKey;
  position: PublicKey;
  positionNft: PublicKey;
}

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

async function fund(connection: Connection, payer: Keypair): Promise<void> {
  const balance = await connection.getBalance(payer.publicKey);
  if (balance > 0.2e9) return;
  const path = process.env.KEYPAIR;
  if (path) return;
  const signature = await connection.requestAirdrop(payer.publicKey, 2e9);
  await connection.confirmTransaction(signature, "confirmed");
}

async function createMint(connection: Connection, payer: Keypair): Promise<PublicKey> {
  const mint = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(connection);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, 6, payer.publicKey, payer.publicKey),
  );
  await connection.sendTransaction(transaction, [payer, mint], { skipPreflight: false });
  return mint.publicKey;
}

async function fundMint(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  amount: bigint,
): Promise<void> {
  const account = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey,
  );
  const transaction = new Transaction().add(
    createMintToInstruction(mint, account, payer.publicKey, amount),
  );
  await connection.sendTransaction(transaction, [payer], { skipPreflight: false });
}

/// Creates a devnet DAMM v2 pool whose initial position is permanently locked, so the
/// program's `parse_position_lock` offsets can be checked against a real account.
export async function createDevnetLockedPosition(
  connection: Connection,
  existing?: Keypair,
): Promise<DevnetFixture> {
  const payer =
    (existing ?? process.env.KEYPAIR)
      ? loadKeypair(process.env.KEYPAIR as string)
      : Keypair.generate();
  await fund(connection, payer);

  const cpAmm = new CpAmm(connection);
  const tokenA = await createMint(connection, payer);
  const tokenB = await createMint(connection, payer);
  const amountA = new BN(1_000_000_000);
  const amountB = new BN(1_000_000_000);
  await fundMint(connection, payer, tokenA, BigInt(amountA.toString()));
  await fundMint(connection, payer, tokenB, BigInt(amountB.toString()));

  const initSqrtPrice = getSqrtPriceFromPrice("1", 6, 6);
  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA: amountA,
    maxAmountTokenB: amountB,
    sqrtPrice: initSqrtPrice,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    collectFeeMode: CollectFeeMode.BothToken,
  });
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

  const positionNft = Keypair.generate();
  const created = await cpAmm.createCustomPool({
    payer: payer.publicKey,
    creator: payer.publicKey,
    positionNft: positionNft.publicKey,
    tokenAMint: tokenA,
    tokenBMint: tokenB,
    tokenAAmount: amountA,
    tokenBAmount: amountB,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    liquidityDelta,
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
  created.tx.feePayer = payer.publicKey;
  created.tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  await connection.sendTransaction(created.tx, [payer, positionNft], { skipPreflight: false });

  return {
    pool: created.pool,
    position: created.position,
    positionNft: positionNft.publicKey,
  };
}
