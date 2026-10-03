# PERPETUA: the Fee-Rights Exchange for Meteora

> Turn the trading-fee stream of a locked DAMM v2 position (and a DBC creator's fee stream) into a **priced, tradable, claimable asset**.
> Launch on DBC → graduate to DAMM v2 → **securitize the fee stream** → sell it on DLMM → holders earn real fees.

Target: Meteora "Best use of DBC" track, Crypto World's Fair (deadline reported as ~Oct 12-13, 2026 by competing READMEs. **Confirm on the Superteam Earn listing**).
Spec date: Fri Oct 2, 2026. Working budget: ~10 days, 1-2 builders.

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

## 9. DLMM sale module (`packages/sdk/src/sale/dlmmLadder.ts`)

- Create a custom permissionless DLMM pair `FEE/USDC` (**VERIFY** current SDK function names; only one such pool can exist per base/quote pair, which fits since each share mint is unique).
- Ladder algorithm: inputs `fairValue`, `saleFraction` (e.g. 60%), `lowerPct` (e.g. −5%), `upperPct` (e.g. +25%), `binStep`. Distribute asks over bins with front-weighting; ≤ ~69 bins per position (**VERIFY**, add positions to extend).
- Handle token X/Y ordering by mint sort.
- Proceeds accumulate as USDC in the issuer's position. UI: "Withdraw proceeds".
- P2: DLMM limit orders as bid book for buyers below fair value.

---

## 10. DBC module (supply side)

1. **Financeable preset** (`financeablePreset.ts`): DAMM v2 migration, quote-only fee collection, **non-compounding**, creator/partner liquidity distribution weighted to **permanent-locked** (must sum to 100%, min 10% locked), sane creator trading-fee percentage.
2. **Launch wizard** (adapt Meteora's `fun-launch` scaffold): create config → create pool → (after graduation) discover creator/partner position NFTs → handoff to `/securitize`.
3. **P2: pre-graduation mode**: `transfer_pool_creator` to a vault PDA, crank `claim_creator_trading_fee`, plus surplus and migration-fee withdrawals (DFS already whitelists these actions as reference).
4. **VERIFY**: how migrated creator/partner positions are minted and who holds the NFTs after `migration_damm_v2`.

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

## 13. Traction plan (judged criterion)

- Securitize **your own** launches first (one SOL-quoted, one stock-quoted), so supply exists on day 1.
- Pre-wire 5-10 testers with small allocations ($10-50). Post tx links, not claims.
- DM 5 DBC creators or launchpad teams offering a free valuation report from the terminal.
- Public KPI page: vaults, positions securitized, USD fees distributed, unique stakers, DLMM volume.
- Keep caps on. Better a small honest number than a large unverifiable one.

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

## 15. Verify-first list (unknowns I could not confirm)

1. Exact `claim_position_fee` account order in the current DAMM v2 IDL.
2. Whether any freeze behaviour of the pool (freeze authority on position NFTs) affects `set_authority` on the NFT account (the DFS SDK does this ownership handoff, so likely fine).
3. How DBC migration mints and assigns creator/partner positions.
4. DAMM v2 data API base URL and rate limits.
5. DLMM SDK method names, bin-count limits, pool-creation costs.
6. Whether fee mints for your chosen demo pools are plain SPL or Token-2022 with pause/delegate extensions.
7. Anchor / SDK version compatibility with `declare_program!`.

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

## 17. Risks and legal

- **Smart-contract risk**: custody of position NFTs. Mitigations in 6.6. Unaudited, say so.
- **Valuation risk**: fees decay after hype. The model is a range, not a promise. Never show a single "guaranteed APR".
- **Securities risk**: fee-share tokens may be treated as securities in some jurisdictions. This is not legal advice. Get counsel before marketing beyond a hackathon demo, and consider geo-restrictions on the UI.
- **Dependency risk**: Meteora could ship tradable fee shares itself. Position the project as an extension of their primitive and keep the valuation + market layers as the lasting value.

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
