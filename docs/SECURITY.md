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
| Carry capture — the first staker skims fees earned while nobody was staked | Fees claimed while `total_staked == 0` are banked in `carry_a/b` and released to the next stakers. |
| Dust griefing — tiny stakes force a crank or bloat accounting | Carry is only released once a real stake exists. A minimum stake amount is the intended follow-up. |
| Ladder front-running — someone buys ahead of the sale seeding | The ladder is seeded in one transaction, and the primary sale mode is ask-side limit orders. |

## Invariants (tested)

1. Fees in == fees out: `Σ harvested + Σ pending + carry + vault balance == Σ claimed` per token.
2. No instruction can reduce position liquidity.
3. A stake → crank → harvest → unstake sequence inside one transaction yields zero share of
   pre-existing fees.
4. Share supply is fixed after `create_vault` (mint authority is revoked).
5. A zero-fee claim is a no-op and never divides by zero when `total_staked == 0`.
6. Token-2022 fee mints keep balance-diff accounting exact.
7. `unstake_no_claim` still works when a fee mint is paused or blocked.

## Pause switch and risk flags (upgrade pack 6A)

`Config.paused_entry` pauses **only** `create_vault` and `stake`. `unstake`, `unstake_no_claim`,
`harvest` and `crank_claim` can never be paused, so holders can always exit and always pull what they
are owed even if the admin key is compromised or the admin disappears.

`Vault.risk_flags` is a `u32` bitmask, set at `create_vault` from the fee mints' Token-2022
extensions and re-settable by the admin as the pool ages:

| Flag | Bit | Trigger |
|---|---|---|
| `COMPOUNDING_MODE` | 1<<0 | the pool's fee mode reinvests part of the fee |
| `PAUSABLE_MINT` | 1<<1 | `DefaultAccountState` extension (accounts can start frozen) |
| `PERMANENT_DELEGATE_MINT` | 1<<2 | `PermanentDelegate` extension |
| `TRANSFER_FEE_MINT` | 1<<3 | `TransferFeeConfig` extension |
| `YOUNG_POOL` | 1<<4 | pool age under 7 days |
| `LOW_LIQUIDITY` | 1<<5 | pool liquidity below the configured floor |

`create_vault` **refuses** a fee mint carrying a `TransferHook` extension. Pausable and
permanent-delegate mints are accepted but flagged, and the valuation engine discounts the stream
rather than pretending the risk is not there.

The extension walk lives in `programs/perpetua_vault/src/extensions.rs` and is unit tested against
synthetic TLV buffers, including a truncated entry (the parser stops rather than trusting a partial
payload). VERIFY the extension type ids against the SPL Token-2022 registry before mainnet.

## Known limitations

These are honest gaps, not oversights, and each one is recorded where a reviewer will look for it:

- **`init_config` wires `treasury` to `admin`.** There is no treasury argument, so the two cannot be
  separated later without re-initialising `Config`. Deliberate for a single-operator launch; a
  multi-sig treasury wants a separate `set_treasury` before this handles real value.
- **`crank_claim` and `harvest` are permissionless-ish but untested under adversarial ordering.**
  The integration suite covers the happy path and the accounting; it does not yet fuzz interleavings
  of stake/unstake/claim within one slot beyond the JIT case in the unit tests.
- **The LiteSVM suite uses a mock DAMM v2.** It proves the vault's own accounting and PDA signing
  against the real SPL token program, but not DAMM v2's pool validation. A fork test with the real
  `cp_amm.so` (`scripts/fetch-programs.sh`) is the next step, not a claim made here.
- **Only fully permanently locked positions are accepted.** Mixed positions must be split with
  `split_position` first.
- **The DAMM v2 `claim_position_fee` account order and the position lock byte offsets are pinned
  constants in the program.** See [INTEGRATIONS.md](INTEGRATIONS.md) and re-confirm them against the
  deployed IDL before a real deployment.

## Incident runbook

1. **Pause entry** with `set_paused(true)`. Exits stay open by construction.
2. **Publish** the transaction, the affected vault list and the exposure on `/status`.
3. If a fee mint blocks claims, **direct holders to `unstake_no_claim`** and say why.
4. If the vulnerability is in the program itself, **rotate the upgrade authority**; if it is already
   revoked, ship a new program and publish a migration path.

## Operational plan

- **Verifiable build** (`solana-verify`) and public transaction links for every securitized position.
- **Upgrade authority** held by a Squads multisig with a timelock during the hackathon, revoked after
  a shakedown period.
- **TVL caps** per vault and globally in the MVP, with a visible "unaudited, hackathon code" banner.
- **Mint screening**: refuse or loudly warn on fee mints that are pausable or carry a permanent
  delegate.
- The program is **unaudited**. Do not put more at risk than you can lose.


