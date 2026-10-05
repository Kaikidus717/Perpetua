# PERPETUA: the Fee-Rights Exchange for Meteora

> Turn the trading-fee stream of a locked DAMM v2 position (and a DBC creator's fee stream) into a **priced, tradable, claimable asset**.
> Launch on DBC → graduate to DAMM v2 → **securitize the fee stream** → sell it on DLMM → holders earn real fees.

Target: Meteora "Best use of DBC" track, Crypto World's Fair (deadline reported as ~Oct 12-13, 2026 by competing READMEs. **Confirm on the Superteam Earn listing**).
Spec date: Fri Oct 2, 2026. Working budget: ~10 days, 1-2 builders.

---

## Upgrade Pack and Final Stress Test (read first)

> **One-line pitch:** Perpetua lets anyone price, securitize and trade the fee stream of a Meteora pool, from DBC launch to DAMM v2 graduation to a DLMM market.

**The pitch in six sentences.**

1. Locked liquidity earns forever but is stuck in one wallet.
2. A backtested, session-aware model prices it.
3. A non-upgradeable vault issues tradable fee shares.
4. Issuers sell on DLMM limit orders and believers bid below.
5. A Preset Lab and Registry ship measured DBC configs.
6. A full developer platform makes it plug-and-play, live on mainnet.

All of the above is additive to the original plan. Nothing in this pack replaces a section below; where it changes a choice, the correction is called out explicitly and the old text is kept.

### Scorecard: honest estimate before vs. target after

My estimates only, 0-10. Before = where the project stood on the day this pack was written. Target = where it stands if every P0 below lands.

| Item | Before | Target |
|---|---|---|
| Idea 1 stock mechanics | 5 | 8 |
| Idea 2 curve/fee configs | 7 | 9 |
| Idea 3 end-to-end flows | 8 | 9 |
| Idea 4 dev tooling | 7 | 9 |
| Idea 5 preset marketplace | 6 | 8 |
| Depth | 8 | 9 |
| Execution | 7 | 8 |
| Originality | 8 | 9 |
| Impact | 8 | 9 |
| Traction | 4 | 7 |

### Evidence: unknowns that are now resolved

1. **DBC config builders.** The SDK exposes `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithMidPrice`, `buildCurveWithLiquidityWeights` and `buildCurveWithCustomSqrtPrices`. The config also carries `marketCapFeeSchedulerParams`, `creatorTradingFeePercentage` (0-100), `dynamicFeeEnabled` and `leftover`. This replaces the guesswork in section 10.1.
2. **DLMM limit orders.** Limit orders exist only on pools created in **limit-order function mode**, which excludes liquidity-mining rewards. One limit-order account covers up to **50 bins**. Asks sit above price, bids below. **Execution is not guaranteed.** Limit-order liquidity earns a fee share only when it contributes to a fill. **PermissionlessV2** DLMM pools accept any token pair. VERIFY the exact function-type parameter used at pool creation.
3. **DBC quote mints.** Plain SPL is fine. Token-2022 needs only metadata-style extensions, or a **Token Badge** created by an operator. Transfer fee must be **zero**. So a stock-quoted DBC launch works only for badged stock mints.
4. **DLMM token badges.** DLMM requires a badge for mints carrying `PermanentDelegate`, `TransferHook` or `MintCloseAuthority`. Our plain-SPL share mint is unaffected.
5. **Pyth equity sessions (ET).** Pre-market 4:00-9:30, regular 9:30-16:00, post-market 16:00-20:00, overnight Sunday-Thursday 20:00-04:00, and **no Friday-night session**. The longest no-reference window is about Friday 20:00 to Sunday 20:00 (~48h). VERIFY the exact session table and feed IDs against the Pyth docs.

### Corrections to the original spec (old text is kept in place)

- **C1.** Section 9's one-sided LP ladder becomes the **alternate** sale mode. The primary mode is ask-side **limit orders** (see section 9A).
- **C2.** Limit-order bids earn **no** fees until filled. LP-position bids **do** earn fees as price crosses their bins. Offer both.
- **C3.** The section 0 pointer to "section 14" for traction should read **13, 13A and 13B**.
- **C4.** A stock-quoted DBC preset requires a **badged** quote mint, with a documented fallback.

### Use-case ladder

1. Any DAMM v2 LP or DBC creator — Portfolio, Report Cards.
2. Launchpad teams — CLI, widget, presets.
3. Yield seekers and believers — shares, bids.
4. Stock-launch teams — Stock Launch Kit.
5. Builders and agents — REST, SSE, webhooks, MCP.

### Traction targets (goals only, report actuals)

- 5+ live vaults (3 own, 2+ external)
- 25+ unique wallets
- 200+ pools analyzed
- 10+ shared Report Cards
- 3+ registry presets, 1+ external licence
- 1+ external user of the widget, API or CLI
- exact on-chain fees and volume

**Integrity rule.** Never fake volume or users. Label self-trades as tests and keep them out of the KPIs.

---

## 0. Honest framing (read first)

- Meteora ships **Dynamic Fee Sharing (DFS)**: a PDA fee vault can own a DAMM v2 position NFT account, claim fees by CPI, and split them by fee-per-share accounting. It is capped at 2-5 fixed recipients and shares are not transferable.
- Our novelty is therefore **not** "a vault that claims fees". It is:
  1. **Tradable SPL fee shares** for any number of holders (stake-to-earn, claim-on-touch),
  2. a **valuation engine** that prices a fee stream (decay-aware, backtested),
  3. a **DLMM one-sided ask-ladder** as the primary sale venue,
  4. a **DBC "financeable launch" preset + wizard** so launch → graduate → finance is one flow.
- Pitch it as "cash-flow tokens: a new asset class on Meteora's liquidity layer", with DFS cited as the primitive we extend.
- Biggest risk is traction (cold-start market). Mitigation is in section 14.

### Judging criteria mapping

| Criterion | How Perpetua scores |
|---|---|
| Depth of Meteora integration | DBC (supply side: creator fees, financeable preset, migrated positions), DAMM v2 (position NFTs, `claim_position_fee`, `split_position`, permanent lock), DLMM (primary sale ladder + secondary market), plus DFS as the reference design |
| Technical execution | Anchor program with invariants + fuzz tests against real Meteora binaries, backtested valuation model, indexer, verifiable build |
| Originality / taste | Fee streams as assets: works for memes, stocks, AI tokens; outlasts the meme-stock meta |
| Impact potential | Every DBC creator/partner holding a locked position is a potential issuer; any LP fee stream is priceable |
| Traction | Securitize real mainnet positions, real DLMM sales, real fee distributions, public KPI page |

---

## 1. Positioning vs. prior art

| Existing | What it does | What it lacks (our gap) |
|---|---|---|
| Meteora Dynamic Fee Sharing | PDA vault owns position NFT, claims fees, 2-5 fixed recipients | Not tradable, no valuation, no market |
| Raydium Burn & Earn Fee Key | Transferable NFT for a locked position's fees | Other DEX, no pricing, no fractionalization |
| Bags / Believe fee shares | Fee routing to wallets at launch | Not an asset: cannot be sold or priced |
| Stock-quoted DBC launchpads (BellCurve, CurveForge, StockCurve, EquityCurve, Plinto, StockLaunch) | Launch mechanics | Do not touch the post-graduation fee stream |
| Curve studios / preset marketplaces (barkbork, CurveLab, Curvature, CurveCraft) | Config design and simulation | Same |
| dbc-pulse, FastRadar | Streaming and LP analytics | Analytics only, no instrument |

Final novelty check, **before writing code (30 min)**:
1. GitHub search: `damm-v2 fee share token`, `position nft fractional meteora`, `meteora fee rights`.
2. Ask in Meteora dev Discord/Telegram whether ElizaOS-style position-NFT tokenization was ever built.

---

## 2. Product walkthrough

**Issuer (token creator / launchpad):**
1. Launches on DBC with the *financeable* preset (or already holds a locked DAMM v2 position).
2. Opens `/securitize`, connects wallet, sees eligible positions with a fair-value range.
3. Clicks **Securitize**: the position NFT account is handed to the vault PDA, and 1,000,000 fee-share tokens (`pFEE-XYZ`) are minted to the issuer.
4. Chooses **Sell**: the app creates a DLMM `pFEE/USDC` pool and seeds a one-sided ask ladder around fair value. USDC proceeds accumulate in the issuer's DLMM position.

**Buyer:**
1. Buys `pFEE-XYZ` on DLMM (or via Jupiter once indexed).
2. **Stakes** the share token in the vault.
3. Harvests real token A/B fees any time. Every harvest is verifiable on-chain.

**Anyone (no wallet needed):** `/terminal` prices any DAMM v2 position or pool: trailing fee yield, decay half-life, payback period, risk flags.

### 90-second demo script
1. Terminal: paste a real mainnet pool → fair-value range + backtest accuracy.
2. Securitize a real locked position → Solscan: NFT account owned by the vault PDA.
3. DLMM ladder appears → buy shares with a second wallet.
4. Stake → trade volume hits the pool → `crank` → harvest → fees land in the buyer's wallet.
5. KPI page: total vaults, fees distributed, unique stakers, DLMM volume.

---

## 3. Architecture

```
            ┌──────────────────────────── Web (Next.js) ────────────────────────────┐
            │ Explore · Vault · Securitize · Launch(DBC) · Terminal · KPI           │
            └───────────────▲──────────────────────────────────▲────────────────────┘
                            │ REST/SSE                          │ tx building (SDKs)
                   ┌────────┴────────┐                  ┌───────┴────────────────────────┐
                   │ API (Hono)      │                  │ @perpetua/sdk                   │
                   │ + Postgres      │                  │  vault · sale(DLMM) · dbc       │
                   └────────▲────────┘                  │  wraps cp-amm / DBC / DLMM SDKs │
                            │                           └───────┬────────────────────────┘
            ┌───────────────┴──────────┐                        │
            │ Indexer + Keeper (Node)  │◄─── RPC / webhooks ────┤
            │ pools, positions, events │                        ▼
            │ valuation snapshots      │             ┌────────────────────────────┐
            │ crank_claim bot          │             │ perpetua_vault (Anchor)    │
            └──────────────────────────┘             │  CPI → DAMM v2 claim fee   │
                                                     └───────┬───────────┬────────┘
                                        DBC (supply) ◄───────┘           └──► DLMM (sale/market)
```

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Program | Rust, **Anchor 0.31+** | Use `declare_program!` with the Meteora IDL for CPI so no crate-version conflicts |
| Program tests | **LiteSVM** (Rust and TS) with real Meteora mainnet binaries | Fetch binaries with a script; do **not** commit them (check the Meteora licence terms) |
| Monorepo | **pnpm + Turborepo**, TypeScript 5, **Biome** | |
| Chain libs | `@solana/web3.js` 1.x, `@coral-xyz/anchor`, `@meteora-ag/cp-amm-sdk`, `@meteora-ag/dynamic-bonding-curve-sdk`, `@meteora-ag/dlmm`, optionally `@meteora-ag/dynamic-fee-sharing-sdk` | Pin versions from the Meteora Invent `studio/package.json` |
| Web | **Next.js (App Router)**, React, Tailwind, shadcn/ui, TanStack Query, lightweight-charts | Wallet adapter with Wallet Standard auto-detect (Phantom, Solflare, Backpack) |
| API | **Hono** on Node 22, Zod validation | Public read API doubles as the "developer tooling" story |
| DB | **Postgres** (Neon or Railway) + **Drizzle** | |
| Jobs | `node-cron` (keeper, snapshots) | Polling is enough at hackathon scale |
| RPC | Helius or Triton (free tier) + webhooks | Fallback to polling `getSignaturesForAddress` |
| Hosting | Vercel (web), Railway or Fly (API, indexer, keeper) | |
| CI | GitHub Actions: `anchor build`, tests, lint, **verifiable build** (`solana-verify`) | |
| Agent dev aids | Meteora Agent Skill (`meteora-invent/skills/meteora`) in `.claude/skills/`, Docs MCP, `docs.meteora.ag/llms.txt` | Speeds up SDK usage |

Program IDs (from Meteora docs): DBC `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`, DAMM v2 `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`, DLMM `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`, Dynamic Fee Sharing `dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh`.

---

## 5. Repo structure

```
perpetua/
├─ README.md                      # judge-facing: thesis, architecture, program IDs, tx links, demo video
├─ LICENSE                        # MIT
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ SECURITY.md                 # threat model, invariants, upgrade-authority plan
│  ├─ VALUATION.md                # model, assumptions, backtest results
│  ├─ JUDGES.md                   # 5-minute verification path + KPI links
│  └─ LEGAL_NOTE.md               # securities-risk disclosure (not legal advice)
├─ programs/
│  └─ perpetua_vault/
│     ├─ Cargo.toml
│     ├─ idls/cp_amm.json         # DAMM v2 IDL for declare_program!
│     └─ src/
│        ├─ lib.rs
│        ├─ constants.rs          # program ids, PRECISION, seeds
│        ├─ errors.rs
│        ├─ events.rs
│        ├─ state/{config.rs, vault.rs, stake.rs}
│        ├─ math.rs               # fee-per-share, rounding, carry
│        └─ instructions/
│           ├─ init_config.rs
│           ├─ create_vault.rs
│           ├─ crank_claim.rs
│           ├─ stake.rs
│           ├─ unstake.rs
│           ├─ unstake_no_claim.rs   # emergency exit if a fee mint blocks claims
│           ├─ harvest.rs
│           └─ claim_reward.rs       # P2: DAMM v2 farming reward passthrough
├─ tests/
│  ├─ litesvm/                    # create_vault, claim, JIT-attack, fuzz/invariants, Token-2022 mints
│  └─ fixtures/                   # gitignored: fetched mainnet binaries and accounts
├─ packages/
│  ├─ sdk/                        # @perpetua/sdk
│  │  └─ src/{vault/, sale/dlmmLadder.ts, dbc/financeablePreset.ts, dbc/launch.ts, positions/, idl/, index.ts}
│  ├─ valuation/                  # pure TS, zero chain deps
│  │  ├─ src/{model.ts, scenarios.ts, risk.ts, types.ts}
│  │  └─ backtest/{run.ts, results.md}
│  └─ shared/                     # types, constants, zod schemas
├─ apps/
│  ├─ web/                        # Next.js
│  │  └─ app/{page.tsx, vault/[id]/, securitize/, launch/, terminal/, kpi/}
│  ├─ api/                        # Hono REST + SSE
│  ├─ indexer/                    # pool/position/vault ingestion, snapshots
│  └─ keeper/                     # crank_claim bot
├─ scripts/
│  ├─ fetch-programs.sh           # dump Meteora binaries for LiteSVM
│  ├─ devnet-demo.ts
│  └─ mainnet-ops/                # launch, securitize, seed ladder (Invent-studio style)
├─ .github/workflows/ci.yml
├─ .claude/skills/meteora/        # copied from meteora-invent
├─ Anchor.toml
├─ package.json  pnpm-workspace.yaml  turbo.json  biome.json
```

---

## 5A. Repo structure additions

Additions to the tree in section 5. This is a structure, not a promise: anything not referenced by a P0 in section 12A is a placeholder.

```
perpetua/
├─ programs/
│  ├─ perpetua_vault/                     # section 6
│  └─ perpetua_registry/                  # section 10A: presets and licences
│     ├─ Cargo.toml
│     └─ src/
│        ├─ lib.rs
│        ├─ errors.rs
│        ├─ events.rs
│        ├─ state/{registry_config,preset,license}.rs
│        └─ instructions/
├─ tests/
│  ├─ fuzz/                               # Trident + proptest targets
│  ├─ differential/                       # TS reference accumulator vs the Rust program
│  └─ fork/                               # mainnet-forked DAMM v2 pool/position accounts
├─ packages/
│  ├─ sdk/src/
│  │  ├─ sale/{limitOrderLadder,lpLadder,bids,alphaVaultSale}.ts
│  │  ├─ registry/
│  │  └─ dbc/presets/{flat,exponential,long,twoSegment}.ts
│  ├─ lab/                                # simulator, curves, scorecard, differential tests
│  ├─ valuation/src/{session,compounding,cohortPrior}.ts
│  ├─ stock-kit/src/{reference,sessions,anchoredStart,closedMarketFeeCurve,scenarios,metrics}.ts
│  ├─ mcp/                                # section 8A: Model Context Protocol server
│  ├─ widget/                             # <perpetua-fee-badge> web component
│  └─ create-launchpad/
│     └─ src/
│        ├─ index.ts
│        ├─ templates/fun-launch-fork/     # forked from meteora-invent scaffolds/fun-launch
│        └─ wiring/{presets,dfsRoyalty,widget,securitize}.ts
├─ apps/
│  ├─ web/app/{presets,lab,compounding,portfolio,report/[pool],dev,docs,status,vault/[id]/bids}
│  ├─ api/src/{openapi.ts,webhooks/,keys/,rate-limit/,sse/}
│  ├─ indexer/src/{presetUsage,limitOrders}.ts
│  └─ bot/                                # optional Telegram/Discord alert bot
├─ research/{cohort-study,stock-session}
├─ examples/{terminal-badge,launchpad-presets}
├─ .claude/skills/perpetua/SKILL.md
└─ docs/{LAUNCHPAD_IN_A_BOX.md,STOCK_LAUNCH_KIT.md,B2B_PITCH.md}
```

---

## 6. On-chain program: `perpetua_vault`

### 6.1 Design principles
- The program **never** calls `remove_liquidity`, `close_position`, or any lock change. The principal is unreachable by construction.
- MVP only accepts positions with **zero unlocked and zero vested liquidity** (only permanent-locked). Use DAMM v2 `split_position` first to carve out the locked part of a mixed position.
- Fees are credited by **balance diff** around the CPI. This handles Token-2022 transfer fees automatically.
- **Claim-on-touch**: `stake`, `unstake`, `harvest` first CPI-claim, then update accounting. This kills the JIT-staking sandwich.

### 6.2 Accounts

| Account | Seeds | Fields |
|---|---|---|
| `Config` | `["config"]` | admin, protocol_fee_bps (default 0), treasury, bump |
| `Vault` | `["vault", position]` | pool, position, position_nft_mint, position_nft_account, token_a_mint, token_b_mint, token_a_program, token_b_program, share_mint, total_staked, acc_fee_per_share_a (u128), acc_fee_per_share_b (u128), carry_a, carry_b, total_claimed_a/b, creator, created_at, bump |
| `Stake` | `["stake", vault, owner]` | amount, debt_a, debt_b, pending_a, pending_b |
| Reward token accounts | ATAs owned by Vault PDA | hold claimed token A and B |
| Share mint | created in `create_vault` | 6 decimals, fixed supply 1,000,000 tokens, mint authority revoked after minting; Metaplex metadata for wallet display |

`PRECISION = 1e18` (u128). Floor rounding on user claims, dust stays in vault.

### 6.3 Instructions

| Instruction | Who | What |
|---|---|---|
| `init_config` | admin | one-time |
| `create_vault` | position holder | Verify pool/position/NFT account via deserialized position data; require unlocked == 0 and vested == 0 and permanent_locked > 0. SPL `set_authority(AccountOwner)` on the NFT account → vault PDA (same technique as the DFS SDK). Create share mint, mint full supply to depositor, revoke mint authority. |
| `crank_claim` | anyone | CPI `cp_amm::claim_position_fee` with Vault PDA as `owner` signer. delta = balance diff. If `total_staked > 0`, `acc += (delta + carry) * PRECISION / total_staked`, else `carry += delta`. Optional protocol skim. |
| `stake(amount)` | holder | touch (claim) → settle pending → transfer shares in → update debt |
| `unstake(amount)` | holder | touch → settle → transfer shares out |
| `unstake_no_claim` | holder | Same without the claim CPI, for when a fee mint is paused or claims fail. Fees stay in the position and are credited at the next successful touch. |
| `harvest` | holder | pays pending A and B via `transfer_checked` (token_interface) |

### 6.4 Core math (pseudocode)

```rust
fn touch(ctx) {
    let (a0, b0) = (vault_a.amount, vault_b.amount);
    cp_amm::claim_position_fee(/* owner = vault PDA via invoke_signed */)?;
    vault_a.reload()?; vault_b.reload()?;
    let (da, db) = (vault_a.amount - a0, vault_b.amount - b0);
    if v.total_staked > 0 {
        v.acc_a += (da + v.carry_a) as u128 * PRECISION / v.total_staked as u128; v.carry_a = 0;
        v.acc_b += (db + v.carry_b) as u128 * PRECISION / v.total_staked as u128; v.carry_b = 0;
    } else { v.carry_a += da; v.carry_b += db; }
}
fn pending(s: &Stake, v: &Vault) -> (u64, u64) {
    (((s.amount as u128 * (v.acc_a - s.debt_a_acc)) / PRECISION) as u64, /* same for b */ )
}
```
Note on carry: fees claimed while nobody is staked go to the next stakers. The first staker can capture the carry. Accept and disclose, or seed by having the issuer stake a dust amount at creation.

### 6.5 Invariants (fuzz and unit tests)
1. `Σ harvested + Σ pending + carry + vault_balance == Σ claimed` (per token, up to bounded dust).
2. No instruction can reduce position liquidity.
3. JIT test: stake → crank → harvest → unstake in one tx yields zero share of pre-existing fees.
4. Share supply fixed after `create_vault`.
5. Wrong pool, position, or program-id substitution is rejected (hardcode cp_amm ID).
6. Zero-fee claim is a no-op, no division by zero when `total_staked == 0`.
7. Token-2022 fee mints: balance-diff accounting stays exact.
8. Paused or blocked fee mint: `unstake_no_claim` still works.

### 6.6 Security and trust plan
- Verifiable build, public tx links, no admin path to the NFT or principal.
- Upgrade authority: Squads multisig with timelock during the hackathon, **revoke after a shakedown period**.
- TVL cap per vault and global in MVP, visible "unaudited, hackathon code" banner.
- Refuse (or warn loudly) on pools whose fee mints are pausable or have a permanent delegate.

---

## 6A. Security hardening

Three additions to the program in section 6, plus the test and CI work that proves them.

### Pause switch with a hard floor

- `Config.paused_entry` pauses **only** `create_vault` and `stake`.
- `unstake`, `unstake_no_claim`, `harvest` and `crank_claim` **can never be paused**. Users must always be able to exit and to pull what they are owed, even if the admin is compromised or absent.

### Risk flags on the vault

`Vault.risk_flags: u32` is a bitmask set at `create_vault` and re-settable by the admin.

| Flag | Meaning |
|---|---|
| `COMPOUNDING_MODE` | the pool's fee mode reinvests a share of fees, so the claimable stream is smaller than gross |
| `PAUSABLE_MINT` | the fee mint can be paused |
| `PERMANENT_DELEGATE_MINT` | the fee mint carries a permanent delegate |
| `TRANSFER_FEE_MINT` | the fee mint charges a transfer fee |
| `YOUNG_POOL` | pool age under 7 days |
| `LOW_LIQUIDITY` | pool liquidity below the configured floor |

`create_vault` **rejects** fee mints carrying a `TransferHook` extension. Pausable and permanent-delegate mints are allowed but **flagged and discounted** by the valuation engine, not silently accepted.

### New events

- `RiskFlagsSet { vault, flags }`
- `EntryPaused { paused }`

### Tests

1. **Trident fuzzing** plus **proptest** on `math.rs`.
2. **Differential test**: a TypeScript reference accumulator versus the Rust program over thousands of random stake / unstake / claim sequences, asserting the 6.5 invariants after every step.
3. **Mainnet-fork test**: clone real DAMM v2 pool and position accounts into LiteSVM and run the flow against them.

### CI

- `cargo clippy -D warnings`, `cargo audit`, `cargo deny`
- `anchor build --verifiable` and `solana-verify`; **publish the hash**
- Request an informal review from the Meteora devs.

### Account-validation checklist

Before touching state, every instruction must: check the program owner, check the PDA seeds and bump, check the stored cross-references (`has_one`), check the mint / token-program pairing, and treat every `UncheckedAccount` as an explicit, commented trust decision.

### Threat model (kept in docs/SECURITY.md)

| Threat | Mitigation |
|---|---|
| JIT sandwich | claim-on-touch inside `stake` / `unstake` |
| fake position substitution | vault keyed by the position address; `has_one = pool` |
| bricked claims | `unstake_no_claim` always available |
| rounding | floor on user claims, dust stays in the vault, bounded by the invariants |
| carry capture | carry is disclosed; optionally seeded with a dust stake |
| admin abuse | pause cannot block exits; no admin path to the NFT or principal |
| dust griefing | minimum stake amount; dust cannot force a crank |
| ladder front-running | ladder seeded in one transaction; limit-order asks are the primary mode |

### Incident runbook

1. Pause entry (`paused_entry`); exits stay open.
2. Post the transaction, the vault list and the exposure on `/status`.
3. If a fee mint blocks claims, direct holders to `unstake_no_claim`.
4. Rotate the upgrade-authority key; if it is already revoked, ship a new program and a migration path.

---

## 7. Valuation engine (`packages/valuation`)

**Inputs:** daily fee series for the pool (≥7 days, up to 30), position liquidity share, fee collect mode, mint risk flags.
**Model:**
1. Estimate daily fee decay λ by weighted log-linear regression on recent days, clamped to a sane range.
2. Project `F_t` over a 365-day horizon with a floor.
3. `PV = Σ share · F_t · (1 − protocol_fee) / (1 + r)^(t/365)`.
4. Output bear / base / bull (λ and volume multipliers), fair price per share, payback days, implied APR at a given offer price.
5. **Risk flags:** compounding mode (fees not claimable), pausable or delegate mints, pool age under 7 days, single-wallet volume concentration, low liquidity.
6. **Backtest:** for historical positions, predict day-T 30-day fees vs realized. Publish MAE and calibration in `VALUATION.md`.

Unit tests are deterministic and chain-free.

---

## 7A. Stock-session analytics and compounding analyzer

Two valuation upgrades that only matter once the pool's reference price follows a market clock.

### Stock-session analytics

- **Session calendar** built from the Pyth equity sessions in the top block: pre-market 4:00-9:30, regular 9:30-16:00, post-market 16:00-20:00, overnight Sunday-Thursday 20:00-04:00, and no Friday-night session (Eastern Time). Weekends and US market holidays are closed. VERIFY the 2026 holiday list.
- **Session-split hourly fee history.** Outputs: closed-session fee share, per-session volume, per-session average trade size.
- **Reference-price staleness and gap at the open.** Use the Pyth equity feeds, which follow market hours and can be stale outside them. Pyth Pro offers session filtering. VERIFY the feed IDs.
- **Gap statistics.** Measure the relationship between gaps and fees; do not assume it. Report the sample size alongside any correlation.
- **Issuer-control flags** read from the mint extensions (see 6A).
- **Terminal "Session view" panel** showing the current session, the time to the next boundary and the staleness of the reference.

### Compounding-vs-claimable analyzer

- `claimable = (1 - c) * LP fee * position share`, where `c` is the pool's compounding fee share.
- Embedded growth is modelled by evolving the position's share of the pool.
- **Report both.** The claimable present value is the **floor**; the growth-adjusted present value is the **upside**.
- `/compounding` comparison page, one row per vault.

### Valuation upgrades

- **Cohort-based decay prior** for young pools (under 30 days), blended with the fitted decay from section 7.
- **Calibration report**: interval coverage at 7, 14 and 30 days, published next to the backtest.
- **`model_version` plus an inputs hash on every response** so any number can be reproduced later.

---

## 8. Indexer, keeper, API

**Indexer jobs**
- Pool and position metrics from the Meteora data APIs (DBC: `dbc.datapi.meteora.ag`, DLMM: `dlmm.datapi.meteora.ag`. **VERIFY** the DAMM v2 API base URL in the docs; the third-party `meteora-go` client shows its endpoints).
- Vault events decoded via Anchor `EventParser`.
- Daily valuation snapshots, FEE/USDC price from DLMM pool state.

**Tables (Drizzle):** `pools`, `pool_daily`, `positions`, `vaults`, `vault_events`, `stakes`, `valuations`, `sales`.

**API**
- `GET /v1/positions/:wallet` (securitizable positions)
- `GET /v1/valuation/:position`
- `GET /v1/vaults`, `/v1/vaults/:id`, `/v1/vaults/:id/events`
- `GET /v1/pools/:pool/yield` (public Fee Yield API for terminals)
- `GET /v1/stats` (KPIs), `GET /v1/stream` (SSE for claims and stakes)

**Keeper:** every N minutes, read pending fees per vault, call `crank_claim` when above a threshold, log results.

---

## 8A. Developer platform

The published surface. Everything here is additive to the API in section 8.

- **OpenAPI generated from the Zod schemas**, served at `/openapi.json`, browsable docs at `/docs`.
- **SSE event types:** `vault.created`, `fees.claimed`, `stake.changed`, `sale.fill`, `bid.fill`, `valuation.alert`.
- **Webhooks**: HMAC-signed, with retries, a delivery log and replay.
- **API keys** stored hashed, with per-key rate limits.
- **TypeScript SDK**: `@perpetua/sdk` (already the internal client).
- **MCP server** `@perpetua/mcp` with tools `price_position`, `list_vaults`, `get_report`, `simulate_preset`, `build_securitize_tx`. It returns **UNSIGNED** transactions only and never holds keys.
- **Agent skill file** so coding agents can drive the above.
- **Embeddable widget** `<perpetua-fee-badge pool="...">` plus an iframe variant for platforms that strip custom elements.
- **Examples**: `examples/terminal-badge` and `examples/launchpad-presets`.
- `/v1/health` for uptime checks.
- **Every response includes `as_of`, `source` and `model_version`** so a number can always be traced back to its inputs.
- Optional **Telegram/Discord alert bot** subscribed to the webhook feed.

---

## 8B. CLI: `create-perpetua-launchpad`

```
npx create-perpetua-launchpad my-launchpad
```

- Forks Meteora's `fun-launch` scaffold (meteora-invent, `scaffolds/fun-launch`).
- Wires, in order:
  1. a **preset selector** reading `GET /v1/presets`, with the Lab score cards next to each choice;
  2. a **Dynamic Fee Sharing PDA fee vault** splitting partner fees between the launchpad, the preset author and optionally the protocol (VERIFY the config field and the PDA-claimer flow — spike S8);
  3. the **fee-badge widget** on token pages;
  4. a **"Securitize fees" button** on the creator page;
  5. an **SSE feed component**;
  6. an `.env` template, an Invent studio config and a devnet deploy script.
- **Acceptance:** zero to a deployed devnet launchpad in under 10 minutes, recorded on video.
- **Success metric:** 1+ external team uses it.

---

## 9. DLMM sale module (`packages/sdk/src/sale/dlmmLadder.ts`)

- Create a custom permissionless DLMM pair `FEE/USDC` (**VERIFY** current SDK function names; only one such pool can exist per base/quote pair, which fits since each share mint is unique).
- Ladder algorithm: inputs `fairValue`, `saleFraction` (e.g. 60%), `lowerPct` (e.g. −5%), `upperPct` (e.g. +25%), `binStep`. Distribute asks over bins with front-weighting; ≤ ~69 bins per position (**VERIFY**, add positions to extend).
- Handle token X/Y ordering by mint sort.
- Proceeds accumulate as USDC in the issuer's position. UI: "Withdraw proceeds".
- P2: DLMM limit orders as bid book for buyers below fair value.

---

## 9A. Limit-order sale, bids and Alpha Vault

**This CORRECTS section 9.** The one-sided LP ladder stays, but it becomes the alternate sale mode.

### Primary sale: ask-side limit orders

- Create the `pFEE/USDC` pool as a DLMM **PermissionlessV2** pair in **limit-order function mode** via `DLMM.createLbPair2`. VERIFY the exact function-type parameter.
- Place the issuer's shares as **ask-side limit orders**:
  - up to **50 bins per order account**; use several accounts for a longer ladder;
  - check for pending opposite-side liquidity in the target bins before placing;
  - cancel by passing the **non-empty** bin IDs;
  - VERIFY the SDK method that claims filled proceeds.
- **Alternate mode:** the section 9 one-sided LP ladder. Use it when the issuer wants the position itself to earn fees while it sells.
- **UI warning:** limit orders are **not guaranteed to fill**.

### Bids

- **Limit-order bids:** exact fills, **no fees until filled** (correction C2).
- **LP-position bids:** earn fees as price crosses their bins.
- **Conviction score** = `size * time_in_pool * depth_below_fair_value`, with a leaderboard and a "conviction wall" depth chart.
- One-click **"collect fills and stake"** so a filled bid rolls straight into a staked position.
- `GET /v1/vaults/:id/depth` feeds the chart.
- SDK `sale/bids.ts`: `placeBid`, `cancelBid`, `collectFillsAndStake`.

### Optional Alpha Vault pro-rata window

A toggle that opens a pro-rata deposit window before activation. VERIFY compatibility with limit-order mode pools before shipping it.

### Reprice helper and fill analytics

- A helper that cancels and re-places the ladder as fair value moves.
- Fill analytics: fill rate by bin, average fill size, time to fill.

### Tests

A devnet script covering place then partial fill, full fill, cancel and claim. The indexer must ingest limit orders so the depth chart can show both asks and bids.

---

## 10. DBC module (supply side)

1. **Financeable preset** (`financeablePreset.ts`): DAMM v2 migration, quote-only fee collection, **non-compounding**, creator/partner liquidity distribution weighted to **permanent-locked** (must sum to 100%, min 10% locked), sane creator trading-fee percentage.
2. **Launch wizard** (adapt Meteora's `fun-launch` scaffold): create config → create pool → (after graduation) discover creator/partner position NFTs → handoff to `/securitize`.
3. **P2: pre-graduation mode**: `transfer_pool_creator` to a vault PDA, crank `claim_creator_trading_fee`, plus surplus and migration-fee withdrawals (DFS already whitelists these actions as reference).
4. **VERIFY**: how migrated creator/partner positions are minted and who holds the NFTs after `migration_damm_v2`.

---

## 10A. Preset Lab and the preset registry

### Preset Lab (`packages/lab`)

- **Curves** built with the DBC SDK builders listed in the top block: flat, exponential, long, two-segment, liquidity-weighted.
- **Product presets:** closed-market, financeable (permanent-locked-heavy, quote-only fees, non-compounding), fee-durable (**a HYPOTHESIS** - claim it only if the cohort study supports it), stock-quoted.
- **Simulator:** Monte Carlo buy/sell flow with an arrival rate, lognormal sizes, a buy/sell ratio, and sniper and whale scenarios. Reimplement the curve math in TypeScript and differentially test it against SDK swap quotes.
- **Score card fields:** time to graduation, `P(graduate within 7d)`, creator vs. partner economics, sniper impact, post-graduation fee-stream fair value, decay half-life, and the assumptions behind each number.
- **Cohort study:** join DBC pools to their graduated DAMM v2 pools by config; the metric is **realized 30-day fees per dollar of locked liquidity**; bootstrap confidence intervals; publish the CSV and a notebook. Publish a null result honestly.

### Registry (`programs/perpetua_registry`)

| Account | Seeds | Fields |
|---|---|---|
| `RegistryConfig` | `["registry"]` | admin, treasury, usdc_mint, protocol_fee_bps |
| `Preset` | `["preset", author, preset_id]` | author, config_hash (sha256 of canonical config JSON), uri, price_usdc (0 = free), royalty_bps, active, licenses_sold, revenue_total |
| `License` | `["license", preset, licensee]` | purchased_at, price_paid |

Instructions: `init_registry`, `publish_preset`, `update_preset`, `deactivate_preset`, `purchase_license` (USDC to author and treasury; rejects duplicate licences).

**Honest note:** configs are public once used on-chain. The registry sells **curation, scores, one-click deploy and royalties**, not secrecy. The API returns the full config JSON only to wallets holding a `License`.

**DFS royalty path:** the deploy tool creates a **Dynamic Fee Sharing** PDA fee vault (2-5 recipients) as the partner fee claimer, so the preset author is paid out of the fee stream rather than upfront. VERIFY the config field and the PDA-claimer flow (spike S8).

`/presets` leaderboard with **Simulate**, **Buy licence** and **Deploy**.

---

## 10B. Stock Launch Kit (`packages/stock-kit`)

1. **Session-aware reference model:** price, confidence band, session label and age, from the Pyth equity feeds.
2. **Anchored start price** with a band and a thin-name premium, feeding `buildCurveWithMarketCap` or `buildCurveWithMidPrice`. Table stakes, not the differentiator.
3. **CLOSED-MARKET FEE CURVE (our distinct mechanic):**
   - the base fee **starts high and decays to the base fee at the moment the reference market reopens**;
   - inputs: launch time, target session boundary, cliff fee, base fee, linear or exponential mode;
   - outputs: scheduler params (VERIFY field names) and a **recommended launch time**;
   - pair it with `marketCapFeeSchedulerParams` for the post-graduation fee;
   - VERIFY (spike S12) that the DBC fee schedule starts at pool creation.
4. **Weekend-gap simulator scenario:** synthetic reference paths with fitted gap distributions and informed flow at the open; compare fee schedules on arbitrage loss, fees collected and volume lost. Publish in `research/stock-session`.
5. **Terminal thin-name metrics:** time to converge to the reference after the open, deviation by session, depth within a band, estimated arbitrage capture.
6. **Stock-quoted preset requires a badged quote mint** (spike S10). **Fallback:** a USDC-quoted stock-themed launch plus read-only analytics on existing stock-token DAMM v2 pools.
7. Claim only improvements supported by the simulator or by live data.

---

## 10C. Usage attestation

- Index DBC config creations and match them to registry hashes. VERIFY that config parameters can be compared reliably.
- Show launches per preset, graduation rate and realized fee yield on `/presets`.
- Rank by **usage and measured score**, not by listing order.
- **Pay-to-use is a choice:** a one-time licence **or** a zero-upfront DFS royalty.

---

## 11. Web app spec

| Route | Content |
|---|---|
| `/` Explore | Vault table: fair value vs market price, implied APR, 24h fees distributed, stakers; filters by risk flags |
| `/vault/[id]` | Underlying pool and position proof, cumulative fees chart, buy panel (DLMM swap), stake / harvest / unstake, event feed |
| `/securitize` | Scan wallet → eligibility checks → valuation preview → confirm (tx 1: create_vault) → sale setup (tx 2: DLMM pool + ladder) |
| `/launch` | DBC financeable launch wizard (P1) |
| `/terminal` | No-wallet pricing tool for any pool or position (judge fast-path) |
| `/kpi` | Live metrics: vaults, fees distributed, unique stakers, DLMM volume |

UX rules: show every on-chain address with an explorer link, simulate before sign, clear "unaudited" and risk copy, mobile-friendly.

---

## 11A. New pages and the Portfolio wedge

### New routes

| Route | Content |
|---|---|
| `/report/[pool]` | Fee Report Card with a generated social image |
| `/presets` | preset leaderboard: simulate, buy licence, deploy |
| `/lab` | Preset Lab: curves, product presets, score cards |
| `/vault/[id]/bids` | conviction wall, place and cancel bids |
| `/compounding` | claimable vs. compounding comparison |
| `/portfolio` | every position a wallet holds, in one place |
| `/dev` | API keys, webhooks, quickstart |
| `/docs` | OpenAPI-backed docs |
| `/status` | paused entry, incident notes, exposures |

**UX rules:** the buy flow **bundles swap + stake in one transaction**; every number links to its on-chain source.

### Portfolio

Connect a wallet and see **all** DAMM v2 positions (locked, vesting, unlocked) and DBC creator/partner accounts.

- Per item: fair-value range, pending fees, risk flags, claim, alerts, and a **"Securitize"** call to action when it is eligible.
- **Creator mode:** fees per token pre- and post-graduation, with bundled claims where safe (VERIFY).
- A shareable portfolio card that contains **no private data**.
- **Purpose:** a daily-use wedge that is useful **without any share market existing yet**.

---

## 12. Backlog with priorities

**P0 (must ship, mainnet)**
- [ ] Spike S1-S4 (section 15) pass
- [ ] `create_vault`, `crank_claim`, `stake`, `unstake`, `harvest`, `unstake_no_claim`
- [ ] LiteSVM tests incl. JIT attack and invariants
- [ ] Valuation lib + backtest published
- [ ] Indexer + API + `/terminal`
- [ ] `/securitize` + DLMM ladder
- [ ] Mainnet deploy with caps, ≥3 real securitized positions, ≥1 external buyer
- [ ] README, JUDGES.md, demo video

**P1**
- [ ] DBC financeable preset + launch wizard
- [ ] KPI page, SSE feed
- [ ] Protocol fee skim (default 0, documented)
- [ ] Verifiable build + multisig upgrade authority

**P2**
- [ ] DBC pre-graduation creator-fee mode
- [ ] DLMM limit-order bid book
- [ ] DAMM v2 `claim_reward` passthrough
- [ ] Jupiter integration check for share tokens

---

## 12A. Backlog additions

Added to the priorities in section 12. Existing items keep their priority.

**P0 (must ship, mainnet)**

- [ ] `paused_entry`, `risk_flags`, TransferHook rejection (6A)
- [ ] Trident, differential and mainnet-fork tests (6A)
- [ ] session analytics v1 and compounding analyzer v1 (7A)
- [ ] Preset Lab with flat, exponential, long, financeable, fee-durable, stock-quoted and closed-market presets (10A)
- [ ] `perpetua_registry` program (10A)
- [ ] Report Cards (`/report/[pool]`)
- [ ] OpenAPI, SDK, and the bundled buy+stake transaction (8A, 11A)
- [ ] limit-order sale and bids with a devnet test (9A)
- [ ] Stock Launch Kit (10B)
- [ ] Portfolio (11A)
- [ ] CLI with a demo video (8B)
- [ ] spikes S10, S11, S12
- [ ] supply acquisition plan (13A)

**P1**

- [ ] webhooks, API keys, MCP server, widget, examples (8A)
- [ ] conviction bids polish (9A)
- [ ] DFS royalty route (10A)
- [ ] cohort study (10A)
- [ ] docs site, `/status`, alert bot (8A)
- [ ] usage attestation (10C)
- [ ] thin-name metrics panel (10B)
- [ ] stock-session research note (10B)
- [ ] B2B pitch kit (13A)

**P2**

- [ ] Alpha Vault sale mode (9A)
- [ ] NAV oracle account
- [ ] reprice helper (9A)
- [ ] Jupiter indexing check
- [ ] bounty pledge
- [ ] scheduled-launch assistant (10B)

---

## 13. Traction plan (judged criterion)

- Securitize **your own** launches first (one SOL-quoted, one stock-quoted), so supply exists on day 1.
- Pre-wire 5-10 testers with small allocations ($10-50). Post tx links, not claims.
- DM 5 DBC creators or launchpad teams offering a free valuation report from the terminal.
- Public KPI page: vaults, positions securitized, USD fees distributed, unique stakers, DLMM volume.
- Keep caps on. Better a small honest number than a large unverifiable one.

---

## 13A. Traction and B2B

### Supply acquisition without fake volume

1. **Your own DBC launches** - one SOL-quoted and one stock-quoted - so supply exists on day one.
2. **Small permanent locks** in already-active DAMM v2 pools. The principal is gone **forever**, so only use an amount you can afford to lose. Say so in the UI.
3. **Two outside creators**, each given a free valuation report, so at least some supply is not self-generated.

### Growth loops

Report Cards, the preset leaderboard, widget adoption with 3 terminals or launchpads, the alert bot, and a weekly KPI post.

### B2B

Offer launchpads a **free valuation of their partner fee streams**, a "creator financing" button, and the CLI / widget / licensed presets. Deliver `docs/B2B_PITCH.md`, a 3-minute demo video and an outreach log. Report only integrations that actually happened.

### Log for the submission

Unique wallets, vaults, fees per token, DLMM volume, API requests by key, widget embeds, licences sold, and reports shared.

---

## 14. Schedule (Oct 2 → Oct 12) and kill criteria

| Date | Goal |
|---|---|
| Fri Oct 2 | Novelty check, spikes S1-S4, repo scaffold |
| Sat Oct 3 | Finish spikes. **Go/no-go at end of day** |
| Sun Oct 4 | Program instructions + core tests |
| Mon Oct 5 | Hardening, fuzz tests; valuation lib; DB schema |
| Tue Oct 6 | Indexer + API; devnet deploy |
| Wed Oct 7 | Web: Explore, Vault, Terminal; DLMM ladder |
| Thu Oct 8 | Securitize wizard e2e on devnet; mainnet deploy with caps |
| Fri Oct 9 | Mainnet: launch, securitize, sell, onboard testers |
| Sat Oct 10 | Traction push, docs, demo video |
| Sun Oct 11 | Polish, README, submission draft, freeze |
| Mon Oct 12 | Submit (buffer before the deadline) |

**Spikes (Day 0-1)**
- **S1** (critical): in LiteSVM with mainnet binaries, hand a position NFT account to a PDA and CPI `claim_position_fee` successfully.
- **S2**: read position account fields (unlocked / vested / permanent-locked) from raw data.
- **S3**: create a DLMM pool for a fresh SPL mint and seed a one-sided position.
- **S4**: confirm DAMM v2 data API endpoints and a real locked position to test with.

**Kill criteria**
- S1 fails by Sat evening → pivot to **Fee Yield Terminal + whole-position escrow sale** (no fractional shares), or the DLMM conviction-pool runner-up.
- Program not passing invariant tests by Mon Oct 5 → ship valuation + terminal + DFS-based 2-party fee split demo as the fallback story.

---

## 14A. Schedule and spikes (upgrade pack)

Two tracks. **Track A: on-chain.** **Track B: data and product.** If solo, interleave A then B.

| Date | Goal |
|---|---|
| Oct 2 | S1, S2, S4, S5, S10, S11, S12; scaffold |
| Oct 3 | `create_vault` and `crank_claim` pass in LiteSVM; valuation v0; **go/no-go on S1** |
| Oct 4 | `stake`, `unstake`, `harvest`, events; indexer; Portfolio data model |
| Oct 5 | fuzzing, `paused_entry`, `risk_flags`; valuation v1, session analytics, compounding analyzer; reference model |
| Oct 6 | registry program and tests; ladder module; Closed-Market Fee Curve calculator and simulator; REST / SSE / webhooks; devnet deploy; CLI skeleton |
| Oct 7 | limit-order sale e2e; bids; web Explore / Vault / Terminal / Report; Portfolio UI |
| Oct 8 | DBC presets on devnet; DFS royalty; CLI complete; usage indexer; securitize wizard, Presets, Lab, MCP, widget; mainnet deploy with caps |
| Oct 9 | mainnet ops, onboard testers, cohort study run |
| Oct 10 | traction push, docs, video, B2B outreach |
| Oct 11 | freeze, verifiable build, submission draft |
| Oct 12 | submit |

### Spikes

- **S5:** builders vs. simulator (do the SDK builders reproduce the simulator's curves?)
- **S6:** limit orders and position release time
- **S7:** equity feeds off-hours
- **S8:** DFS as partner fee claimer
- **S9:** Token-2022 extension parsing
- **S10:** badged stock quote mints
- **S11:** limit-order mode pool on devnet (place, fill, cancel, claim)
- **S12:** when the DBC fee schedule starts

### If behind, protect in this order

1. vault + tests
2. valuation + terminal
3. limit-order sale
4. mainnet vaults
5. Report Cards
6. Portfolio
7. Lab + Registry
8. CLI
9. platform extras
10. bids

---

## 15. Verify-first list (unknowns I could not confirm)

1. Exact `claim_position_fee` account order in the current DAMM v2 IDL.
2. Whether any freeze behaviour of the pool (freeze authority on position NFTs) affects `set_authority` on the NFT account (the DFS SDK does this ownership handoff, so likely fine).
3. How DBC migration mints and assigns creator/partner positions.
4. DAMM v2 data API base URL and rate limits.
5. DLMM SDK method names, bin-count limits, pool-creation costs.
6. Whether fee mints for your chosen demo pools are plain SPL or Token-2022 with pause/delegate extensions.
7. Anchor / SDK version compatibility with `declare_program!`.

---

## 15A. Verify status (upgrade pack)

Status of every unknown raised by this pack. "Resolved" means I have an answer I am willing to build on; "partly" means the shape is known but a parameter is not; "open" means there is a spike for it.

| Item | Status | Note |
|---|---|---|
| DBC builder names | resolved | `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithMidPrice`, `buildCurveWithLiquidityWeights`, `buildCurveWithCustomSqrtPrices` |
| Stock quote mints | partly resolved | needs a Token Badge; metadata-only extensions, transfer fee must be zero |
| Limit orders | partly resolved | 50 bins per account, asks above / bids below; **position release time still open** |
| Alpha Vault compatibility | open | VERIFY against limit-order mode pools |
| DFS as partner fee claimer | open | spike S8 |
| Equity feeds | resolved in principle | sessions known; **feed IDs open** |
| Trident / `solana-verify` | open | toolchain install and CI wiring |
| Holiday calendar | open | VERIFY the 2026 US market holidays |
| Fee schedule start | open | spike S12: does the DBC fee schedule start at pool creation? |
| Claiming limit-order proceeds | open | spike S11 |

---

## 16. Submission checklist

- [ ] Open-source repo (or add GitHub user **dannxbt** with read access if closed)
- [ ] README: thesis, DFS acknowledgment, architecture diagram, program IDs, tx links
- [ ] `JUDGES.md`: 5-minute path (terminal without wallet → one vault page → one claim tx)
- [ ] 3-minute demo video following the 90-second script
- [ ] Backtest results and invariant test results linked
- [ ] KPI page live with real numbers
- [ ] Risk and legal note included
- [ ] Meteora-usage table mapped to the judging criteria (section 0)

---

## 16A. Submission checklist additions

Added to the checklist in section 16.

- [ ] OpenAPI, SDK, MCP server, agent skill and widget all documented
- [ ] Registry address published, 3+ presets listed, 1+ external licence sold
- [ ] Cohort study dataset, notebook and result (including a null result)
- [ ] Fuzz, differential and mainnet-fork test reports
- [ ] Verifiable-build hash published
- [ ] `docs/SECURITY.md` with the threat model and the incident runbook
- [ ] KPI page and `/status` page live
- [ ] CLI demo video
- [ ] Closed-Market Fee Curve results
- [ ] Meteora-usage table covering DBC, DAMM v2, DLMM, DFS and Alpha Vault if used
- [ ] Add GitHub user **dannxbt** with read access if the repo is closed-source

---

## 17. Risks and legal

- **Smart-contract risk**: custody of position NFTs. Mitigations in 6.6. Unaudited, say so.
- **Valuation risk**: fees decay after hype. The model is a range, not a promise. Never show a single "guaranteed APR".
- **Securities risk**: fee-share tokens may be treated as securities in some jurisdictions. This is not legal advice. Get counsel before marketing beyond a hackathon demo, and consider geo-restrictions on the UI.
- **Dependency risk**: Meteora could ship tradable fee shares itself. Position the project as an extension of their primitive and keep the valuation + market layers as the lasting value.

---

## 17A. Risks added by this pack

Added to the risks in section 17.

| Risk | Why it is new | Mitigation |
|---|---|---|
| **Scope** | this pack roughly doubles the surface (second program, Lab, Registry, CLI, MCP, widget, Stock Kit) | the protection order in 14A; if behind, the vault, the valuation and the limit-order sale survive |
| **Preset-claim honesty** | the Lab publishes predicted performance | publish score cards with their assumptions, publish the null result, never imply a guarantee |
| **Registry configs are public** | a licence cannot make an on-chain config secret | sell curation, scores, one-click deploy and royalties, and say so plainly in the UI |
| **Platform abuse** | API keys, webhooks and the widget are all public surface | per-key rate limits, HMAC-signed webhooks with a delivery log, widget runs read-only |
| **Third-party data lag** | Pyth reference prices follow market hours and can be stale outside them | surface staleness and `as_of` on every number; never present a stale reference as live |
| **MCP server misuse** | agents will drive it | the MCP server returns **unsigned** transactions only and never holds keys |
| **Securities risk** | fee shares, presets sold for USDC, and stock-quoted launches each raise it | geo-restrict the UI where needed, get counsel before marketing |

---

## 18. References

- DBC developer guide: https://docs.meteora.ag/developer-guides/dbc
- DBC instructions: https://docs.meteora.ag/developer-guides/dbc/program/instructions
- DAMM v2 NFT positions: https://docs.meteora.ag/core-products/damm-v2/nft-positions
- DAMM v2 liquidity locking: https://docs.meteora.ag/overview/products/damm-v2/liquidity-locking
- Dynamic Fee Sharing: https://docs.meteora.ag/helper-products/dynamic-fee-sharing/what-is-dynamic-fee-sharing
- DFS instructions: https://docs.meteora.ag/developer-guides/dynamic-fee-sharing/program/instructions
- DFS TS SDK reference: https://docs.meteora.ag/developer-guides/dynamic-fee-sharing/typescript-sdk/reference
- Meteora Invent: https://github.com/MeteoraAg/meteora-invent
- DBC SDK: https://github.com/MeteoraAg/dynamic-bonding-curve-sdk
- DAMM v2 SDK: https://github.com/MeteoraAg/damm-v2-sdk
- Agent skill: https://docs.meteora.ag/agents/skill
- ElizaOS DAMM v2 case study (Meteora Medium): fee-rights tokenization as an open idea
- Raydium Burn & Earn (prior art for transferable fee keys)

### Added by the upgrade pack

- DBC token launch pool (Invent): https://docs.meteora.ag/invent/launch-pools/dbc-token-launch-pool
- DLMM limit orders: https://docs.meteora.ag/core-products/dlmm/limit-order
- DLMM guides overview: https://docs.meteora.ag/developer-guide/guides/dlmm/overview
- DBC Token-2022 support: https://docs.meteora.ag/core-products/dbc/token-2022-support
- Pyth market hours: https://docs.pyth.network/price-feeds/market-hours
- Pyth overnight equities explained: https://www.pyth.network/blog/overnight-equities-explained
