# Architecture

## Flow

1. **Launch** — a creator launches on DBC with the *financeable* preset (quote-only fees,
   non-compounding, a permanently locked liquidity floor).
2. **Graduate** — migration to DAMM v2 mints the creator/partner position NFTs.
3. **Securitize** — `create_vault` verifies the position is fully permanently locked, hands the
   position NFT account to the vault PDA, mints 1,000,000 share tokens to the creator and revokes
   the mint authority.
4. **Sell** — a `pFEE/USDC` DLMM pool is created and seeded with a one-sided ask ladder around fair
   value. USDC proceeds accumulate in the issuer's DLMM position.
5. **Earn** — buyers stake shares. `crank_claim` CPI-claims the position fees into the vault, and
   `harvest` pays each holder their share.

## Components

### `perpetua_vault` (Anchor)

| Account | Seeds | Notes |
|---|---|---|
| `Config` | `["config"]` | admin, treasury, `protocol_fee_bps` (default 0), `paused_entry` |
| `Vault` | `["vault", position]` | pool, position, NFT refs, share mint, fee-per-share accumulators, `risk_flags` |
| `Stake` | `["stake", vault, owner]` | amount, per-token debt, pending fees |

Accounts are keyed by the **position** address, so one position maps to one vault.

Instructions: `init_config`, `create_vault`, `stake`, `unstake`, `unstake_no_claim`, `harvest`,
`crank_claim`, `touch`, plus the admin pair `set_paused` and `set_risk_flags`.

`set_paused(true)` gates **entry only** — `create_vault` and `stake`. Exits (`unstake`,
`unstake_no_claim`, `harvest`, `crank_claim`) are never gated, so a compromised or absent admin
cannot trap holders. `create_vault` also walks the fee mints' Token-2022 extension TLV
(`src/extensions.rs`): a `TransferHook` mint is refused, and pausable / permanent-delegate /
transfer-fee mints are recorded in `Vault.risk_flags` so the valuation engine can discount them.

Fees are credited with balance-diff accounting: the vault reads its reward-account balances, CPIs
`claim_position_fee`, reloads and takes the difference. This is exact even when the fee mint is
Token-2022 with a transfer fee. `acc_fee_per_share_a/b` are `u128` accumulators scaled by
`PRECISION = 1e18`; each `Stake` records the accumulator value it last settled at.

Fees claimed while `total_staked == 0` are banked in `carry_a/b` and released to the next stakers.

### `@perpetua/valuation`

Pure TypeScript, zero chain dependencies:

1. Fit a weighted log-linear decay `λ` to the trailing daily fee series.
2. Project fees forward `horizonDays` with a floor.
3. Discount the projection: `PV = Σ share · F_t · (1 − protocolFee) / (1 + r)^(t/365)`.
4. Emit bear / base / bull scenarios, fair value per share, payback days and implied APR.
5. Blend the fitted `λ` with a **cohort prior** keyed on pool age, so a short or hype-driven series
   cannot overstate the stream (`cohortPrior.ts`).
6. Emit risk flags (compounding, pausable/delegate mints, young pool, volume concentration, low
   liquidity).

Supporting modules:

- `session.ts` — classifies any instant into a pre/regular/post/overnight/closed equity session,
  splits a fee series per session and measures how long the reference is dark.
- `compounding.ts` — separates the **claimable** floor from the **growth-adjusted** upside for pools
  whose fee mode reinvests part of the fee.
- `version.ts` — pins `modelVersion` and an `inputsHash` (FNV-1a over canonical JSON) onto every
  result, so a published number is reproducible.

`backtest/run.ts` measures the model's 30-day-ahead error and its calibration on synthetic pools
with a known decay rate (`backtest/results.md`).

### `@perpetua/sdk`

- `vault/` — a typed client over the generated IDL plus PDA derivation and instruction builders.
- `sale/ladder.ts` — the DLMM ask-ladder algorithm (front-weighted, geometric price steps).
- `dbc/preset.ts` — the financeable preset builder and its validator.
- `math/feePerShare.ts` — a TypeScript mirror of the on-chain accrual, for previews.
- `sale/bids.ts` — the conviction score (`size × time in pool × depth below fair value`), the
  ask/bid depth chart and the collect-fills-into-stake plan.
- `ports.ts` — narrow interfaces for the data API, DLMM and DBC integrations.

### `@perpetua/stock-kit`

The differentiator for stock-quoted launches: the pool is a price-discovery venue while the equity
reference is dark.

- `closedMarketFeeCurve.ts` — schedules a fee cliff that decays to the base fee exactly as the
  reference market reopens, emitted as DBC fee-scheduler parameters.
- `anchoredStart.ts` — anchors the start price to the reference with a confidence band and a
  thin-name premium.

### `@perpetua/api`

Hono app over a `Store` port with two implementations: `InMemoryStore` (default, used by tests and
local dev) and `DrizzleStore` (Postgres). Routes:

| Route | Purpose |
|---|---|
| `GET /v1/vaults`, `/v1/vaults/:id`, `/v1/vaults/:id/events` | vault registry and event feed |
| `GET /v1/positions/:wallet` | securitizable positions |
| `GET /v1/valuation/:position`, `/v1/pools/:pool/yield` | priced fee stream |
| `GET /v1/pools/:pool/series` | raw daily fee series |
| `GET /v1/sale/plan`, `/v1/dbc/preset` | ladder and preset builders |
| `GET /v1/stats`, `/v1/stream` | KPIs and an SSE event stream |

### `@perpetua/indexer` and `@perpetua/keeper`

The indexer polls `program.account.vault.all()`, maps on-chain accounts to summaries, decodes
Anchor events out of transaction logs and writes daily pool snapshots. The keeper walks every vault
and sends `crank_claim` when the claimable value clears a threshold.
