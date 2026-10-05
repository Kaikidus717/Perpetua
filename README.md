# Perpetua — the fee-rights exchange for Meteora

> Turn the trading-fee stream of a **permanently locked Meteora DAMM v2 position** into a **priced,
> tradable, claimable asset**.

**Live on devnet** at `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2` — and the bytecode read back off
the chain hashes **byte-for-byte** to the artifact the tests ran against.

| | |
|---|---|
| TypeScript | **131 tests** · `biome check` clean · `tsc` clean · `next build` green |
| Rust | **26 tests** · `cargo clippy --all-targets -D warnings` clean |
| Program | 9 instructions · 448,248 bytes · SBF verifier clean · deployed on devnet |
| Shape | 5 workspace packages · 4 apps · 1 web UI · 1 MCP server |

---

## Table of contents

- [What Perpetua is](#what-perpetua-is) — the thesis, and why the primitive already exists
- [Architecture](#architecture) — the system, the lifecycle, and where the risk sits
- [Repository map](#repository-map) — every directory, annotated
- [Packages](#packages) — what each package is and what it exports
- [Requirements](#requirements) · [Quickstart](#quickstart) — clone to running in five minutes
- [The manual](#the-manual) — **step-by-step use of every page, plus the CLI and the MCP server**
- [The program](#the-program) — accounts, instructions and the fee-accounting model
- [API reference](#api-reference) — every route, every parameter
- [The valuation model](#the-valuation-model) — the formula, the cohort prior, calibration
- [Status](#status) — what is verified, and the exact test counts
- [MCP server](#mcp-server) — five tools for other AI agents
- [Commands](#commands) — every script in one table
- [Testing](#testing) · [Security model](#security-model) · [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting) — the failures that actually happen
- [Documentation index](#documentation-index) · [License](#license)

## What Perpetua is

Meteora already ships **Dynamic Fee Sharing**: a PDA fee vault can own a DAMM v2 position NFT, claim
its fees by CPI and split them with fee-per-share accounting. But it is capped at 2–5 fixed recipients
and its shares are **not transferable**.

Perpetua extends that primitive into a market:

1. **Tradable SPL fee shares** for any number of holders — stake to earn, claim on touch.
2. A **valuation engine** that prices a fee stream: decay-aware, discounted, and calibrated against
   synthetic pools whose decay rate is known.
3. A **DLMM one-sided ask ladder** as the primary sale venue, so the sale is a market rather than a
   spreadsheet.
4. A **DBC "financeable launch" preset**, so launch → graduate → finance is one flow instead of three.

The pitch: *cash-flow tokens — a new asset class on Meteora's liquidity layer.*

## Architecture

```
   ┌────────────────────────── Web · Next.js (:3000) ────────────────────────────┐
   │  / Explore   /terminal   /launch   /securitize   /vault/[id]   /kpi          │
   └───────────────▲───────────────────────────────────────────▲─────────────────┘
                   │ REST + SSE                                │ pricing (pure TS)
   ┌───────────────┴────────────────┐             ┌────────────┴─────────────────┐
   │  API · Hono (:8787)            │             │  @perpetua/valuation         │
   │   · Store port                 │             │   decay fit → scenarios      │
   │       InMemoryStore (default)  │             │   no chain dependency        │
   │       DrizzleStore (Postgres)  │             └──────────────────────────────┘
   │   · /v1/tx/* builds unsigned   │
   └───────────────▲────────────────┘
                   │ reads                            ┌──────────────────────────────────┐
   ┌───────────────┴────────────────┐                 │  Solana RPC · Meteora data APIs  │
   │  Indexer + Keeper              │◄────────────────┤  cp-amm-sdk · dlmm · dbc SDKs    │
   │   vault accounts, Anchor events│                 └──────────────────────────────────┘
   │   crank_claim when it pays     │
   └───────────────┬────────────────┘
                   │ instructions
   ┌───────────────▼─────────────────────────────────────────────────────────────┐
   │  perpetua_vault · Anchor · G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2      │
   │      CPI ──► DAMM v2 `claim_position_fee`   (the vault PDA signs)           │
   └─────────────────────────────────────────────────────────────────────────────┘
```

### The lifecycle

```
  1. LAUNCH            2. GRADUATE          3. SECURITIZE        4. SELL           5. EARN
  ───────────          ───────────          ────────────         ───────           ───────
  DBC with the    →    DAMM v2 mints   →    create_vault    →    DLMM one-sided →  stake shares,
  financeable          the creator and      takes the NFT,       ask ladder        harvest fees;
  preset               partner position     mints 1,000,000     seeded around     crank_claim
                       NFTs                 share tokens        fair value        pulls fees in
```

### The idea in one sentence

A position that is *permanently locked* has nothing left to do but earn, so its fee stream is a
well-defined cash flow — and a cash flow can be priced, split into shares, and sold.

### Where the risk sits

The vault custodies a **position NFT account**, never funds. There is no instruction that removes
liquidity, closes a position or changes a lock, so the principal is unreachable by construction. The
admin can pause **entry** (`create_vault`, `stake`) but can never pause an exit. The full table is
under [Security model](#security-model).


## Repository map

```
perpetua/
├── programs/perpetua_vault/          the Anchor program (Rust)
│   ├── src/lib.rs                    declare_id! and the #[program] entrypoints
│   ├── src/instructions/             one file per instruction
│   │     init_config.rs  create_vault.rs  crank_claim.rs  harvest.rs
│   │     stake.rs  unstake.rs  admin.rs (set_paused, set_risk_flags)
│   │     touch.rs                    NOT an instruction — the shared claim path
│   ├── src/state/                    Config, Vault and Stake account layouts
│   ├── src/cpi.rs                    claim_position_fee CPI + the pinned wire format
│   ├── src/extensions.rs             Token-2022 TLV walk (refuses TransferHook)
│   ├── src/math.rs                   fee-per-share accrual, carry, protocol fee
│   ├── src/constants.rs              seeds, precision, pinned program ids, offsets
│   ├── src/errors.rs  src/events.rs  error codes and Anchor events
│   ├── idl/                          cp_amm.json, perpetua_vault.json (generated)
│   └── Cargo.toml
├── packages/
│   ├── shared/                       types, program ids, network resolution
│   ├── valuation/                    the pricing model (pure TS) + backtest/
│   ├── sdk/                          on-chain client, ladder, preset, bids, adapters
│   ├── stock-kit/                    closed-market fee curve, anchored start price
│   └── mcp/                          Model Context Protocol server
├── apps/
│   ├── api/                          Hono REST + SSE (src/app.ts is the route table)
│   ├── indexer/                      Meteora data client, Anchor event decoding
│   ├── keeper/                       the crank_claim bot
│   └── web/                          Next.js App Router UI
├── tests/
│   ├── litesvm/                      boots the real artifact; flow.rs drives the flow
│   └── mock-cp-amm/                  the cp-amm stand-in used by flow.rs
├── scripts/
│   ├── gen-idl.mjs                   the IDL single source of truth
│   ├── program-id.mjs                check/sync Anchor.toml, install the keypair
│   ├── faucet.mjs                    payer-aware devnet funding
│   └── verify-spec.mjs               asserts the spec edits stayed in place
├── keys/perpetua_vault-devnet.json   the committed devnet program keypair
├── docs/                             DEVNET, ARCHITECTURE, VALUATION, SECURITY, …
├── Anchor.toml  package.json  pnpm-workspace.yaml  turbo.json  biome.json
└── PERPETUA_BUILD_SPEC.md            the build spec this repository implements
```

## Packages

| Package | What it is | Key exports |
|---|---|---|
| `@perpetua/shared` | types, program ids and network resolution — the vocabulary | `PROGRAM_IDS`, `resolveNetwork`, `CP_AMM_POOL_AUTHORITY`, `ValuationInput`, `VaultSummary` |
| `@perpetua/valuation` | the pricing model: pure TypeScript, zero chain dependency | `valuePosition`, `estimateDecay`, `cohortPriorFor`, `analyzeCompounding`, `sessionAt`, `splitFeesBySession`, `inputsHash`, `MODEL_VERSION` |
| `@perpetua/sdk` | everything that touches the chain or the Meteora SDKs | `PerpetuaVaultClient`, `findVaultPda`, `findConfigPda`, `buildLadder`, `buildFinanceablePreset`, `evaluateEligibility`, `convictionScore`, `buildDepthChart`, `DammV2Adapter`, `DlmmAdapter`, `DbcAdapter` |
| `@perpetua/stock-kit` | the differentiator for stock-quoted launches | `buildClosedMarketFeeCurve`, `anchoredStart` |
| `@perpetua/mcp` | Perpetua for other AI agents | `createServer`, `TOOLS`, the stdio entrypoint |

`@perpetua/sdk` publishes subpath exports — `./ports`, `./sale`, `./bids`, `./bins`, `./dbc`,
`./math`, `./positions`, `./data`, `./adapters/damm-v2`, `./adapters/dlmm`, `./adapters/dbc` — so a
consumer can import one narrow surface without pulling in the Meteora SDKs.


## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node | ≥ 22 | everything TypeScript |
| pnpm | 9.15.9 (`packageManager`) | the workspace |
| Rust + Anchor | 0.32.1 | the program only |
| Solana CLI + platform tools | recent | SBF builds and devnet deploys only |

The web app and the API need nothing beyond Node — no database, no wallet, no SOL. Only the program
and the devnet deployment need the Rust toolchain.

## Quickstart

```bash
pnpm install
pnpm build                                   # turbo: every package and app

pnpm --filter @perpetua/api dev              # API + SSE  → http://localhost:8787
pnpm --filter @perpetua/web dev              # web        → http://localhost:3000
```

Open <http://localhost:3000>. The API ships with a **demo pool and a demo wallet**, so every page
works before you touch a chain.

Or run the whole stack in watch mode:

```bash
pnpm dev                                     # web, api, indexer, keeper
```

Verify the checkout:

```bash
pnpm test && pnpm lint && pnpm typecheck
```

The API uses an in-memory store by default. To switch to Postgres:

```bash
cp .env.example .env                         # then set DATABASE_URL
pnpm --filter @perpetua/api db:generate      # drizzle-kit migrations
```

## The manual

### 0. Configure (optional)

Copy [.env.example](.env.example) to `.env`. Every value has a working default for local use.

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `8787` | api |
| `RPC_URL` | the devnet RPC | api, indexer, keeper |
| `CLUSTER` | `devnet` | api (`resolveNetwork`) |
| `DATABASE_URL` | empty → in-memory | api |
| `CORS_ORIGINS` | local web origins in dev | api |
| `METEORA_DATA_API` | the Meteora data API | indexer |
| `KEYPAIR` | — | keeper, SDK scripts |
| `CRANK_THRESHOLD_USD` | `0` | keeper |
| `CRANK_INTERVAL_MS` | `120000` | keeper |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8787` | web |
| `PERPETUA_API_URL` | `http://localhost:8787` | mcp |

### 1. Explore — `/`

The landing page. Reads `/v1/stats` for vaults, positions securitized, fees distributed and unique
stakers, then lists every indexed vault from `/v1/vaults` with its pool, share mint and totals. Each
row links into the vault page; "price any pool →" goes to the terminal. **No wallet needed.**

### 2. Terminal — `/terminal`

Prices a fee stream without any wallet, which is the fastest way to understand the model.

1. Leave the input blank to price the demo pool, or paste a DAMM v2 pool address.
2. Press **Price**.

You get fair value and a bear/base/bull range, fair value per share, implied APR at fair value, a
scenario table (daily decay λ, volume multiple, present value, payback days), the trailing daily fee
chart, and the DLMM one-sided ask ladder the sale would use (bin, price, shares).

Behind it: `GET /v1/pools/:pool/yield` and `GET /v1/pools/:pool/series`, computed by
`@perpetua/valuation` — pure TypeScript, no chain access. See
[The valuation model](#the-valuation-model).

### 3. Launch — `/launch`

Builds the **financeable** DBC preset: a launch that graduates to DAMM v2 with quote-only fee
collection, non-compounding fees and a permanently locked liquidity floor, so the resulting creator
position is securitizable.

Set creator trading fee %, creator liquidity %, partner liquidity % and permanently locked %, and the
page calls `GET /v1/dbc/preset`. It reports whether the preset is valid and prints the full preset
JSON. Invalid combinations list the exact failing constraint.

> The wizard that calls `create_config` and `create_pool` on DBC and waits for graduation is described
> but not wired to a wallet; the preset it needs is real and validated.

### 4. Securitize — `/securitize`

Turns a permanently locked position into a share token.

1. Connect a browser wallet, or paste a wallet address. With no wallet extension present the demo
   wallet is preloaded automatically.
2. The page scans that wallet through `GET /v1/positions/:wallet/onchain` and shows the position's
   unlocked, vested and permanently locked liquidity, plus an **eligibility verdict** returned by the
   API.
3. If eligible, press **Securitize position**. Your wallet signs `create_vault`; the API built the
   transaction in `apps/api/src/tx.ts` and returned it base64, so the browser only needs
   `@solana/web3.js` and the wallet — not Anchor, and not the Meteora SDKs.
4. On success the page shows the share mint and a Solscan link.

Eligibility is `unlocked == 0 && vested == 0 && permanentLocked > 0`, decided by
`evaluateEligibility` in `@perpetua/sdk` on the API side and echoed to the UI — one implementation,
not two. A mixed position must be split with DAMM v2 `split_position` first.

### 5. Vault — `/vault/[id]`

`{id}` is the vault PDA address. The page shows the vault's pool, share mint, totals and event feed,
and exposes the four holder actions:

| Action | Instruction | Notes |
|---|---|---|
| Stake | `stake` | claims outstanding fees first, then adds your shares |
| Unstake | `unstake` | claims first, then removes shares |
| Harvest | `harvest` | pays out the `pending_a/b` you are owed |
| Crank | `crank_claim` | permissionless — anyone can pull the position's fees in |

Each transaction is built by the API (`POST /v1/tx/stake`, `/v1/tx/unstake`, `/v1/tx/harvest`,
`/v1/tx/crank-claim`) and signed in the browser.

### 6. KPI — `/kpi`

Vaults, positions securitized, USD fees distributed, unique stakers, DLMM volume and live share
tokens — all straight from the indexer API, all traceable to on-chain accounts.

### 7. From a terminal

```bash
# 1. the program (needs the Solana toolchain)
anchor build
pnpm program:keypair                               # install keys/perpetua_vault-devnet.json
cargo test --workspace                             # 26 tests

# 2. devnet funding and deploy
pnpm ops:faucet -- --dry-run                       # how much SOL the deploy still needs
pnpm ops:faucet
anchor deploy --provider.cluster devnet

# 3. inspect what the repo builds against
pnpm --filter @perpetua/sdk ops:extract-idls       # dump the Meteora IDLs
pnpm --filter @perpetua/sdk ops:verify-offsets     # check offsets against 11 live positions

# 4. run the flow end to end on devnet
KEYPAIR=~/.config/solana/devnet.json pnpm --filter @perpetua/sdk ops:devnet-e2e
```

`ops:create-vault` builds and sends a single `create_vault` from a local keypair, reading `POSITION`,
`POOL`, `POSITION_NFT_MINT`, `POSITION_NFT_ACCOUNT`, `POSITION_NFT_PROGRAM`, `TOKEN_A_MINT`,
`TOKEN_B_MINT`, `TOKEN_A_PROGRAM`, `TOKEN_B_PROGRAM` and `CP_AMM_PROGRAM` from the environment.

### 8. From an AI agent

```bash
pnpm build
PERPETUA_API_URL=http://localhost:8787 pnpm mcp
```

The tool list and the client configuration are under [MCP server](#mcp-server).


## The program

`programs/perpetua_vault` — Anchor 0.32. `declare_id!` is the single source of truth; the IDL, the
SDK constants, `Anchor.toml` and the LiteSVM harness all derive from it.

```
G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2
```

### Accounts

| Account | Seeds | Holds |
|---|---|---|
| `Config` | `["config"]` | `admin`, `treasury`, `protocol_fee_bps` (default `0`), `paused_entry`, `bump` |
| `Vault` | `["vault", position]` | `pool`, `position`, the NFT refs, `share_mint`, `acc_fee_per_share_a/b`, `carry_a/b`, `total_staked`, `total_claimed_a/b`, `risk_flags`, `created_at`, `bump` |
| `Stake` | `["stake", vault, owner]` | `amount`, `debt_a/b` (accumulator snapshots), `pending_a/b`, `bump` |

Accounts are keyed by the **position** address, so one position maps to exactly one vault.

### Instructions

| Instruction | Caller | Effect |
|---|---|---|
| `init_config(protocol_fee_bps)` | admin, once | creates `Config`; `treasury` is set to `admin` |
| `create_vault()` | position owner | verifies the lock, takes the NFT account, mints 1,000,000 share tokens, revokes the mint authority, screens the fee mints' Token-2022 extensions |
| `crank_claim()` | anyone | CPIs `claim_position_fee`, credits the accumulator, skims the protocol fee |
| `stake(amount)` | holder | claims **first**, then adds stake |
| `unstake(amount)` | holder | claims **first**, then removes stake |
| `unstake_no_claim(amount)` | holder | removes stake without the claim CPI, for blocked or paused fee mints |
| `harvest()` | holder | pays out `pending_a/b` |
| `set_paused(paused)` | admin | gates **entry only** |
| `set_risk_flags(flags)` | admin | re-settles the risk bitmask as the pool ages |

> `instructions/touch.rs` is **not** an instruction despite the name — it holds the shared claim path
> (`touch`, `settle`, `ClaimAccounts`) that `crank_claim` and `harvest` both call.

### How fees are accounted

```
  crank_claim()
       │
       │ 1. read vault_a_account.amount          (before)
       │ 2. CPI cp-amm claim_position_fee        (vault PDA signs)
       │ 3. reload, read vault_a_account.amount  (after)
       │ 4. delta = after - before
       ▼
   ┌───────┐
   │ delta │
   └───┬───┘
       │
       ├──► apply_protocol_fee(delta, bps) ──► fee ──► treasury
       │
       └──► net ──► accrue(vault, net)
                      │
                      ├─ total_staked == 0 ──► carry += net            (banked)
                      │
                      └─ otherwise ──► acc_fee_per_share += net·1e18 / total_staked
                                            │
                                            ▼
              pending(stake) = stake.amount · acc / 1e18 − stake.debt + stake.pending
                                            │
                                     harvest() pays it out
```

Reading the balances around the CPI rather than trusting the claimed amount is what keeps accounting
exact when the fee mint is Token-2022 with a transfer fee. Fees claimed while nobody is staked land in
`carry_a/b` and are released to the next stakers.

### Design rules

- The program **never** removes liquidity, closes a position or changes a lock. The principal is
  unreachable by construction.
- `create_vault` only accepts positions with zero unlocked and zero vested liquidity and a positive
  permanent lock. Split a mixed position with DAMM v2 `split_position` first.
- **Claim-on-touch**: `stake` and `unstake` claim before touching accounting, which kills the
  JIT-staking sandwich. `unstake_no_claim` covers the case where a fee mint blocks claims.
- **Entry is pausable, exit never is.**

```bash
anchor build
pnpm program:keypair                          # install the committed devnet keypair
pnpm program:check                            # Anchor.toml vs declare_id!
anchor deploy --provider.cluster devnet
```

The full deploy walkthrough, the SOL arithmetic and the traps that cost real time:
[docs/DEVNET.md](docs/DEVNET.md).


## API reference

`apps/api` is a Hono app over a `Store` port with two implementations: `InMemoryStore` (the default)
and `DrizzleStore` (Postgres). Base URL `http://localhost:8787`.

### Read routes

| Route | Query | Returns |
|---|---|---|
| `GET /health` | | `{ ok: true }` |
| `GET /v1/demo` | | the demo pool and wallet |
| `GET /v1/stats` | | vaults, positions securitized, fees distributed, unique stakers, DLMM volume |
| `GET /v1/vaults` | | every indexed vault |
| `GET /v1/vaults/:id` | | one vault, or 404 |
| `GET /v1/vaults/:id/events` | `limit` 1–500, default 50 | decoded Anchor events for that vault |
| `GET /v1/positions/:wallet` | | securitizable positions |
| `GET /v1/positions/:wallet/onchain` | | position detail read from DAMM v2, plus `eligibility` |
| `GET /v1/valuation/:position` | `pool`, `liquidityShare`, `protocolFeeBps`, `discountRate`, `horizonDays`, `days` | valuation for a position |
| `GET /v1/pools/:pool/yield` | as above | valuation for a whole pool |
| `GET /v1/pools/:pool/series` | `days` 7–30 | the raw daily fee series |
| `GET /v1/sale/plan` | `fairValuePerShareUsd`, `totalShares`, `saleFraction`, `lowerPct`, `upperPct`, `binStep`, `binCount` | the DLMM ask ladder |
| `GET /v1/dbc/preset` | `creatorTradingFeePct`, `creatorLiquidityPct`, `partnerLiquidityPct`, `lockedPct` | the preset and its validation |
| `GET /v1/stream` | | Server-Sent Events feed of vault events |

### Transaction routes

Each returns `{ transaction: <base64> }` for the caller's wallet to sign, and 503 when the API has no
RPC connection. **The API never holds a key.**

| Route | Body |
|---|---|
| `POST /v1/tx/create-vault` | `creator`, `pool`, `position`, `positionNftMint`, `positionNftAccount`, `positionNftProgram`, `tokenAMint`, `tokenBMint`, `tokenAProgram`, `tokenBProgram`, `shareMint` |
| `POST /v1/tx/crank-claim` | `owner`, `vault` |
| `POST /v1/tx/stake` | `owner`, `vault`, `amount` (base units, decimal string) |
| `POST /v1/tx/unstake` | `owner`, `vault`, `amount` |
| `POST /v1/tx/harvest` | `owner`, `vault` |

```bash
POOL=$(curl -s localhost:8787/v1/demo | jq -r .pool)
curl -s "localhost:8787/v1/pools/$POOL/yield" | jq .valuation.fairValueUsd
curl -s "localhost:8787/v1/sale/plan?fairValuePerShareUsd=1" | jq .plan.weightedAveragePriceUsd

curl -s -X POST localhost:8787/v1/tx/stake \
  -H 'content-type: application/json' \
  -d '{"owner":"<wallet>","vault":"<vault>","amount":"1000000"}' | jq -r .transaction | head -c 40
```

Every query parameter and body is validated with zod; a bad value returns **400** with the issue list.

## The valuation model

`@perpetua/valuation` is pure TypeScript with zero chain dependencies, and it is deliberately a
**range, never a promise**.

```
  trailing daily fees (7–30 days)
          │
          ▼
   estimateDecay ── weighted log-linear fit of ln(fee_t) = a + b·t,  λ = −b
          │
          ▼
   blendDecay(fitted λ, cohortPriorFor(poolAgeDays))     ← shrinkage toward a prior
          │
          ▼
   projectFees ── F_t = max(f_last · e^(−λt), floor),  floor = 2% · f_last
          │
          ▼
   presentValue ── PV = Σ share · F_t · (1 − protocolFee) / (1 + r)^(t/365)
          │
          ├──► bear / base / bull   (λ ×1.5 / 1.0 / 0.6, volume ×0.7 / 1.0 / 1.25)
          ├──► fair value per share = PV / 1,000,000
          ├──► payback days and implied APR at any offer price
          └──► risk flags
```

λ is clamped to `[−0.02, 0.15]` per day so a noisy series cannot produce an absurd projection.

### Cohort prior

Young pools decay faster, because the early fee spike is hype rather than earnings:

| Pool age | Prior λ/day | Blend weight |
|---|---|---|
| ≤ 7 days | 0.09 | 0.60 |
| ≤ 30 days | 0.06 | 0.40 |
| ≤ 90 days | 0.035 | 0.25 |
| older | 0.02 | 0.15 |

`blendDecay(fitted, prior) = fitted·(1 − w) + prior.λ·w` — the prior pulls hardest exactly where the
data is thinnest, which is the same idea as shrinkage in a hierarchical model.

### Risk flags

| Flag | Trigger |
|---|---|
| `compounding_mode` | the pool reinvests part of the fee, so it cannot be distributed |
| `pausable_mint` | the fee mint carries a `DefaultAccountState` extension |
| `permanent_delegate` | the fee mint carries a `PermanentDelegate` extension |
| `pool_too_young` | fewer than seven days of history |
| `volume_concentration` | one wallet drove more than half of volume |
| `low_liquidity` | pool liquidity below $50k |

Flags do not change the price. They are surfaced next to it and used to filter the Explore table.

### Sessions, compounding, reproducibility

- `session.ts` classifies any instant into `pre` (04:00–09:30), `regular` (09:30–16:00), `post`
  (16:00–20:00) or `overnight` (20:00–04:00) Eastern Time, handles the Friday 20:00 → Sunday 20:00
  dead zone, splits a fee series per session, and measures how long the reference is dark.
- `compounding.ts` separates `claimablePvUsd` — the withdrawable **floor** — from
  `growthAdjustedPvUsd`, the **upside**, which counts reinvested fees that drift the position's share
  of the pool upward.
- `version.ts` pins `modelVersion` and a 64-bit FNV-1a `inputsHash` over the canonical (key-sorted)
  JSON of the inputs onto every result, so any published number is reproducible.

### Calibration

`pnpm --filter @perpetua/valuation backtest` regenerates
[`packages/valuation/backtest/results.md`](packages/valuation/backtest/results.md) from synthetic pools
whose decay rate is known:

| Metric | Value |
|---|---|
| Mean absolute error, 30 days ahead | **21.7%** |
| Calibration (mean predicted ÷ mean realized) | **1.150** |

Calibration near 1.0 means the model is unbiased on average. Real series carry regime changes the
synthetic set does not model, so treat these numbers as an upper bound.

## Status

Every claim below was verified by running it, not by reading the source.

| Area | State |
|---|---|
| `programs/perpetua_vault` | **deployed on devnet** — `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`, ProgramData `3TZquUCXK8AgLHVkAtTFVu3jx6qCJu8NY7umV6FKg7RG`, 448,248 bytes, deployed in slot 507749514 |
| Bytecode identity | `solana program dump` hashes **byte-for-byte** to `target/deploy/perpetua_vault.so` (`sha256 30796ad88425eec7…b7aca6a472`) — what is live is what was tested |
| Position-lock offsets | verified against **11 live on-chain DAMM v2 positions**, one of them permanently locked |
| Rust | `cargo test --workspace` → **26 pass**; `cargo clippy --workspace --all-targets -- -D warnings` clean |
| TypeScript | **131 tests** across 7 packages; `biome check` clean; `tsc` clean; `next build` green |
| `@perpetua/web` | 6 pages, plus `loading.tsx`, `error.tsx`, `not-found.tsx` and `global-error.tsx` boundaries |
| Meteora SDKs | `@meteora-ag/cp-amm-sdk`, `@meteora-ag/dlmm` and `-dynamic-bonding-curve-sdk` are wired through real adapters, not stubs |
| LiteSVM suite | `tests/litesvm`; loads the compiled artifact when `cargo build-sbf` is available and skips cleanly otherwise |

### Test counts

| Suite | Tests |
|---|---|
| `@perpetua/valuation` | 42 |
| `@perpetua/mcp` | 30 |
| `@perpetua/sdk` | 28 |
| `@perpetua/api` | 10 |
| `@perpetua/stock-kit` | 9 |
| `@perpetua/indexer` | 7 |
| `@perpetua/keeper` | 5 |
| **TypeScript total** | **131** (turbo: 12 tasks) |
| `perpetua_vault` — Rust unit tests | 17 |
| `perpetua_vault_litesvm` — boot + flow | 9 |
| **Rust total** | **26** |

```bash
pnpm --filter @perpetua/sdk ops:extract-idls      # dump the Meteora IDLs we build against
pnpm --filter @perpetua/sdk ops:verify-offsets    # check our byte offsets against live positions
pnpm ops:faucet -- --dry-run                      # how much devnet SOL the deploy still needs
KEYPAIR=~/.config/solana/devnet.json pnpm --filter @perpetua/sdk ops:devnet-e2e
```

## MCP server

`@perpetua/mcp` exposes Perpetua to other AI agents over the
[Model Context Protocol](https://modelcontextprotocol.io), so an LLM can price positions, read fee
report cards and build unsigned transactions without bespoke glue.

| Tool | What it does |
|---|---|
| `price_position` | Fair-value a permanently locked position, or a whole pool, as a decaying fee stream |
| `list_vaults` | List the indexed Perpetua vaults |
| `get_report` | Fee Report Card: valuation plus pooled fee/volume statistics |
| `simulate_preset` | Build, validate and price a DBC financeable preset |
| `build_securitize_tx` | Build the **unsigned** `create_vault` transaction |

```bash
pnpm build
PERPETUA_API_URL=http://localhost:8787 pnpm mcp
```

It holds no keys: `build_securitize_tx` returns a base64 wire transaction tagged `"unsigned": true`
plus the address that must sign it. Full setup, including the client JSON for Claude Desktop, Cursor
and VS Code, is in [packages/mcp/README.md](packages/mcp/README.md).

## Commands

Run from the repo root unless noted.

| Command | What it does |
|---|---|
| `pnpm install` | install the workspace |
| `pnpm build` | turbo: build every package and app |
| `pnpm test` | turbo: run all TypeScript tests |
| `pnpm typecheck` | turbo: `tsc --noEmit` everywhere |
| `pnpm lint` / `pnpm format` | `biome check .` / `biome format --write .` |
| `pnpm dev` | watch mode: web, api, indexer, keeper |
| `pnpm --filter @perpetua/api dev` | API only, on `:8787` |
| `pnpm --filter @perpetua/web dev` | web only, on `:3000` |
| `pnpm idl` | regenerate the program IDL from the built artifact |
| `pnpm program:check` | fail if `Anchor.toml` drifted from `declare_id!` |
| `pnpm program:sync` | rewrite the `Anchor.toml` program ids from `declare_id!` |
| `pnpm program:keypair` | install `keys/perpetua_vault-devnet.json` into `target/deploy/` |
| `pnpm ops:faucet` | request devnet SOL for the payer (`--dry-run`, `--attempts`, `--interval`) |
| `pnpm mcp` | start the MCP server over stdio |
| `pnpm --filter @perpetua/sdk ops:extract-idls` | dump the Meteora IDLs the repo builds against |
| `pnpm --filter @perpetua/sdk ops:verify-offsets` | check position byte offsets against live accounts |
| `pnpm --filter @perpetua/sdk ops:create-vault` | build and send `create_vault` from a local keypair |
| `pnpm --filter @perpetua/sdk ops:devnet-e2e` | run the whole flow end to end on devnet |
| `pnpm --filter @perpetua/valuation backtest` | regenerate the calibration report |

## Testing

```bash
pnpm test                                        # 131 TypeScript tests
pnpm lint && pnpm typecheck                      # biome + tsc
cargo test --workspace                           # 26 Rust tests
cargo clippy --workspace --all-targets -- -D warnings
pnpm program:check                               # Anchor.toml vs declare_id!
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs a TypeScript job
(`pnpm install --frozen-lockfile`, lint, build, test) and a Rust job (`cargo test` in
`programs/perpetua_vault`, then an Anchor build and a `solana-verify` build) on every push and pull
request.

## Security model

The vault takes custody of a **position NFT account, not of funds**. After `create_vault` the vault
PDA owns the NFT account and the fee stream can only be claimed and split by the program. There is
**no instruction that removes liquidity, closes the position or changes a lock** — the principal is
unreachable by construction.

| Threat | Mitigation |
|---|---|
| Admin drains the vault | The admin can only set `protocol_fee_bps` at init and re-settle `risk_flags`. There is no path to the NFT. |
| Admin traps holders | `set_paused` gates **entry only** (`create_vault`, `stake`). Exits — `unstake`, `unstake_no_claim`, `harvest`, `crank_claim` — are never gated. |
| JIT-staking sandwich | `stake` and `unstake` claim **before** touching accounting, in the same transaction. |
| Token-2022 transfer fees break accounting | Fees are credited by **balance diff** around the CPI, not by the claimed amount. |
| A paused or blocked fee mint bricks stakers | `unstake_no_claim` exits without the claim CPI. |
| Pool or position substitution | The vault is keyed by position (`["vault", position]`), `has_one = pool` pins the pool, and `share_mint` is pinned with `address =`. |
| cp-amm program substitution | `CP_AMM_PROGRAM_ID` is asserted on every account struct that receives it. |
| A `TransferHook` fee mint | `create_vault` walks the Token-2022 extension TLV and **refuses** the mint. |
| Arithmetic overflow | All arithmetic is `checked_*`; accumulators are `u128` scaled by `1e18`. |
| Rounding leakage | User claims floor; dust stays in the vault, bounded by the conservation invariant. |

The full threat model, the seven tested invariants, the pause switch and risk-flag semantics, the
incident runbook and the operational plan are in [docs/SECURITY.md](docs/SECURITY.md).

## Known limitations

Stated plainly, because a reviewer will find them anyway.

- **The LiteSVM fee flow drives a mock DAMM v2.** `tests/litesvm/tests/flow.rs` runs
  `init_config → create_vault → crank_claim → harvest` against the compiled program with the real SPL
  token program and real PDA signing, but the cp-amm callee is `tests/mock-cp-amm`. The mock
  reproduces the one behaviour the vault depends on — the fee delta arriving in the vault's token
  accounts — and nothing else, so DAMM v2's own pool validation and fee arithmetic are out of scope
  here. `scripts/fetch-programs.sh` dumps the real `cp_amm.so`; pointing the harness at it is a
  one-line change in `tests/litesvm/src/lib.rs`.
- **`init_config` wires `treasury` to `admin`.** There is no separate treasury argument, so the two
  cannot be separated later without re-initialising `Config`. A multi-sig treasury wants a
  `set_treasury` before this handles real value.
- **The API has no authentication, rate limiting or webhooks.** Spec 8A calls for hashed API keys;
  only the MCP server exists today. CORS defaults to the local web origin in development and to
  same-origin in production (`CORS_ORIGINS` opts a deploy in).
- **Only fully permanently locked positions are accepted.** Split a mixed position with DAMM v2
  `split_position` first.
- **The DLMM pair PDA seed for `createLbPair2`** should be confirmed on devnet, and the DBC migration
  hand-off to `/securitize` still needs a devnet run — see
  [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
- **The program is unaudited.** Do not put more at risk than you can lose.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Web shows "indexer API unreachable" | The API is not running. `pnpm --filter @perpetua/api dev`. The browser reads `NEXT_PUBLIC_API_URL`, default `http://localhost:8787`. |
| `pnpm install --frozen-lockfile` fails | The lockfile is out of sync with a `package.json`. Run `pnpm install --lockfile-only`. |
| Deploy fails with `is not an upgradeable program or already in use` | The **program address** is occupied, usually because an airdrop went there. Drain it to zero and pay from a separate wallet — see [docs/DEVNET.md](docs/DEVNET.md). |
| Faucet returns an `Internal error` code | A faucet-side fault that still consumes the credit. Use <https://faucet.solana.com>, which is a different backend. |
| `anchor build` fails inside `cargo build-sbf` | The Solana platform tools are missing (~531 MB from GitHub releases). Build where GitHub is reachable, or in CI. |
| LiteSVM tests skip | Expected when `target/deploy/perpetua_vault.so` is absent — the suite builds it when `cargo build-sbf` is available and skips cleanly otherwise. |
| Offset or spec checks fail | The program id drifted. Run `pnpm program:check`, then `pnpm program:sync`. |

## Documentation index

| Document | Contents |
|---|---|
| [docs/DEVNET.md](docs/DEVNET.md) | the devnet path: building, funding, deploying, and the traps |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the full flow and every component in detail |
| [docs/VALUATION.md](docs/VALUATION.md) | the model, its formulas, the cohort prior, sessions, calibration |
| [docs/SECURITY.md](docs/SECURITY.md) | threat model, invariants, pause switch, runbook, operational plan |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | what is verified against the shipped Meteora IDLs, and what is left |
| [docs/JUDGES.md](docs/JUDGES.md) | the 5-minute path |
| [packages/mcp/README.md](packages/mcp/README.md) | the MCP server for other agents |
| [docs/LEGAL_NOTE.md](docs/LEGAL_NOTE.md) | securities-law caveats |
| [PERPETUA_BUILD_SPEC.md](PERPETUA_BUILD_SPEC.md) | the build spec this repository implements |
| [keys/README.md](keys/README.md) | why the devnet program keypair is committed |

## License

MIT — see [LICENSE](LICENSE). Unaudited hackathon software: not legal, tax or investment advice. See
[docs/LEGAL_NOTE.md](docs/LEGAL_NOTE.md).

