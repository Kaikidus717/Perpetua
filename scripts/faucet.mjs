#!/usr/bin/env node
// Devnet SOL acquisition for the Perpetua deployment.
//
// The public devnet faucet is the only free source of devnet SOL, and it is fragile in two distinct
// ways that a naive retry loop cannot tell apart:
//
//   1. RATE LIMITED - the endpoint allows one airdrop per IP per window. `x-ratelimit-airdrop-*`
//      response headers say exactly how many credits are left, so there is no point hammering it.
//   2. SERVICE FAULT - the faucet backend returns `-32603 Internal error` while still consuming the
//      credit. Retrying makes it worse, not better, because it burns the next window too.
//
// This script separates those cases, sizes the request from the real cost of the artifact we are
// about to deploy, and can be re-run safely: state is persisted so a later run resumes rather than
// restarting.
//
// Usage:
//   node scripts/faucet.mjs [--pubkey <base58>] [--keypair <path>] [--so <path>]
//                           [--endpoint <url>] [--attempts 5] [--interval 60] [--max-interval 900]
//                           [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_KEYPAIR = "keys/perpetua_vault-devnet.json";
const DEFAULT_SO = "target/deploy/perpetua_vault.so";
const DEFAULT_ENDPOINT = "https://api.devnet.solana.com";
const WEB_FAUCET = "https://faucet.solana.com";
const STATE_PATH = "scripts/out/faucet-state.json";

/// Solana rent-exempt minimum is (size + 128) * 6960 lamports (2 years at 3480 lamports/byte-year).
const LAMPORTS_PER_BYTE = 6960;
const ACCOUNT_OVERHEAD = 128;
/// The endpoint caps a single airdrop at 2 SOL; anything larger is rejected outright.
const MAX_PER_REQUEST = 2_000_000_000n;
/// Headroom for the program account, the upgrade buffer and signature fees.
const FEE_BUFFER = 10_000_000n;

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) out += ALPHABET[digits[index]];
  return out;
}

/// Only these flags are numeric. A base58 pubkey can legitimately be all digits
/// (`11111111111111111111111111111111`), so coercing every numeric-looking value would corrupt it.
const NUMERIC_FLAGS = new Set(["attempts", "interval", "maxInterval"]);

