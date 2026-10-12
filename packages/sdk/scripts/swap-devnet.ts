/// One command that gives a securitized pool some trading volume, so "Crank claim" and "Harvest fees"
/// have something to do. A locked position only ever earns from swaps on its pool, so this is the only
/// way to make those buttons show real numbers.
///
///   KEYPAIR=~/.config/solana/devnet.json pnpm --filter @perpetua/sdk ops:swap -- <vaultAddress> [tokens]
///
/// It reads the vault from the API the app itself uses (so it needs no extra configuration), mints
/// itself a little of the pool's token A — the wallet that created the pool still holds that mint's
/// authority — and swaps it for token B. Then: Crank claim, then Harvest fees on the vault page.
import { readFileSync } from "node:fs";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { DammV2Adapter } from "../src/adapters/dammV2.js";
import { createConnection } from "../src/rpc.js";

const API = process.env.API ?? "https://perpetua-meteora.netlify.app/api";
const USAGE =
  "usage: KEYPAIR=<keypair.json> pnpm --filter @perpetua/sdk ops:swap -- <vaultAddress> [tokens=100]";

// pnpm forwards the `--` separator itself, so it is filtered out rather than mistaken for the vault.
const [vaultArgument, tokensArgument] = process.argv.slice(2).filter((value) => value !== "--");
const keypairPath = process.env.KEYPAIR;
if (!vaultArgument || !keypairPath) {
  console.error(USAGE);
  process.exit(1);
}

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]),
);
const connection = createConnection({ cluster: process.env.CLUSTER ?? "devnet" });
const cpAmm = new CpAmm(connection);
const adapter = new DammV2Adapter(connection);

console.log(`wallet ${payer.publicKey.toBase58()}`);

const lookup = await fetch(`${API}/v1/vaults/${vaultArgument}`);
if (!lookup.ok) {
  console.error(`vault lookup failed (${lookup.status}): ${await lookup.text()}`);
  process.exit(1);
}
const { vault } = (await lookup.json()) as { vault: { address: string; pool: string } };
const pool = new PublicKey(vault.pool);
console.log(`vault  ${vault.address}\npool   ${vault.pool}`);

const state = await adapter.fetchPool(pool);
const tokenA = state.tokenAMint;
const tokenB = state.tokenBMint;
const decimals = (await getMint(connection, tokenA)).decimals;
const whole = Number(tokensArgument ?? 100);
if (!Number.isFinite(whole) || whole <= 0) {
  console.error(`tokens must be a positive number, got "${tokensArgument}"`);
  process.exit(1);
}
const amountIn = new BN(whole).mul(new BN(10).pow(new BN(decimals)));

/// The pool's two tokens were minted by the wallet that opened the pool, so that wallet still holds
/// the mint authority and can hand itself something to trade against the pool.
const account = getAssociatedTokenAddressSync(tokenA, payer.publicKey, false, TOKEN_PROGRAM_ID);
await sendAndConfirmTransaction(
  connection,
  new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      account,
      payer.publicKey,
      tokenA,
    ),
    createMintToInstruction(tokenA, account, payer.publicKey, BigInt(amountIn.toString())),
  ),
  [payer],
);
console.log(`minted ${whole} of token A ${tokenA.toBase58()} to this wallet`);

const swap = await cpAmm.swap({
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
const signature = await sendAndConfirmTransaction(connection, swap, [payer]);

console.log(`swapped ${whole} token A -> token B  ${signature}`);
console.log(
  "trading fees are now on the locked position: open the vault page, click Crank claim, then Harvest fees.",
);
