import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2");
const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";

/// Config: 8 disc + admin 32 + treasury 32 + fee u16 + bump u8 + paused bool
const CONFIG_LEN = 76;
/// Vault: 8 disc + 9 pubkeys + u64 + 2x u128 + 4x u64 + pubkey + i64 + u8 + u32
const VAULT_LEN = 413;
/// Stake: 8 disc + vault 32 + owner 32 + amount u64 + 2x debt u128 + 2x pending u64 + bump u8
const STAKE_LEN = 8 + 32 + 32 + 8 + 16 + 16 + 8 + 8 + 1;

function seed(label: string): Uint8Array {
  return Uint8Array.from(label, (char) => char.charCodeAt(0));
}

function findConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed("config")], PROGRAM_ID)[0];
}

function u64(data: Uint8Array, at: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(at, true);
}

function u128(data: Uint8Array, at: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return (view.getBigUint64(at + 8, true) << 64n) | view.getBigUint64(at, true);
}

function u32(data: Uint8Array, at: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at, true);
}

function pubkey(data: Uint8Array, at: number): string {
  return new PublicKey(data.slice(at, at + 32)).toBase58();
}

const FLAGS = [
  "COMPOUNDING_MODE",
  "PAUSABLE_MINT",
  "PERMANENT_DELEGATE_MINT",
  "TRANSFER_FEE_MINT",
  "YOUNG_POOL",
  "LOW_LIQUIDITY",
];

async function main(): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const log = (line = "") => {
    console.log(line);
  };

  log(`cluster rpc: ${RPC}`);

  const program = await connection.getAccountInfo(PROGRAM_ID);
  log(
    `program: ${program ? `${program.data.length} bytes, executable=${program.executable}, owner=${program.owner.toBase58()}` : "NOT DEPLOYED"}`,
  );

  const config = findConfigPda();
  log(`config PDA: ${config.toBase58()}`);
  const configInfo = await connection.getAccountInfo(config);
  if (!configInfo) {
    log("config account: MISSING -> init_config has NEVER run on this cluster");
  } else {
    const data = new Uint8Array(configInfo.data);
    log(`config account: ${data.length} bytes (decoded CONFIG_LEN=${CONFIG_LEN})`);
    log(`  admin           ${pubkey(data, 8)}`);
    log(`  treasury        ${pubkey(data, 40)}`);
    log(`  protocol_fee_bps ${new DataView(data.buffer).getUint16(72, true)}`);
    log(`  paused_entry    ${data[75] !== 0}`);
  }

  log();
  log("all program accounts by size:");
  const accounts = await connection.getProgramAccounts(PROGRAM_ID);
  const bySize = new Map<number, number>();
  for (const { account } of accounts) {
    bySize.set(account.data.length, (bySize.get(account.data.length) ?? 0) + 1);
  }
  if (accounts.length === 0) log("  (none)");
  const label = (size: number) =>
    size === CONFIG_LEN
      ? "Config"
      : size === VAULT_LEN
        ? "Vault"
        : size === STAKE_LEN
          ? "Stake"
          : "?";
  for (const [size, count] of [...bySize].sort((a, b) => a[0] - b[0])) {
    log(`  ${String(count).padStart(3)} x ${size} bytes  ${label(size)}`);
  }

  log();
  log(`vaults (dataSize=${VAULT_LEN}):`);
  const vaults = accounts.filter(({ account }) => account.data.length === VAULT_LEN);
  for (const { pubkey: key, account } of vaults) {
    const data = new Uint8Array(account.data);
    const flags = u32(data, 409);
    log(`  ${key.toBase58()}`);
    log(`    pool            ${pubkey(data, 8)}`);
    log(`    position        ${pubkey(data, 40)}`);
    log(`    share_mint      ${pubkey(data, 264)}`);
    log(`    creator         ${pubkey(data, 368)}`);
    log(`    total_staked    ${u64(data, 296)}`);
    log(`    acc_fee_share_a ${u128(data, 304)}`);
    log(`    acc_fee_share_b ${u128(data, 320)}`);
    log(`    carry_a/b       ${u64(data, 336)} / ${u64(data, 344)}`);
    log(`    claimed_a/b     ${u64(data, 352)} / ${u64(data, 360)}`);
    log(
      `    risk_flags      ${flags} ${FLAGS.filter((_, i) => (flags >> i) & 1).join(", ") || "(none)"}`,
    );
  }

  log();
  log(
    `stakes (dataSize=${STAKE_LEN}): ${accounts.filter(({ account }) => account.data.length === STAKE_LEN).length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
