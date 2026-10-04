# Devnet

Every Meteora program Perpetua integrates with is deployed on devnet with the **same program IDs** as
mainnet, so the whole flow runs end to end without spending real funds.

| Program | Devnet + mainnet id |
|---|---|
| DAMM v2 (cp-amm) | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` |
| DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |
| DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| `perpetua_vault` | `3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit` |

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

```bash
solana-keygen new -o ~/.config/solana/devnet.json
solana config set --url devnet --keypair ~/.config/solana/devnet.json
solana airdrop 2
# or use the web faucet: https://faucet.solana.com
```

## 3. Build and deploy

```bash
cargo test -p perpetua_vault --features no-entrypoint   # pure logic tests, no SBF needed
anchor build                                            # or: cargo build-sbf --manifest-path programs/perpetua_vault/Cargo.toml
anchor deploy --provider.cluster devnet
```

`Anchor.toml` already lists the program under `[programs.devnet]`.

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
