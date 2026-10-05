# Devnet

Every Meteora program Perpetua integrates with is deployed on devnet with the **same program IDs** as
mainnet, so the whole flow runs end to end without spending real funds.

| Program | Devnet + mainnet id |
|---|---|
| DAMM v2 (cp-amm) | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` |
| DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |
| DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| `perpetua_vault` | `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2` |

The repository defaults to devnet: `DEFAULT_CLUSTER` in `packages/shared/src/networks.ts` and
`resolveNetwork()` are used by the API, indexer and keeper. Override with `CLUSTER=mainnet-beta` or a
custom `RPC_URL`.

## 1. Toolchain

```bash
# Rust (needed for cargo test / cargo build-sbf)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal

# Solana CLI (provides cargo build-sbf)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor (optional: only wraps build/test)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1 && avm use 0.32.1
```

## 2. A devnet keypair and SOL

The program keypair is committed (`keys/perpetua_vault-devnet.json`), so restore it rather than
generating a new one:

```bash
node scripts/program-id.mjs install-keypair    # writes ~/.config/solana/id.json
solana config set --url devnet
```

Then fund the program address. This is the part that is genuinely awkward — see
[SOL and the faucet](#sol-and-the-faucet) below — and `pnpm ops:faucet` automates as much of it as
can honestly be automated.

## 3. Build and deploy

```bash
node scripts/program-id.mjs install-keypair   # restore the committed devnet program keypair
node scripts/program-id.mjs check             # fail if Anchor.toml drifted from declare_id!

cargo test -p perpetua_vault --features no-entrypoint      # pure logic, no SBF toolchain needed
cargo build-sbf --manifest-path programs/perpetua_vault/Cargo.toml
anchor build                                               # same thing, plus target/deploy bookkeeping

anchor deploy --provider.cluster devnet
```

`Anchor.toml` already lists the program under `[programs.devnet]`.

### The program address

`G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`, and it is not arbitrary: a Solana program can only
be deployed by whoever holds the keypair for its address, so the address and the keypair have to
agree. `declare_id!` in `programs/perpetua_vault/src/lib.rs` is the single source of truth; the IDL,
the SDK and the LiteSVM harness all read from it, and `scripts/program-id.mjs sync` rewrites the
`Anchor.toml` entries if they ever drift. The devnet keypair is committed under `keys/` (see
`keys/README.md`) so the deployed address is reproducible. **Mainnet uses a different key**, kept in
a secret store and never committed.

### SOL and the faucet

A deployment rents storage by the byte. Rent exemption is `(size + 128) * 6960` lamports, and the
built artifact is 448,248 bytes, so:

| | |
|---|---|
| artifact | 448,248 bytes |
| rent-exempt | **3.121 SOL** |
| plus fees | ~0.01 SOL |

Build and test need no SOL at all — only the deploy does. Every Meteora program Perpetua calls is
already deployed on devnet.

The public faucet is the only free source, and it fails in two ways that a naive retry loop cannot
tell apart:

1. **Rate limited.** `https://api.devnet.solana.com` allows **one airdrop per IP per window**, at
   most 2 SOL per request. The response headers say so directly
   (`x-ratelimit-airdrop-limit: 1`), and hammering it makes nothing better. Since the program needs
   3.121 SOL and one request caps at 2 SOL, **a single credit is never enough** — two windows are
   required, whatever you do.
2. **Service fault.** The faucet can return `{"code":-32603,"message":"Internal error"}` *while still
   consuming the credit*. This is a fault on the faucet's side, not a rate limit, and it has been
   the observed state. Retrying just burns the next window.

`pnpm ops:faucet` handles both. It sizes the request from the real artifact instead of guessing,
reads the credit headers, distinguishes a fault from a rate limit (and stops rather than burning
credits on a broken backend), backs off exponentially, and persists state to
`scripts/out/faucet-state.json` so a later run resumes:

```bash
pnpm ops:faucet                 # request what is still missing
pnpm ops:faucet -- --dry-run    # just report the shortfall, no request
pnpm ops:faucet -- --attempts 12 --interval 600
```

Exit codes: `0` funded, `1` still short, `2` faucet fault.

**If the faucet is faulting, use the web faucet — it is a different backend and is the reliable
path.** It needs a browser and GitHub auth, so it cannot be scripted:

> <https://faucet.solana.com> — paste `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`

Either way, once the address holds enough SOL:

```bash
solana balance
anchor deploy --provider.cluster devnet
```

#### On shrinking the artifact

`opt-level = "z"` in `[profile.release]` cuts the artifact to **320,472 bytes (2.231 SOL, -0.89 SOL)**.
It is **not** enabled, and the reason is worth recording: at that level `cargo build-sbf`'s verifier
reports **16** frame-space overflows (`... may cause undefined behavior during execution`) inside
dependency code (`crypto_common`, `hybrid_array`) that are absent at the default level. Trading a
verified-clean artifact for 0.89 SOL is a bad deal for a program that custodies fee rights.
`panic = "abort"` and `no-log-ix-name` were also measured and buy only ~2 KB, so they were dropped too.

## 4. Run the end-to-end flow

```bash
KEYPAIR=~/.config/solana/devnet.json pnpm --filter @perpetua/sdk ops:devnet-e2e
```

The script (`packages/sdk/scripts/devnet-e2e.ts`) does all of this against devnet:

1. creates two 6-decimal test mints and funds them,
2. creates a DAMM v2 custom pool with `isLockLiquidity: true` so the initial position is permanently
   locked,
3. reads the position back with the cp-amm SDK and prints its lock buckets,
4. calls `create_vault` on `perpetua_vault` — the position NFT account is handed to the vault PDA and
   1,000,000 share tokens are minted to the creator (mint authority revoked),
5. derives the claim account set from the pool state and runs `crank_claim`.

## 5. Run the app against devnet

```bash
pnpm build
pnpm --filter @perpetua/api dev      # http://localhost:8787  (cluster devnet)
pnpm --filter @perpetua/web dev      # http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8787
```

- `/terminal` prices a pool with no wallet.
- `/securitize` connects a wallet, scans its DAMM v2 positions through
  `GET /v1/positions/:wallet/onchain`, and sends `create_vault`.
- `/vault/[id]` has the stake / unstake / harvest / crank buttons.

Transactions are built **server-side** by `apps/api/src/tx.ts` and returned as base64; the browser
only deserialises them and hands them to the wallet, so the Anchor and Meteora SDKs never enter the
browser bundle.

## 6. Keeper

```bash
KEYPAIR=~/.config/solana/devnet.json \
CRANK_THRESHOLD_BASE_UNITS=0 \
CRANK_INTERVAL_MS=60000 \
pnpm --filter @perpetua/keeper dev
```

The keeper reads each vault's pending token A + B fees straight from the DAMM v2 position and cranks
when they clear the threshold.
