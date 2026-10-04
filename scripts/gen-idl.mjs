import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const PROGRAM_ID = "3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit";
const VERSION = "0.1.0";

const disc = (prefix, name) =>
  Array.from(createHash("sha256").update(`${prefix}:${name}`).digest().subarray(0, 8));

const u8 = "u8";
const u16 = "u16";
const u64 = "u64";
const u128 = "u128";
const i64 = "i64";
const pubkey = "pubkey";

const struct = (name, fields) => ({ name, fields });

const ACCOUNTS = [
  struct("Config", [
    { name: "admin", type: pubkey },
    { name: "treasury", type: pubkey },
    { name: "protocol_fee_bps", type: u16 },
    { name: "bump", type: u8 },
  ]),
  struct("Vault", [
    { name: "pool", type: pubkey },
    { name: "position", type: pubkey },
    { name: "position_nft_mint", type: pubkey },
    { name: "position_nft_account", type: pubkey },
    { name: "token_a_mint", type: pubkey },
    { name: "token_b_mint", type: pubkey },
    { name: "token_a_program", type: pubkey },
    { name: "token_b_program", type: pubkey },
    { name: "share_mint", type: pubkey },
    { name: "total_staked", type: u64 },
    { name: "acc_fee_per_share_a", type: u128 },
    { name: "acc_fee_per_share_b", type: u128 },
    { name: "carry_a", type: u64 },
    { name: "carry_b", type: u64 },
    { name: "total_claimed_a", type: u64 },
    { name: "total_claimed_b", type: u64 },
    { name: "creator", type: pubkey },
    { name: "created_at", type: i64 },
    { name: "bump", type: u8 },
  ]),
  struct("Stake", [
    { name: "vault", type: pubkey },
    { name: "owner", type: pubkey },
    { name: "amount", type: u64 },
    { name: "debt_a", type: u128 },
    { name: "debt_b", type: u128 },
    { name: "pending_a", type: u64 },
    { name: "pending_b", type: u64 },
    { name: "bump", type: u8 },
  ]),
];

const EVENTS = [
  struct("ConfigInitialized", [
    { name: "admin", type: pubkey },
    { name: "protocol_fee_bps", type: u16 },
  ]),
  struct("VaultCreated", [
    { name: "vault", type: pubkey },
    { name: "pool", type: pubkey },
    { name: "position", type: pubkey },
    { name: "share_mint", type: pubkey },
    { name: "creator", type: pubkey },
  ]),
  struct("FeesClaimed", [
    { name: "vault", type: pubkey },
    { name: "delta_a", type: u64 },
    { name: "delta_b", type: u64 },
    { name: "total_staked", type: u64 },
  ]),
  struct("Staked", [
    { name: "vault", type: pubkey },
    { name: "owner", type: pubkey },
    { name: "amount", type: u64 },
  ]),
  struct("Unstaked", [
    { name: "vault", type: pubkey },
    { name: "owner", type: pubkey },
    { name: "amount", type: u64 },
  ]),
  struct("Harvested", [
    { name: "vault", type: pubkey },
    { name: "owner", type: pubkey },
    { name: "amount_a", type: u64 },
    { name: "amount_b", type: u64 },
  ]),
];

const acc = (name, flags = {}) => ({ name, ...flags });
const ro = (name) => acc(name);
const wr = (name) => acc(name, { writable: true });
const sg = (name, flags = {}) => acc(name, { ...flags, signer: true });

// Mirrors the fifteen accounts DAMM v2 `claim_position_fee` requires, plus the two
// treasury accounts used for the optional protocol skim.
const claimAccounts = [
  ro("pool_authority"),
  ro("pool"),
  wr("position"),
  ro("position_nft_account"),
  ro("token_a_mint"),
  ro("token_b_mint"),
  wr("token_a_vault"),
  wr("token_b_vault"),
  ro("event_authority"),
  wr("vault_a_account"),
  wr("vault_b_account"),
  ro("treasury"),
  wr("treasury_a_account"),
  wr("treasury_b_account"),
  ro("token_a_program"),
  ro("token_b_program"),
  ro("cp_amm_program"),
];

const shareAccounts = [
  ro("share_mint"),
  wr("owner_share_account"),
  wr("vault_share_account"),
  ro("share_token_program"),
];

