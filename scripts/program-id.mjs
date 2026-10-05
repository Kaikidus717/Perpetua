import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const LIB_RS = join(repoRoot, "programs", "perpetua_vault", "src", "lib.rs");
const ANCHOR_TOML = join(repoRoot, "Anchor.toml");

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

/**
 * `declare_id!` is the single source of truth. Every other reference — the IDL, the SDK, the
 * LiteSVM harness, the docs — is derived from it, so the declared address cannot drift from the
 * keypair the program is deployed with.
 */
export function declaredProgramId(libRsPath = LIB_RS) {
  const source = readFileSync(libRsPath, "utf8");
  const match = source.match(/declare_id!\("([^"]+)"\)/);
  if (!match) throw new Error(`no declare_id! found in ${libRsPath}`);
  if (!BASE58.test(match[1])) throw new Error(`declare_id! is not a base58 address: ${match[1]}`);
  return match[1];
}

/** Every `perpetua_vault = "..."` entry in Anchor.toml, keyed by cluster. */
export function anchorTomlProgramIds(anchorTomlPath = ANCHOR_TOML) {
  const source = readFileSync(anchorTomlPath, "utf8");
  const found = new Map();
  let cluster = "(unknown)";
  for (const line of source.split(/\r?\n/)) {
    const section = line.match(/^\[programs\.([^\]]+)\]/);
    if (section) {
      cluster = section[1];
      continue;
    }
    const entry = line.match(/^\s*perpetua_vault\s*=\s*"([^"]+)"/);
    if (entry) found.set(cluster, entry[1]);
  }
  return found;
}

/** Throws unless Anchor.toml agrees with `declare_id!` on every cluster. */
export function assertConsistent(libRsPath = LIB_RS, anchorTomlPath = ANCHOR_TOML) {
  const declared = declaredProgramId(libRsPath);
  const entries = anchorTomlProgramIds(anchorTomlPath);
  if (entries.size === 0) {
    throw new Error(`no [programs.*] perpetua_vault entries found in ${anchorTomlPath}`);
  }
  const mismatched = [...entries].filter(([, id]) => id !== declared);
  if (mismatched.length > 0) {
    const detail = mismatched.map(([cluster, id]) => `  [programs.${cluster}] = ${id}`).join("\n");
    throw new Error(
      `Anchor.toml disagrees with declare_id! (${declared}):\n${detail}\nrun \`node scripts/program-id.mjs sync\``,
    );
  }
  return declared;
}
/** The devnet program keypair is committed so the deployed address is reproducible. Devnet only. */
export const KEYPAIR_SOURCE = join(repoRoot, "keys", "perpetua_vault-devnet.json");

/** Where `anchor build` and `anchor deploy` look for the program keypair. */
export const KEYPAIR_INSTALLED = join(repoRoot, "target", "deploy", "perpetua_vault-keypair.json");

/** Rewrites every `[programs.*]` entry in Anchor.toml to match `declare_id!`. */
export function syncAnchorToml(anchorTomlPath = ANCHOR_TOML) {
  const declared = declaredProgramId();
  const source = readFileSync(anchorTomlPath, "utf8");
  let updated = 0;
  const next = source.replace(/^(\s*perpetua_vault\s*=\s*")[^"]+(")/gm, (_m, head, tail) => {
    updated += 1;
    return `${head}${declared}${tail}`;
  });
  if (updated === 0) throw new Error(`no perpetua_vault entries to sync in ${anchorTomlPath}`);
  writeFileSync(anchorTomlPath, next, "utf8");
  return { declared, updated };
}

export function installKeypair() {
  mkdirSync(dirname(KEYPAIR_INSTALLED), { recursive: true });
  copyFileSync(KEYPAIR_SOURCE, KEYPAIR_INSTALLED);
  return KEYPAIR_INSTALLED;
}

async function main(argv) {
  const command = argv[2] ?? "check";

  if (command === "check") {
    const declared = assertedId();
    console.log(`declare_id!   ${declared}`);
    for (const [cluster, id] of anchorTomlProgramIds()) {
      console.log(`  ${cluster.padEnd(10)} ${id}`);
    }
    console.log("Anchor.toml agrees with declare_id! on every cluster");
    return;
  }

  if (command === "sync") {
    const { declared, updated } = syncAnchorToml();
    console.log(`synced ${updated} Anchor.toml entry/entries to ${declared}`);
    console.log("now regenerate the IDL: node scripts/gen-idl.mjs");
    return;
  }

  if (command === "install-keypair") {
    installKeypair();
    console.log(`installed ${KEYPAIR_SOURCE} -> ${KEYPAIR_INSTALLED}`);
    return;
  }

  console.error(`unknown command: ${command}`);
  console.error("usage: node scripts/program-id.mjs [check|sync|install-keypair]");
  process.exit(2);
}

const assertedId = () => assertConsistent();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv);
}
