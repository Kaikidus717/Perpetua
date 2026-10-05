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
packages/valuation   decay model, scenarios, risk flags, sessions, compounding, backtest
packages/sdk         on-chain client, ladder + preset + bid builders, ports
packages/stock-kit   closed-market fee curve, anchored start price
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
G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2
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

Everything below is verified by running it, not by inspection.

| Component | State |
|---|---|
| `programs/perpetua_vault` | `cargo check` clean; `cargo test -p perpetua_vault` → **7/7 pass** (accrual, carry, protocol fee, conservation) |
| Position-lock offsets | verified against **11 live on-chain DAMM v2 positions**, one of them permanently locked |
| `@perpetua/shared`, `@perpetua/valuation`, `@perpetua/sdk` | built + unit tested |
| `@perpetua/api`, `@perpetua/indexer`, `@perpetua/keeper` | built + unit tested; API serves every route at runtime |
| `@perpetua/web` | `next build` green, 7 routes; the securitize and vault pages sign with a connected wallet |
| `@perpetua/mcp` | MCP server for other AI agents; 30 tests including a real MCP `Client` over the in-memory transport |
| Meteora SDKs | `@meteora-ag/cp-amm-sdk`, `@meteora-ag/dlmm`, `@meteora-ag/dynamic-bonding-curve-sdk` wired through real adapters |
| LiteSVM suite | in `tests/litesvm`; builds the program artifact when `cargo build-sbf` is available and skips cleanly otherwise |

**The whole thing targets devnet.** `resolveNetwork()` defaults to devnet and Meteora uses the same
program IDs on every cluster, so the flow runs without real funds. See
[docs/DEVNET.md](docs/DEVNET.md).

```bash
pnpm --filter @perpetua/sdk ops:extract-idls      # dump the Meteora IDLs we build against
pnpm --filter @perpetua/sdk ops:verify-offsets    # check our byte offsets against live positions
pnpm ops:faucet -- --dry-run                      # how much devnet SOL the deploy still needs
KEYPAIR=~/.config/solana/devnet.json pnpm --filter @perpetua/sdk ops:devnet-e2e
```

## MCP

`@perpetua/mcp` exposes Perpetua to other AI agents as an MCP server, so they can price positions,
read Report Cards and build unsigned transactions without bespoke glue. See
[packages/mcp/README.md](packages/mcp/README.md).

```bash
PERPETUA_API_URL=http://localhost:8787 pnpm mcp
```

## Docs

- [docs/DEVNET.md](docs/DEVNET.md) — the devnet path, start here
- [packages/mcp/README.md](packages/mcp/README.md) — the MCP server for other agents
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/VALUATION.md](docs/VALUATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/JUDGES.md](docs/JUDGES.md) — the 5-minute path
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — what is verified against the shipped IDLs, and what is left
- [docs/LEGAL_NOTE.md](docs/LEGAL_NOTE.md)

## License

MIT. Unaudited hackathon software — see the legal note.
