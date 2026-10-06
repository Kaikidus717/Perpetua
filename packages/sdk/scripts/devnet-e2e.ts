import { readFileSync } from "node:fs";
import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
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
import { SHARE_SUPPLY, resolveNetwork } from "@perpetua/shared";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type Transaction as Tx,
  type VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { DammV2Adapter } from "../src/adapters/dammV2.js";
import { createConnection } from "../src/rpc.js";
import { PerpetuaVaultClient } from "../src/vault/client.js";
import { findConfigPda, findStakePda, findVaultPda } from "../src/vault/pda.js";

const network = resolveNetwork(process.env.CLUSTER ?? "devnet");
const CP_AMM_PROGRAM = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function readonlyWallet(payer: Keypair): Wallet {
  return {
    publicKey: payer.publicKey,
    payer,
    signTransaction: async <T extends Tx | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Tx | VersionedTransaction>(txs: T[]) => txs,
  };
}

async function createMint(
  connection: Connection,
  payer: Keypair,
  decimals: number,
): Promise<PublicKey> {
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
    createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, payer.publicKey),
  );
  await sendAndConfirmTransaction(connection, transaction, [payer, mint]);
  return mint.publicKey;
}

async function fundAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  amount: bigint,
): Promise<PublicKey> {
  const account = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey,
  );
  const transaction = new Transaction().add(
    createMintToInstruction(mint, account, payer.publicKey, amount),
  );
  await sendAndConfirmTransaction(connection, transaction, [payer]);
  return account;
}

