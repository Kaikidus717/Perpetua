# Perpetua — the fee-rights exchange for Meteora

Turn the trading-fee stream of a **permanently locked DAMM v2 position** (and a DBC creator's fee
stream) into a **priced, tradable, claimable asset**.

Launch on DBC → graduate to DAMM v2 → **securitize the fee stream** → sell it on DLMM → holders earn
real fees.

## Thesis

Meteora already ships *Dynamic Fee Sharing*: a PDA fee vault can own a DAMM v2 position NFT, claim
fees by CPI and split them by fee-per-share accounting — but it is capped at 2–5 fixed recipients and
its shares are **not transferable**.

Perpetua extends that primitive into a market:

1. **Tradable SPL fee shares** for any number of holders — stake to earn, claim on touch.
2. A **valuation engine** that prices a fee stream (decay-aware, discount, backtested).
3. A **DLMM one-sided ask ladder** as the primary sale venue.
4. A **DBC "financeable launch" preset** so launch → graduate → finance is one flow.

Pitch: *cash-flow tokens — a new asset class on Meteora's liquidity layer.*

## Architecture

```
                ┌──────────────────────── Web (Next.js) ────────────────────────┐
                │  Explore · Terminal · Securitize · Launch · Vault · KPI       │
                └───────────────▲────────────────────────────▲──────────────────┘
                                │ REST / SSE                  │ read-only pricing
                       ┌────────┴────────┐          ┌────────┴─────────────┐
                       │  API (Hono)     │          │ @perpetua/valuation  │
                       │  + Postgres     │          │ pure TS, chain-free  │
                       └────────▲────────┘          └──────────────────────┘
                                │
                    ┌───────────┴────────────┐
                    │ Indexer + Keeper       │◄──── RPC / Meteora data API
                    │ vaults, events, cranks │
                    └───────────┬────────────┘
                                ▼
                     ┌────────────────────────┐
                     │ perpetua_vault (Anchor)│  CPI → DAMM v2 claim_position_fee
                     └────────────────────────┘
```

## Repo layout

```
packages/shared      types, program ids, zod schemas
packages/valuation   decay model, scenarios, risk flags, backtest
packages/sdk         on-chain client, ladder + preset builders, ports
apps/api             Hono REST + SSE over a Store (in-memory or Drizzle/Postgres)
apps/indexer         Meteora data API client, Anchor event decoding, vault ingestion
apps/keeper          crank_claim bot
apps/web             Next.js App Router UI
programs/perpetua_vault   the Anchor program
scripts/gen-idl.mjs  single source of truth for the on-chain interface (IDL)
```

## Quickstart

```bash
pnpm install
pnpm build            # turbo: builds every package and app
pnpm test             # turbo: runs all unit tests
pnpm dev              # runs the web, api, indexer and keeper in watch mode
```

Run just the API + web:

```bash
pnpm --filter @perpetua/api dev      # http://localhost:8787
pnpm --filter @perpetua/web dev      # http://localhost:3000
```

The API runs without a database (in-memory store + a demo pool and wallet). Set `DATABASE_URL` to
switch to the Drizzle/Postgres store:

```bash
pnpm --filter @perpetua/api db:generate
```

## The program

`programs/perpetua_vault` — Anchor 0.31+/0.32. Program id:

```
3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit
```

Instructions: `init_config`, `create_vault`, `crank_claim`, `stake`, `unstake`, `unstake_no_claim`,
`harvest`.

Design rules:

- The program **never** removes liquidity, closes a position or changes a lock. The principal is
  unreachable by construction.
- `create_vault` only accepts positions with zero unlocked and zero vested liquidity and a positive
  permanent lock. Split a mixed position with DAMM v2 `split_position` first.
- Fees are credited by **balance diff** around the CPI, which handles Token-2022 transfer fees.
- **Claim-on-touch**: `stake` and `unstake` claim before touching accounting, which kills the
  JIT-staking sandwich. `unstake_no_claim` exists for the case where a fee mint blocks claims.

```bash
anchor build
anchor test                 # runs the Rust unit + LiteSVM suites
cargo test -p perpetua_vault --features no-entrypoint
```

## Status

| Component | State |
|---|---|
| `@perpetua/shared`, `@perpetua/valuation`, `@perpetua/sdk` | built + unit tested |
| `@perpetua/api`, `@perpetua/indexer`, `@perpetua/keeper` | built + unit tested |
| `@perpetua/web` | built with `next build` |
| `programs/perpetua_vault` | source complete; **compiles with the Solana/Anchor toolchain** (Rust is not installed in every dev box) |
| LiteSVM integration tests | present, require fetched mainnet binaries |

The verify-first list (account order of `claim_position_fee`, position lock byte offsets, DBC
migration shape, DLMM pool params) lives in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/VALUATION.md](docs/VALUATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/JUDGES.md](docs/JUDGES.md) — the 5-minute path
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — Meteora integration points and the verify list
- [docs/LEGAL_NOTE.md](docs/LEGAL_NOTE.md)

## License

MIT. Unaudited hackathon software — see the legal note.
