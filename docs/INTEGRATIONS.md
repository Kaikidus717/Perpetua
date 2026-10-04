# Meteora integration points

Spec references: <https://docs.meteora.ag/developer-guides/dbc>,
<https://docs.meteora.ag/core-products/damm-v2/nft-positions>,
<https://docs.meteora.ag/helper-products/dynamic-fee-sharing/what-is-dynamic-fee-sharing>

Program ids used across the repo:

| Program | Id |
|---|---|
| DAMM v2 (cp-amm) | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` |
| DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |
| DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| Dynamic Fee Sharing | `dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh` |
| `perpetua_vault` | `3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit` |

## Where Perpetua touches Meteora

### DAMM v2

- `programs/perpetua_vault/src/cpi.rs` CPIs **`claim_position_fee`** with the vault PDA as signer.
- `create_vault` reads the position account and requires zero unlocked, zero vested and a positive
  permanent lock. Mixed positions must be split with `split_position` first.
- Fee credits are computed as the **balance diff** of the vault's token A/B accounts around the CPI.

### DBC

- `packages/sdk/src/dbc/preset.ts` builds and validates the *financeable* preset used at launch.
- `apps/api` exposes it at `GET /v1/dbc/preset`.

### DLMM

- `packages/sdk/src/sale/ladder.ts` builds the front-weighted one-sided ask ladder.
- `apps/api` exposes it at `GET /v1/sale/plan`.
- The pool creation and seeding calls live behind `DlmmPort` in `packages/sdk/src/ports.ts`.

### Data APIs

- `apps/indexer/src/dataApi.ts` implements `DataApiPort` over HTTP. Endpoint paths are
  `/pools/:pool/daily?days=` and `/wallets/:wallet/positions`, and the daily payload is normalised
  from `{ pool, data: [{ day, feesUsd, volumeUsd, liquidityUsd }] }`.

## Verified against the shipped SDKs

`pnpm --filter @perpetua/sdk ops:extract-idls` dumps the Anchor IDLs bundled inside
`@meteora-ag/cp-amm-sdk` (39 instructions) into `programs/perpetua_vault/idl/`. The following are
taken from that artifact, not from guesswork:

1. **`claim_position_fee` account order** — verified. Fifteen accounts, in order:
   `pool_authority` (fixed `HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC`), `pool` (read-only),
   `position` (writable), `token_a_account` (w), `token_b_account` (w), `token_a_vault` (w),
   `token_b_vault` (w), `token_a_mint`, `token_b_mint`, `position_nft_account`, `signer` (signer),
   `token_a_program`, `token_b_program`, `event_authority`, `program`. The instruction takes **no
   args**; the discriminator is `[180, 38, 154, 17, 133, 33, 162, 211]`. Implemented in
   `programs/perpetua_vault/src/cpi.rs`.
2. **Position lock byte offsets** — verified from the `Position` type in the same IDL
   (`8` discriminator + `pool` 32 + `nft_mint` 32 + two 32-byte checkpoints + two `u64`):
   `unlocked_liquidity` at **152**, `vested_liquidity` at **168**,
   `permanent_locked_liquidity` at **184**.
3. **Freeze behaviour** — DAMM v2 uses the pool as freeze authority for position NFTs and the pool
   authority as mint authority, so the `set_authority(AccountOwner)` hand-off to the vault PDA does
   not touch the freeze path. `create_vault` asserts the NFT token program from the account's owner
   rather than assuming Token-2022.
4. **Pool vaults** — `token_a_vault` / `token_b_vault` are read from the pool state via the cp-amm
   SDK (`DammV2Adapter.claimAccountsFor`) and validated by cp-amm's own `relations` constraints.
5. **Program IDs are identical on devnet and mainnet** — confirmed in the DAMM v2, DLMM and DBC SDK
   docs and `packages/shared/src/constants.ts`.
6. **DAMM v2 data API** — `https://damm-v2.datapi.meteora.ag/pools?page=1&page_size=20` (documented).
7. **Anchor / SDK compatibility** — the program compiles against `anchor-lang 0.32.2` with
   `solana-program 2.3`; `cargo check` and `cargo test -p perpetua_vault` are green.

## Still to confirm before a real deployment

1. **DLMM pair PDA seed for `createLbPair2`.** `adapters/dlmm.ts` derives
   `["lb_pair", tokenX, tokenY, binStep(u16)]` (the classic LB-pair convention) to detect an existing
   pair, then falls back to creating it. Confirm the preset-based derivation on devnet.
2. **Fee mint extensions** for the pools you intend to securitize (plain SPL vs Token-2022 with
   pause/delegate). The engine prices any of them and flags the risky ones, but the mint flags fed to
   the valuation `risk` block are currently operator-supplied.
3. **DBC migration position ownership** — who holds the creator/partner position NFTs after
   `migration_damm_v2`. The launch preset is built and validated; the hand-off to `/securitize` still
   needs a devnet run.
4. **`cargo build-sbf`** requires the Solana platform tools, which are fetched from GitHub releases.
   On networks that cannot reach GitHub, build the program on a machine that can (or in CI).
