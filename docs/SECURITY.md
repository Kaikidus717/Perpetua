# Security

## Threat model

The vault takes custody of a **position NFT account**, not of funds. Once `create_vault` succeeds the
vault PDA owns the NFT account, and the fee stream can only be claimed and split by the program.

| Threat | Mitigation |
|---|---|
| Program removes liquidity / closes the position | There is no instruction that can. No `remove_liquidity`, `close_position` or lock change exists in the surface. |
| Admin drains the vault | The admin can only set `protocol_fee_bps` at init. There is no path to the NFT or the principal. |
| JIT staking sandwich | `stake`/`unstake` claim **before** touching accounting, in the same transaction, so a fresh staker cannot capture fees that already existed. |
| Token-2022 transfer fees break accounting | Fees are credited by balance diff around the CPI, not by the claimed amount. |
| A blocked or paused fee mint bricks stakers | `unstake_no_claim` exits without the claim CPI; fees stay in the position and are credited at the next successful touch. |
| Pool / position substitution | `Vault` stores both addresses; `has_one = pool` pins the pool on every fee-touching instruction, and `vault` is a PDA seeded by the position. |
| Wrong share mint | `share_mint` is pinned with an `address = vault.share_mint` constraint. |
| Arithmetic overflow | All arithmetic is `checked_*`; accumulator math uses `u128` with `PRECISION = 1e18`. |
| Rounding leakage | User claims floor; dust accumulates in the vault. The invariant `Σ harvested + Σ pending + carry + vault balance == Σ claimed` holds up to bounded dust. |

## Invariants (tested)

1. Fees in == fees out: `Σ harvested + Σ pending + carry + vault balance == Σ claimed` per token.
2. No instruction can reduce position liquidity.
3. A stake → crank → harvest → unstake sequence inside one transaction yields zero share of
   pre-existing fees.
4. Share supply is fixed after `create_vault` (mint authority is revoked).
5. A zero-fee claim is a no-op and never divides by zero when `total_staked == 0`.
6. Token-2022 fee mints keep balance-diff accounting exact.
7. `unstake_no_claim` still works when a fee mint is paused or blocked.

## Operational plan

- **Verifiable build** (`solana-verify`) and public transaction links for every securitized position.
- **Upgrade authority** held by a Squads multisig with a timelock during the hackathon, revoked after
  a shakedown period.
- **TVL caps** per vault and globally in the MVP, with a visible "unaudited, hackathon code" banner.
- **Mint screening**: refuse or loudly warn on fee mints that are pausable or carry a permanent
  delegate.
- The program is **unaudited**. Do not put more at risk than you can lose.

## Known limitations

- Only fully permanently locked positions are accepted. Mixed positions must be split with
  `split_position` first.
- The DAMM v2 `claim_position_fee` account order and the position lock byte offsets are pinned
  constants in the program; see [INTEGRATIONS.md](INTEGRATIONS.md). Re-confirm them against the
  deployed IDL before a real deployment.
