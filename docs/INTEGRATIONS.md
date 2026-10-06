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
| `perpetua_vault` | `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2` |

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

- `packages/sdk/src/data/meteoraDataApi.ts` implements `DataApiPort` over HTTP against Meteora's
  **DAMM v2** data API (`https://damm-v2.datapi.meteora.ag`); the indexer and the API both construct
  it. The fee series comes from `GET /pools/{address}/volume/history?timeframe=24h&start_time=&end_time=`,
  where every bucket carries `fees`, `volume` and `protocol_fees`; `GET /pools/{address}` supplies the
  pool's current `tvl` and its `created_at`.
- Buckets are dropped in two cases, both of which would distort the decay fit: those that predate the
  pool (those days are not zero-fee days, they are not days), and the bucket still in flight (its fees
  are a partial day).
- **The data API has no wallet endpoint.** `DataApiPort` therefore has no `walletPositions`, and
  `GET /v1/positions/:wallet` reads from the DAMM v2 program through `DammV2Adapter` instead — as does
  `/v1/positions/:wallet/onchain`.

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
6. **DAMM v2 data API** — base `https://damm-v2.datapi.meteora.ag`. Confirmed live:
   `GET /pools`, `GET /pools/{address}` and `GET /pools/{address}/volume/history?timeframe=24h`.
   The earlier `/pools/:pool/daily` path never existed — it 404s on both this API and the DLMM one,
   which is why every valuation used to fall back to invented numbers.
7. **Anchor / SDK compatibility** — the program compiles against `anchor-lang 0.32.2` with
   `solana-program 2.3`; `cargo check` and `cargo test -p perpetua_vault` are green.
8. **The position NFT account is a cp-amm PDA, not an associated token account.** It is
   `findProgramAddress(["position_nft_account", nftMint], cp-amm)`. Deriving it as an ATA yields an
   address that does not exist, which is what `create_vault`'s owner assertion catches. Confirmed
   against a live devnet position: the PDA exists, is owned by Token-2022, and its **authority is the
   position owner** — which is what makes the `set_authority(AccountOwner)` hand-off to the vault PDA
   possible in the first place. `@perpetua/sdk` mirrors the SDK's internal `derivePositionNftAccount`
   in `findCpAmmPositionNftAccount`.
9. **Anchor 0.32 takes instruction arguments positionally.** Passing an object of named arguments
   fails outright for `u64` (`src.toArrayLike is not a function`) and, worse, **silently encodes `0`
   for numeric types** like `u16`. `PerpetuaVaultClient` passes arguments positionally.
10. **`claim_position_fee` pays into token accounts that must already exist.** The vault's and the
   treasury's fee accounts are derived as ATAs and `create_vault` does not create them, so the first
   `crank_claim` fails with `AccountNotInitialized`. `DammV2Adapter.claimSetupInstructions` returns
   the idempotent creates to attach to every claim, and `PerpetuaVaultClient.shareAccountSetupInstructions`
   does the same for the vault's share account before `stake`.

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
