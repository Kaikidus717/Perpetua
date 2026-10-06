import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";
import { createConnection } from "../src/rpc.js";

// The offsets `programs/perpetua_vault/src/cpi.rs` uses to read the lock buckets.
const UNLOCKED_OFFSET = 152;
const VESTED_OFFSET = 168;
const PERMANENT_LOCK_OFFSET = 184;

function readU128(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(data[offset + index] ?? 0);
  }
  return value;
}

async function main(): Promise<void> {
  // The DAMM v2 program and its account layout are identical on every cluster, so a mainnet
  // position validates the offsets just as well as a devnet one and needs no funded wallet.
  const connection = createConnection({ cluster: process.env.CLUSTER ?? "mainnet-beta" });
  const cpAmm = new CpAmm(connection);

  const explicit = process.env.POSITION;
  let positions: PublicKey[];

  if (explicit) {
    positions = [new PublicKey(explicit)];
  } else {
    // A real pool with permanently locked liquidity, discovered through
    // https://damm-v2.datapi.meteora.ag/pools
    const poolAddress = process.env.POOL ?? "BKH29Cr5mZf8eahp7vD28jaBqU9HavY9v6SAbphbSA2D";
    const pool = new PublicKey(poolAddress);
    const rows = (await cpAmm.getAllPositionsByPool(pool)) as Array<
      { position?: PublicKey } | PublicKey
    >;
    console.log(`pool ${poolAddress} has ${rows.length} positions`);
    positions = rows.map((row) =>
      row instanceof PublicKey ? row : (row as { publicKey: PublicKey }).publicKey,
    );
    if (positions.length === 0) {
      console.log("no positions found; pass POSITION=<address>");
      return;
    }
  }

  let checked = 0;
  let locked = 0;

  for (const [index, position] of positions.entries()) {
    const account = await connection.getAccountInfo(position, "confirmed");
    if (!account) {
      console.log(`position ${index}: not found, skipping`);
      continue;
    }

    const decoded = await cpAmm.fetchPositionState(position);
    const raw = account.data;

    const unlocked = readU128(raw, UNLOCKED_OFFSET);
    const vested = readU128(raw, VESTED_OFFSET);
    const permanent = readU128(raw, PERMANENT_LOCK_OFFSET);

    const expectUnlocked = BigInt(decoded.unlockedLiquidity.toString());
    const expectVested = BigInt(decoded.vestedLiquidity.toString());
    const expectPermanent = BigInt(decoded.permanentLockedLiquidity.toString());

    if (unlocked !== expectUnlocked || vested !== expectVested || permanent !== expectPermanent) {
      console.log(`position ${position.toBase58()}`);
      console.log(`  raw unlocked=${unlocked} vested=${vested} permanent=${permanent}`);
      console.log(
        `  sdk unlocked=${expectUnlocked} vested=${expectVested} permanent=${expectPermanent}`,
      );
      throw new Error("offset mismatch: the program's constants need updating");
    }

    checked += 1;
    if (permanent > 0n) locked += 1;
  }

  console.log(`verified ${checked} positions against the on-chain accounts`);
  console.log(`positions with a permanent lock: ${locked}`);
  if (locked === 0) {
    console.log(
      "note: none of these positions carry a permanent lock; pass POSITION= for one that does",
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
