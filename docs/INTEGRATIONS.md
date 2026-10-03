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

## Verify before mainnet

These are the unknowns that must be confirmed against the deployed IDLs and docs. Each one is a
pinned constant or assumption in the code:

1. **`claim_position_fee` account order.** `cpi.rs` sends
   `[pool, position, position_nft_account, token_a_mint, token_b_mint, vault_a, vault_b,
   token_a_program, token_b_program, owner]`. Confirm against the cp-amm IDL.
2. **Position lock byte offsets.** `cpi.rs` reads three `u128` values at
   `POSITION_LOCK_OFFSET = 8 + 32 + 32 + 32 + 1 + 1`. Confirm against the DAMM v2 position layout.
3. **Freeze / NFT authority.** Whether any freeze behaviour on the position NFT affects the
   `set_authority(AccountOwner)` hand-off. The Dynamic Fee Sharing SDK performs the same hand-off.
4. **How DBC migration mints creator/partner positions** and who holds the NFTs after
   `migration_damm_v2`.
5. **DAMM v2 data API base URL and rate limits.**
6. **DLMM SDK method names**, bin-count limits and pool-creation costs.
7. **Fee mint extensions** for the chosen demo pools (plain SPL vs Token-2022 with pause/delegate).
8. **Anchor / SDK version compatibility** for the chosen toolchain.