const INSTRUCTIONS = [
  {
    name: "init_config",
    args: [{ name: "protocol_fee_bps", type: u16 }],
    accounts: [sg("admin", { writable: true }), wr("config"), ro("system_program")],
  },
  {
    name: "create_vault",
    args: [],
    accounts: [
      sg("creator", { writable: true }),
      ro("config"),
      ro("pool"),
      wr("position"),
      ro("position_nft_mint"),
      wr("position_nft_account"),
      ro("position_nft_program"),
      ro("token_a_mint"),
      ro("token_b_mint"),
      ro("token_a_program"),
      ro("token_b_program"),
      wr("vault"),
      sg("share_mint", { writable: true }),
      wr("creator_share_account"),
      ro("token_program"),
      ro("associated_token_program"),
      ro("system_program"),
      ro("cp_amm_program"),
      ro("rent"),
    ],
  },
  {
    name: "crank_claim",
    args: [],
    accounts: [sg("caller"), ro("config"), wr("vault"), ...claimAccounts],
  },
  {
    name: "stake",
    args: [{ name: "amount", type: u64 }],
    accounts: [
      sg("owner", { writable: true }),
      ro("config"),
      wr("vault"),
      ...claimAccounts,
      wr("stake"),
      ...shareAccounts,
      ro("system_program"),
    ],
  },
  {
    name: "unstake",
    args: [{ name: "amount", type: u64 }],
    accounts: [
      sg("owner", { writable: true }),
      ro("config"),
      wr("vault"),
      ...claimAccounts,
      wr("stake"),
      ...shareAccounts,
    ],
  },
  {
    name: "unstake_no_claim",
    args: [{ name: "amount", type: u64 }],
    accounts: [sg("owner", { writable: true }), wr("vault"), wr("stake"), ...shareAccounts],
  },
  {
    name: "harvest",
    args: [],
    accounts: [
      sg("owner", { writable: true }),
      wr("vault"),
      wr("stake"),
      ro("token_a_mint"),
      ro("token_b_mint"),
      wr("vault_a_account"),
      wr("vault_b_account"),
      wr("owner_a_account"),
      wr("owner_b_account"),
      ro("token_a_program"),
      ro("token_b_program"),
    ],
  },
];

const ERRORS = [
  { code: 6000, name: "Unauthorized", msg: "caller is not authorized" },
  { code: 6001, name: "PositionNotFullyLocked", msg: "position must be fully permanently locked" },
  { code: 6002, name: "NoPermanentLock", msg: "position has no permanent-locked liquidity" },
  { code: 6003, name: "MintAuthorityNotRevoked", msg: "share mint authority must be revoked" },
  { code: 6004, name: "InsufficientShares", msg: "not enough staked shares" },
  { code: 6005, name: "NothingToHarvest", msg: "no pending fees to harvest" },
  { code: 6006, name: "WrongShareMint", msg: "share mint does not match the vault" },
  { code: 6007, name: "MathOverflow", msg: "arithmetic overflow" },
  { code: 6008, name: "InvalidPool", msg: "pool does not match the vault" },
];

const toCamel = (value) => value.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
const toField = (f) => ({ name: toCamel(f.name), type: f.type });
const toType = (s) => ({ kind: "struct", fields: s.fields.map(toField) });
const toAccount = (a) => ({ ...a, name: toCamel(a.name) });

const idl = {
  address: PROGRAM_ID,
  metadata: { name: "perpetua_vault", version: VERSION, spec: VERSION },
  instructions: INSTRUCTIONS.map((ix) => ({
    name: toCamel(ix.name),
    discriminator: disc("global", ix.name),
    accounts: ix.accounts.map(toAccount),
    args: ix.args.map((arg) => ({ name: toCamel(arg.name), type: arg.type })),
  })),
  accounts: ACCOUNTS.map((a) => ({
    name: a.name,
    discriminator: disc("account", a.name),
  })),
  events: EVENTS.map((e) => ({
    name: e.name,
    discriminator: disc("event", e.name),
  })),
  errors: ERRORS,
  types: [...ACCOUNTS, ...EVENTS].map((definition) => ({
    name: definition.name,
    type: toType(definition),
  })),
};

const jsonDir = join(repoRoot, "programs", "perpetua_vault", "idl");
mkdirSync(jsonDir, { recursive: true });
writeFileSync(join(jsonDir, "perpetua_vault.json"), `${JSON.stringify(idl, null, 2)}\n`, "utf8");

const tsDir = join(repoRoot, "packages", "sdk", "src", "idl");
mkdirSync(tsDir, { recursive: true });
writeFileSync(
  join(tsDir, "perpetua_vault.ts"),
  `export const PERPETUA_VAULT_IDL = ${JSON.stringify(idl, null, 2)} as const;\n`,
  "utf8",
);

console.log(
  `perpetua_vault ${PROGRAM_ID}: ${INSTRUCTIONS.length} instructions, ${ACCOUNTS.length} accounts, ${EVENTS.length} events`,
);