function parseArgs(argv) {
  const flags = { attempts: 5, interval: 60, maxInterval: 900, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    const key = token.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} needs a value`);
    if (NUMERIC_FLAGS.has(key)) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0)
        throw new Error(`${token} must be a positive integer`);
      flags[key] = parsed;
    } else {
      flags[key] = value;
    }
    index += 1;
  }
  return flags;
}

function pubkeyFromFile(path) {
  if (!existsSync(path)) return null;
  const secret = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(secret) || secret.length !== 64) {
    throw new Error(`${path} is not a 64-byte Solana keypair`);
  }
  return base58(Uint8Array.from(secret.slice(32)));
}

/// `anchor deploy` spends from the provider wallet (`~/.config/solana/id.json`); the program keypair
/// only signs the program account, and it is a different address unless the committed devnet keypair
/// has also been copied to the CLI wallet. The payer is therefore what we fund by default, and both
/// addresses are reported so the distinction is never implicit.
function resolveTargets(flags) {
  const programPath = resolve(ROOT, DEFAULT_KEYPAIR);
  const program = pubkeyFromFile(programPath);

  if (flags.pubkey) return { pubkey: flags.pubkey, source: "--pubkey", program };

  if (flags.keypair) {
    const path = resolve(flags.keypair);
    const pubkey = pubkeyFromFile(path);
    if (!pubkey) throw new Error(`no keypair at ${path}`);
    return { pubkey, source: path, program };
  }

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const payerPath = join(home, ".config", "solana", "id.json");
  const payer = pubkeyFromFile(payerPath);
  if (payer) return { pubkey: payer, source: payerPath, program };
  if (program) return { pubkey: program, source: programPath, program };

  throw new Error(
    "no public key available: pass --pubkey, or create the deploy wallet with\n" +
      "  cp keys/perpetua_vault-devnet.json ~/.config/solana/id.json",
  );
}

function requiredLamports(flags) {
  const path = resolve(ROOT, flags.so ?? DEFAULT_SO);
  if (!existsSync(path)) {
    throw new Error(`no artifact at ${path}; build it first:\n  cargo build-sbf`);
  }
  const size = readFileSync(path).byteLength;
  return {
    size,
    lamports: BigInt(size + ACCOUNT_OVERHEAD) * BigInt(LAMPORTS_PER_BYTE) + FEE_BUFFER,
  };
}

async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`endpoint returned non-json (${response.status}): ${text.slice(0, 200)}`);
  }
  return {
    payload,
    credits: response.headers.get("x-ratelimit-airdrop-remaining"),
    limit: response.headers.get("x-ratelimit-airdrop-limit"),
  };
}

async function balanceOf(endpoint, pubkey) {
  const { payload } = await rpc(endpoint, "getBalance", [pubkey]);
  if (payload.error) throw new Error(`getBalance failed: ${payload.error.message}`);
  return BigInt(payload.result.value);
}

const sol = (lamports) => (Number(lamports) / 1e9).toFixed(3);

/// `Internal error` is the faucet failing after spending the credit; that is not a rate limit and
/// retrying it in a loop is actively harmful.
function classify(error) {
  const message = String(error?.message ?? error);
  if (/internal error/i.test(message)) return "fault";
  if (/rate limit|too many requests|-32005/i.test(message)) return "rate-limited";
  return "unknown";
}

function saveState(state) {
  const path = resolve(ROOT, STATE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function guidance(pubkey) {
  return [
    "",
    "The reliable alternative is the web faucet, which uses a different backend:",
    `  ${WEB_FAUCET}   (network: Devnet)`,
    `  address to paste: ${pubkey}`,
    "",
    "Then confirm the balance and deploy:",
    "  solana config set --url devnet",
    `  solana balance ${pubkey}`,
    "  node scripts/program-id.mjs install-keypair",
    "  anchor deploy --provider.cluster devnet",
  ].join("\n");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const endpoint = flags.endpoint ?? process.env.RPC_URL ?? DEFAULT_ENDPOINT;
  const { pubkey, source, program } = resolveTargets(flags);
  const { size, lamports: required } = requiredLamports(flags);

  console.log(`endpoint  ${endpoint}`);
  console.log(`funding   ${pubkey}`);
  console.log(`source    ${source}`);
  if (program && program !== pubkey) {
    console.log(`program   ${program}`);
    console.log(
      "          the deploy is paid from the funding address, so that is the one that needs",
    );
    console.log("          SOL; the program keypair only signs the program account");
  }
  console.log(`artifact  ${size} bytes -> ${sol(required)} SOL required`);

  const start = await balanceOf(endpoint, pubkey);
  console.log(`balance   ${sol(start)} SOL`);

  if (start >= required) {
    console.log(`\nalready funded (${sol(start)} >= ${sol(required)}). Nothing to do.`);
    return 0;
  }
  if (flags.dryRun) {
    console.log(`\ndry run: short by ${sol(required - start)} SOL`);
    return 1;
  }

  let interval = flags.interval * 1000;
  const attempts = [];

  for (let attempt = 1; attempt <= flags.attempts; attempt += 1) {
    const balance = await balanceOf(endpoint, pubkey);
    if (balance >= required) break;

    const want = required - balance;
    const amount = want > MAX_PER_REQUEST ? MAX_PER_REQUEST : want;
    console.log(`\n[${attempt}/${flags.attempts}] requesting ${sol(amount)} SOL`);

    const { payload, credits, limit } = await rpc(endpoint, "requestAirdrop", [
      pubkey,
      Number(amount),
    ]);

    if (typeof payload.result === "string") {
      console.log(`  accepted: ${payload.result}`);
      attempts.push({ attempt, requested: Number(amount), signature: payload.result });
      saveState({ pubkey, endpoint, attempts, updatedAt: new Date().toISOString() });
      continue;
    }

    const kind = classify(payload.error);
    console.log(`  rejected (${kind}): ${payload.error?.message ?? "unknown"}`);
    if (credits !== null) console.log(`  airdrop credits: ${credits}/${limit ?? "?"} remaining`);
    attempts.push({ attempt, requested: Number(amount), error: kind });
    saveState({ pubkey, endpoint, attempts, updatedAt: new Date().toISOString() });

    if (kind === "fault") {
      console.error(
        "\nThe faucet accepted the request and then failed internally. That is a fault on the\n" +
          "faucet's side rather than a rate limit, the credit is already spent, and retrying only\n" +
          "burns the next window.",
      );
      console.error(guidance(pubkey));
      return 2;
    }

    if (attempt < flags.attempts) {
      console.log(`  waiting ${Math.round(interval / 1000)}s`);
      await new Promise((done) => setTimeout(done, interval));
      interval = Math.min(interval * 2, flags.maxInterval * 1000);
    }
  }

  const final = await balanceOf(endpoint, pubkey);
  console.log(`\nbalance   ${sol(final)} SOL of ${sol(required)} required`);
  if (final >= required) {
    console.log("funded.");
    return 0;
  }
  console.error(`still short by ${sol(required - final)} SOL`);
  console.error(guidance(pubkey));
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`faucet failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