async function main(): Promise<void> {
  const keypairPath = process.env.KEYPAIR;
  if (!keypairPath) throw new Error("set KEYPAIR to a devnet keypair json path");

  const payer = loadKeypair(keypairPath);
  const connection = createConnection({ cluster: process.env.CLUSTER ?? "devnet" });
  const cpAmm = new CpAmm(connection);
  const adapter = new DammV2Adapter(connection);
  const provider = new AnchorProvider(connection, readonlyWallet(payer), {
    commitment: "confirmed",
  });
  const vault = PerpetuaVaultClient.create(provider);

  console.log(`cluster ${network.cluster} as ${payer.publicKey.toBase58()}`);
  console.log(`balance ${(await connection.getBalance(payer.publicKey)) / 1e9} SOL`);

  // `create_vault` requires `Config` to exist, so a fresh cluster needs `init_config` first.
  // Idempotent: skip when the account is already there.
  const [config] = findConfigPda(vault.programId);
  if (await connection.getAccountInfo(config)) {
    console.log(`init_config: ${config.toBase58()} already exists`);
  } else {
    console.log(`init_config: creating Config at ${config.toBase58()}`);
    const initIx = await vault.initConfig(
      { admin: payer.publicKey, config, systemProgram: SystemProgram.programId },
      0,
    );
    await provider.sendAndConfirm(new Transaction().add(initIx), [payer]);
  }

  const tokenA = await createMint(connection, payer, 6);
  const tokenB = await createMint(connection, payer, 6);
  const amountA = new BN(1_000_000_000);
  const amountB = new BN(1_000_000_000);
  await fundAccount(connection, payer, tokenA, BigInt(amountA.toString()));
  await fundAccount(connection, payer, tokenB, BigInt(amountB.toString()));
  console.log(`tokenA ${tokenA.toBase58()} tokenB ${tokenB.toBase58()}`);

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
  await sendAndConfirmTransaction(connection, created.tx, [payer, positionNft]);

  const pool = created.pool;
  const position = created.position;
  console.log(`pool ${pool.toBase58()} position ${position.toBase58()}`);

  const detail = await adapter.positionDetail(position);
  console.log(
    `lock state: permanent=${detail.permanentLockedLiquidity} unlocked=${detail.unlockedLiquidity} vested=${detail.vestedLiquidity}`,
  );

  const [vaultAddress] = findVaultPda(vault.programId, position);
  const shareMint = Keypair.generate();

  const createVaultIx = await vault.createVault({
    creator: payer.publicKey,
    config,
    pool,
    position,
    positionNftMint: new PublicKey(detail.nftMint),
    positionNftAccount: new PublicKey(detail.nftAccount),
    positionNftProgram: new PublicKey(detail.positionNftProgram),
    tokenAMint: tokenA,
    tokenBMint: tokenB,
    tokenAProgram: new PublicKey(detail.tokenAProgram),
    tokenBProgram: new PublicKey(detail.tokenBProgram),
    vault: vaultAddress,
    shareMint: shareMint.publicKey,
    creatorShareAccount: getAssociatedTokenAddressSync(shareMint.publicKey, payer.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
    systemProgram: SystemProgram.programId,
    cpAmmProgram: CP_AMM_PROGRAM,
  });
  await provider.sendAndConfirm(new Transaction().add(createVaultIx), [payer, shareMint]);
  console.log(`vault ${vaultAddress.toBase58()} shareMint ${shareMint.publicKey.toBase58()}`);

  const cfg = await vault.fetchConfig(config);
  const claim = await adapter.claimAccountsFor(
    {
      vault: vaultAddress,
      pool,
      position,
      positionNftAccount: new PublicKey(detail.nftAccount),
      tokenAMint: tokenA,
      tokenBMint: tokenB,
      tokenAProgram: new PublicKey(detail.tokenAProgram),
      tokenBProgram: new PublicKey(detail.tokenBProgram),
    },
    cfg.treasury,
  );
  // Generate real trading fees so there is something to claim and to harvest.
  await fundAccount(connection, payer, tokenA, BigInt(500_000_000));
  await fundAccount(connection, payer, tokenB, BigInt(500_000_000));

  async function swap(amountIn: BN): Promise<void> {
    const state = await adapter.fetchPool(pool);
    const tx = await cpAmm.swap({
      payer: payer.publicKey,
      pool,
      inputTokenMint: tokenA,
      outputTokenMint: tokenB,
      amountIn,
      minimumAmountOut: new BN(0),
      tokenAMint: tokenA,
      tokenBMint: tokenB,
      tokenAVault: state.tokenAVault,
      tokenBVault: state.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null,
    });
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }

  await swap(new BN(20_000_000));
  console.log("swap ok (fees now accrue on the position)");

  // 1. Claim while nothing is staked: the program banks the fees as carry.
  const setup = adapter.claimSetupInstructions(claim, vaultAddress, payer.publicKey);
  const crankIx = await vault.crankClaim({
    caller: payer.publicKey,
    config,
    vault: vaultAddress,
    ...claim,
  });
  await provider.sendAndConfirm(new Transaction().add(...setup, crankIx), [payer]);
  console.log("crank_claim ok (unstaked -> banked as carry)");

  // 2. Stake the entire supply. `create_vault` revoked the mint authority, so these are the only
  //    shares that will ever exist.
  const [stakeAddress] = findStakePda(vault.programId, vaultAddress, payer.publicKey);
  const stakeIx = await vault.stake(
    {
      owner: payer.publicKey,
      config,
      vault: vaultAddress,
      ...claim,
      stake: stakeAddress,
      shareMint: shareMint.publicKey,
      ownerShareAccount: getAssociatedTokenAddressSync(shareMint.publicKey, payer.publicKey),
      vaultShareAccount: getAssociatedTokenAddressSync(shareMint.publicKey, vaultAddress, true),
      shareTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    SHARE_SUPPLY,
  );
  await provider.sendAndConfirm(
    new Transaction().add(
      ...vault.shareAccountSetupInstructions({
        payer: payer.publicKey,
        shareMint: shareMint.publicKey,
        vault: vaultAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
      }),
      stakeIx,
    ),
    [payer],
  );
  const staked = await vault.fetchStake(stakeAddress);
  console.log(`stake ok: ${staked.amount.toString()} shares`);

  // 3. More fees, then claim again: the banked carry is released to the staker.
  await swap(new BN(20_000_000));
  const crankAgain = await vault.crankClaim({
    caller: payer.publicKey,
    config,
    vault: vaultAddress,
    ...claim,
  });
  await provider.sendAndConfirm(new Transaction().add(crankAgain), [payer]);
  const afterCrank = await vault.fetchVault(vaultAddress);
  console.log(
    `crank_claim ok (claimed_a=${afterCrank.totalClaimedA.toString()} claimed_b=${afterCrank.totalClaimedB.toString()} carry_b=${afterCrank.carryB.toString()})`,
  );

  // 4. Harvest pays the staker out.
  const harvestIx = await vault.harvest({
    owner: payer.publicKey,
    vault: vaultAddress,
    stake: stakeAddress,
    tokenAMint: tokenA,
    tokenBMint: tokenB,
    vaultAAccount: claim.vaultAAccount,
    vaultBAccount: claim.vaultBAccount,
    ownerAAccount: getAssociatedTokenAddressSync(tokenA, payer.publicKey),
    ownerBAccount: getAssociatedTokenAddressSync(tokenB, payer.publicKey),
    tokenAProgram: new PublicKey(detail.tokenAProgram),
    tokenBProgram: new PublicKey(detail.tokenBProgram),
  });
  await provider.sendAndConfirm(new Transaction().add(harvestIx), [payer]);
  const afterHarvest = await vault.fetchStake(stakeAddress);
  console.log(
    `harvest ok (pending_a=${afterHarvest.pendingA.toString()} pending_b=${afterHarvest.pendingB.toString()})`,
  );

  console.log("devnet end-to-end complete");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
