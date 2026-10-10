# Perpetua — the fee-rights exchange

> Turn the trading-fee stream of a **permanently locked Meteora DAMM v2 position** into a **priced,
> tradable, claimable asset**.

A permanently locked position is liquidity that can never be withdrawn — so the fees it earns keep
arriving. Perpetua turns that fee stream into **1,000,000 SPL fee shares**. The shares price like a
bond, trade on Meteora's DLMM, and pay out every time the pool is touched.

**Status:** 157 TypeScript tests · 26 Rust tests · `biome` clean · `tsc` clean · `next build` green. The
program is deployed on devnet at `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`.

Four moving parts:

- **Price the stream.** A decay-aware, discounted valuation model reads live on-chain fee history and
  outputs fair value, a bear/base/bull range, fair value per share, implied APR and payback.
- **Sell into a market.** A one-sided DLMM ask ladder, seeded around fair value, in place of an OTC
  spreadsheet.
- **Earn and exit safely.** Stake to earn, claim on touch. Every `stake` / `unstake` / `harvest`
  claims *before* it touches accounting, so there is no JIT-sandwich window — and exit is never gated.
- **Launch financeable.** A DBC preset that graduates to DAMM v2 with a permanently locked floor, so a
  launch produces something securitizable.

## Table of contents

- [How it works](#how-it-works) — the lifecycle, end to end
- [Feature status](#feature-status) — what is wired, stated plainly
- [Architecture](#architecture) · [Repository map](#repository-map)
- [Requirements](#requirements) · [Quickstart](#quickstart) — clone to running
- [Configuration](#configuration) — every environment variable
- [Using the app](#using-the-app) — every page
- [API reference](#api-reference) — every route
- [The valuation model](#the-valuation-model)
- [The on-chain program](#the-on-chain-program)
- [Testing](#testing) · [Deployment](#deployment)
- [Security model](#security-model) · [Known limitations](#known-limitations)
- [License](#license)

## How it works

```
   DBC launch            DAMM v2             create_vault          DLMM one-sided          stake /
   (financeable   →   graduates, mints   →   takes the locked   →   ask ladder seeded   →   harvest;
    preset)             locked NFTs          position NFT,          around fair value       crank_claim
                                             mints 1,000,000                                pulls fees in
                                             fee shares
```

1. **Launch.** A creator deploys a token through Meteora's Dynamic Bonding Curve using Perpetua's
   *financeable* preset: quote-only fees, non-compounding, with a permanently locked liquidity floor.
2. **Graduate.** The curve migrates to DAMM v2, which mints the creator/partner position NFTs. The
   permanently locked one is the asset Perpetua can securitize.
3. **Securitize.** `create_vault` takes custody of the locked position's NFT account and mints
   1,000,000 SPL fee shares to the creator. The program can never remove liquidity or close the
   position, so the principal is unreachable by construction.
4. **Sell.** The shares are listed on a `pFEE/quote` DLMM pair as a one-sided ask ladder priced around
   fair value. Buyers trade against a market.
5. **Earn.** Holders stake shares. `stake`, `unstake` and `harvest` each CPI-claim the position's fees
   first, credit them by balance diff into a fee-per-share accumulator, and pay out on touch.

## Feature status

Stated plainly, because a reviewer will check.

| Feature | Status |
|---|---|
| Decay-aware valuation engine | **Live.** Pure TypeScript; `/v1/pools/:pool/yield`, `/v1/pools/:pool/series`, `/v1/valuation/:position`. Backtested on synthetic pools. |
| Stake-to-earn + claim-on-touch | **Live.** On-chain (`stake`/`unstake`/`harvest`/`crank_claim`) and wired to the vault page. |
| Automated DLMM ask ladder | **Wired.** `POST /v1/tx/open-sale` creates the pair, `POST /v1/tx/seed-ladder` seeds the ladder; the vault page drives both. The bin-id placement is the one number to confirm on a devnet run. |
| Financeable DBC launch preset | **Wired.** `POST /v1/tx/create-mint` + `POST /v1/tx/launch` deploy token → config → pool; the launch page drives both. |
| Position vaults, pricing, launch | **Live** on devnet. |

## Architecture

```
   ┌─────────────────────── Web · Next.js (:3000) ────────────────────────┐
   │  /  ·  /terminal  ·  /launch  ·  /securitize  ·  /vault/[id]  ·  /kpi │
   └───────────▲──────────────────────────────────────────────▲──────────┘
               │ REST + SSE                                    │ pure-TS pricing
   ┌───────────┴───────────────┐                  ┌────────────┴───────────┐
   │  API · Hono (:8787/:8788) │                  │  @perpetua/valuation   │
   │  valuations · positions   │                  │  decay · discount · PV │
   │  unsigned tx builders     │                  └────────────────────────┘
   └───────┬───────────┬───────┘
           │           │
     Meteora data   Solana RPC            ┌─────────────────────────────┐
     API (fees)     (positions,           │  perpetua_vault (Anchor)    │
                     tx build)            │  vault · stake · harvest    │
                                          └─────────────────────────────┘
```

The **API never holds a key.** Every `/v1/tx/*` route returns an unsigned, base64-encoded transaction;
the browser wallet signs it. The only extra signatures a flow needs (a share mint, a DLMM position
account, a DBC config) are generated *in the browser* and partial-signed there.

## Repository map

```
apps/
  web/         Next.js 16 UI — the six pages above.
  api/         Hono API: valuations, positions, and the unsigned transaction builders.
  indexer/     Watches vault events and writes vault/stat rows.
  keeper/      Cranks `crank_claim` on a interval when a vault has fees to pull.
packages/
  shared/      Types, program ids, network resolution, resilient RPC failover.
  valuation/   The pricing model. Pure TypeScript, zero chain dependency.
  sdk/         Everything that touches the chain or the Meteora SDKs.
  stock-kit/   Closed-market fee curve + anchored start price (stock-quoted launches).
  mcp/         An MCP server exposing Perpetua to other AI agents.
programs/
  perpetua_vault/   The Anchor program (9 instructions).
netlify/
  api/         The API and MCP entrypoints, prebundled into one self-contained function file.
  functions/   The function Netlify serves at /api/* (REST and MCP on the same origin).
```

### What each SDK module is

| Module | Responsibility |
|---|---|
| `data/meteoraDataApi` | Fee history from Meteora's DAMM v2 data API — the only source of fee history. |
| `adapters/dammV2` | Reads DAMM v2 positions, lock buckets, and derives the `claim_position_fee` account set. |
| `adapters/dlmm` | Builds the `pFEE/quote` pair (`createLbPair2`, addressed with `deriveLbPair2`) and the one-sided ask ladder. |
| `adapters/dbc` | Builds the financeable DBC `createConfigAndPool`. |
| `sale/ladder` | The front-weighted, geometric ask-ladder algorithm (pure). |
| `positions/eligibility` | `unlocked == 0 && vested == 0 && permanentLocked > 0`, decided once and echoed to the UI. |
| `vault/client` | A typed client over the program IDL, plus instruction builders. |

## Requirements

- **Node 22+** and **pnpm 9.15+** (the repo pins `pnpm@9.15.9`).
- For the on-chain program: **Rust** with the Solana SBF toolchain and **Anchor 0.32**.

## Quickstart

```bash
pnpm install

# Development — web on :3000, devnet API on :8787
pnpm --filter @perpetua/api dev     # terminal A
pnpm --filter @perpetua/web dev     # terminal B

# Or run everything the API needs at once
pnpm dev                            # web, api, indexer, keeper
```

To run a **mainnet** API alongside the devnet one:

```bash
CLUSTER=mainnet-beta PORT=8788 pnpm --filter @perpetua/api dev
```

Then point the UI at either cluster without rebuilding — the API base is a runtime switch:

```
http://localhost:3000/?api=http://localhost:8788    # mainnet API
http://localhost:3000/?api=http://localhost:8787    # back to devnet
```

### Production build locally

```bash
pnpm build
node apps/api/dist/server.js                                        # devnet API on :8787
CLUSTER=mainnet-beta PORT=8788 node apps/api/dist/server.js         # mainnet API on :8788
pnpm --filter @perpetua/web start                                   # web on :3000
```

Verify a checkout:

```bash
pnpm test && pnpm lint && pnpm typecheck
```

## Configuration

Copy [.env.example](.env.example) to `.env`. Every value has a working default for local use.

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `8787` | api |
| `CLUSTER` | `devnet` | api |
| `RPC_URL` | the cluster RPC | api, indexer, keeper |
| `RPC_URLS` | the cluster's public RPC | api, indexer, keeper — comma-separated; tried in order on 429/408/5xx |
| `METEORA_DATA_API` | `https://damm-v2.datapi.meteora.ag` | api, indexer |
| `DATABASE_URL` | empty → in-memory | api |
| `CORS_ORIGINS` | local web origins in dev | api |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8787` | web |
| `NEXT_PUBLIC_RPC_URL` | devnet RPC | web — the RPC the browser signs against, and the cluster vault, position and transaction links open on. Pool links always open on Solscan mainnet, because fee history only exists there. |
| `KEYPAIR` | — | keeper, SDK ops scripts |
| `CRANK_THRESHOLD_USD` / `CRANK_INTERVAL_MS` | `0` / `120000` | keeper |
| `PERPETUA_API_URL` | `https://perpetua-meteora.netlify.app/api` | mcp (stdio only; the hosted MCP endpoint needs none) |

## Using the app

| Page | What it does | Wallet? |
|---|---|---|
| **Vaults** `/` | Landing page. Reads `/v1/stats` and lists every indexed vault. | no |
| **Pricing** `/terminal` | Paste any DAMM v2 pool; get fair value, a bear/base/bull range, implied APR, payback, the trailing fee chart and the ask ladder the sale would use. | no |
| **Create shares** `/securitize` | Scans a wallet for locked positions, shows the eligibility verdict and the valuation preview, then signs `create_vault`. | yes |
| **Launch plan** `/launch` | Sets the financeable DBC preset and validates it, then deploys token → config → pool. | yes |
| **Vault** `/vault/[id]` | Position proof, totals, event feed, and the four holder actions — stake, unstake, harvest, crank — plus **Sell shares** (create the market, list the ladder). | yes |
| **Stats** `/kpi` | Vaults, positions securitized, fees distributed, holders, trading volume. | no |
| **Use with AI** `/mcp` | The one address that connects Claude, Cursor, VS Code or any other assistant to Perpetua. The same tools answer on `/api/mcp`. | no |

## Live

Everything below is deployed and answering right now.

| What | Where |
|---|---|
| App | <https://perpetua-meteora.netlify.app> |
| API health | <https://perpetua-meteora.netlify.app/api/health> |
| MCP, for AI assistants | <https://perpetua-meteora.netlify.app/api/mcp> |
| Vault program (devnet, deployed + upgradeable) | <https://solscan.io/account/G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2?cluster=devnet> |
| DAMM v2 program the vault custodies from | <https://solscan.io/account/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG> |
| DLMM program the share ladder prices into | <https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo> |

### Devnet securitization events

`create_vault` is the instruction that turns a locked DAMM v2 position into shares. These are the
transactions that actually did it on devnet — read straight from the chain, each one confirmed and
carrying `Instruction: CreateVault` in its logs:

| Transaction | Vault it created |
|---|---|
| <https://solscan.io/tx/2GVp7qEasEckFTcCNWQvENGvUaa4PHRnoBcpaadaW9iP1eXLbHLnGZyKERi7EhiDd6ArZkcTBBSb2V9hC5WjpiH7?cluster=devnet> | <https://solscan.io/account/9F46yfJ8Sxs8ceR2MP1C8YARSdZ3wNPWBHMwB7nbrBSA?cluster=devnet> |
| <https://solscan.io/tx/JoSsNrhBmbergmhc9YCe8nD2ktcrWCK3HQc5v4oTJej1sXH5CT5tRg5XLGzgH7NjvXbxa1YGndVK7YoxxgUQscj?cluster=devnet> | <https://solscan.io/account/FN2KbJTWjq8Ry3sTjomBQg9rqLfo6ReTSzjgrPV4jpgR?cluster=devnet> |
| <https://solscan.io/tx/55revJozke4QmDuMXAKLHDHZZcMYBXY4VyMainbhAmghvSMTxWTn3ebz9g46NV2CuYK99PMy3VXsUBGwFwY8w3Xs?cluster=devnet> | <https://solscan.io/account/FTQcAaBm5toHdYkueAHteYkmYqTVyj7H3hdvbbE3jPLZ?cluster=devnet> |
| <https://solscan.io/tx/565VN1CWurUdSLvRMVYPAhYCx28Y1GSxzUFEqoTYbn1Cg5CLUrCsyecoSJxK6TxvRasancazMm2jwqLmu9CQPxed?cluster=devnet> | <https://solscan.io/account/GSstL6dn4TtjMT2FZf7ENddDwuC4B2dwc1KtHaP2SAWK?cluster=devnet> |
| <https://solscan.io/tx/39LHDreShZmueCth18r49sS81nBYVRm88F2RULwgmbkTqwoEtjhpGU8qPxXVW48DyNJ88DnSkMe5HpAvB59yvY4y?cluster=devnet> | <https://solscan.io/account/2A5YvCy74KQPNVS16bhRJjgRPmHn6bm6fTfjpoPV5ySK?cluster=devnet> |
| <https://solscan.io/tx/3D6W5ZokB1MLcrHUVsKEjk3aN4kR2RPfD93aVbJHW75h9euwE6LgQYjaxvFMj5wZRp52opaVLbHYF9a5G1rrL387?cluster=devnet> | <https://solscan.io/account/5KCYoC2wriNqmVf2gfa8Ng3LXWrShHn9N1fPZd4gWq1b?cluster=devnet> |
| <https://solscan.io/tx/2fAhHErpGuxCRf2r7SUJrqSD5cCVWpxJocgJfFc9nGrTvkVd7M1M1GihC9nGNi8upZtDNXe7P8BT3yVTm9SGZv5Y?cluster=devnet> | <https://solscan.io/account/7R9DPunKZVjgYWbyAFxT6uPYmAAuFA7S89ReZQFbhjwM?cluster=devnet> |

Ten vault accounts live on devnet in total. The hosted API keeps its vault list in memory and nothing
indexes devnet into it, so the Vaults page starts empty — the chain is where the real ones are.

### The whole lifecycle, run end to end on devnet

`pnpm --filter @perpetua/sdk ops:devnet-e2e` does the lot: it mints two tokens, opens a DAMM v2 pool,
locks a position forever, securitizes it into a vault, swaps so the position earns real fees, then
cranks, stakes and harvests. A full run, confirmed on-chain:

| Step | Result |
|---|---|
| Permanently locked position | `CK1YFDFHbx2mEqU5To6JH6T5wzvwBQqzYogMVcbYBNPL` in pool `D51o2cwMxPJZjUxCJqBwxomioQc53S7ucXjhRzXbFa5C` |
| Vault created (shares issued) | `DA2TEH6F8tRdfMMc9gj3cyMcKv5A9EezBwJpGk1ndbvu` |
| Share mint | `8u7GWxH5C4nA5Lqo9mGaB4ZRDUogXo3krcVvCL8LmGpg` |
| Stake | 1,000,000,000,000 base units — the entire supply |
| Crank claim | banked as carry while unstaked, then `claimed_b=308263` released to the staker |
| Harvest | paid the staker out |

So creating shares, staking them, cranking the claim and harvesting all work against the real program,
not a mock.

### Pools to paste into Pricing

Real DAMM v2 pools, taken from Meteora's data API. The first seven answered in the hosted app when this
list was written (`GET /api/v1/pools/<address>/yield?days=30`); the last three exist but have not
completed a day of fee history yet, so the app answers **422** on purpose instead of printing a zero.

| Pool address | Pair | TVL | Prices today |
|---|---|---|---|
| `BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1` | MET-USDC | $3.45M | yes — $84k fair value |
| `8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie` | SOL-USDC | $1.61M | yes — $7.4k |
| `9B8xXGabWeEfCLzwHAwwbjZjQamiFsh7WC8Y5bkvPbqP` | RIV-SOL | $414k | yes — $17k |
| `BJsSymifLkwUq8r3KMSiFH6t5JbLLBd1VJDgzD7qYNxF` | BELIEVE-SOL | $165k | yes — $100k |
| `4xp7kN4nVt19caq4kM629vL8vJEqpSFVdZAh27wvYPh8` | BORDR-SOL | $153k | yes — $539k |
| `EkPyMqfSQJMQcnQ3cCwxg3Xszj5crzSFTC8g2HvGhXk8` | BORDR-JupUSD | $107k | yes — $118k |
| `F3XBLXejAn8YBS3qQao4u4fiijH4eaiHw7F68ovLz5Fq` | PLAY-USDC | $48k | yes — $298k |
| `ARzhzEU1etsAArT1iX9t5zxNwYQMRhaYrvGuqxUMHCjH` | —USDC | $123k | not yet (422) |
| `8FoQfA6pYc7Mgbab3ijTtWhq692p85enWRSTV6y6VVJW` | JPAD-USDC | $74k | not yet (422) |
| `GrTParBtzTwXP2yPa16hSySTyvcskPs5wHm2f9S7jjWt` | WOSE-SOL | $16k | not yet (422) |

The same addresses work in `/vault/[id]` and as a quote-token source on `/launch`, since every page
prices through the same API.

Two of them show what **Risk flags** looks like when there is something to say, which is how you can
tell the strip is reading the pool rather than always shrugging:

| Pool | Why it is flagged |
|---|---|
| `F3XBLXejAn8YBS3qQao4u4fiijH4eaiHw7F68ovLz5Fq` (PLAY-USDC) | one day of fee history and $48k of liquidity → `pool_too_young`, `low_liquidity` |
| `7r8BCeWs7sPXJG6PywAAo47xXnNaF8Cid98ZmKRWRU1Q` | three days of history and $16k of liquidity → the same two |

The flags are computed from the pool's own history and liquidity — the older, deeper pools above
genuinely have nothing to flag, so the strip stays quiet for them on purpose.

### Wallets

`Create shares` signs with the wallet you connect, so a wallet is something you hold a key for — not an
address you paste. The devnet wallet this project securitized with is
`8iY6CPnv5TPLkdykzPxWB9Sm9Z4dsNfUAzXL3mSMMHa4`: it signed every `create_vault` above and still owns
the locked positions behind those vaults. Its keypair is `keys/perpetua_vault-devnet.json`, which
`.gitignore` keeps out of the repo — it is a devnet key with nothing behind it, and it is the fastest
way to walk the whole flow yourself.

The vault accounts above are real on-chain records, but be aware of where the app reads them from: the
Vault page goes through the hosted API's index, which is an in-memory store with no indexer feeding it,
so `/vault/<address>` answers "We couldn't find that vault" until an indexer is wired up. Reading a
vault straight from the chain is what those Solscan links are for. The wallet scan on **Create shares**
does read the chain, so pasting the devnet wallet above finds its locked position.



## API reference

Every route is zod-validated; a bad value returns **400** with the issue list.

### MCP

`POST /mcp` — `https://perpetua-meteora.netlify.app/api/mcp` on the hosted deploy — is a Model
Context Protocol endpoint on the same origin as everything else, so an assistant needs nothing
installed but the address. It runs stateless Streamable HTTP and answers JSON: there is no session to
keep, and a `GET` that does not ask for an event stream is refused. The bundled `@perpetua/mcp`
package speaks the same tools over stdio for local use.

**Nineteen tools, which is everything this site can do.** Reading: `where_is_address` (which cluster
owns an address and what it is), `list_clusters`, `price_position`, `get_report`, `get_pool_series`,
`find_positions` (a wallet's locked positions, with the securitization verdict), `list_vaults`,
`simulate_preset`, `get_sale_plan`, `list_sale_presets`. Building, all unsigned and all returned as
base64 for the caller's wallet to sign: `build_create_mint_tx`, `build_launch_tx`,
`build_securitize_tx`, `build_stake_tx`, `build_unstake_tx`, `build_harvest_tx`, `build_crank_tx`,
`build_open_sale_tx`, `build_seed_ladder_tx`. Each takes an optional `cluster`, so an assistant can
price a mainnet pool and then build a devnet transaction, or launch on either network, without ever
being handed a key.

### Read routes

| Route | Query | Returns |
|---|---|---|
| `GET /health` | | `{ ok: true }` |
| `GET /v1/stats` | | vaults, positions securitized, fees distributed, holders, volume |
| `GET /v1/vaults` · `/v1/vaults/:id` | | every indexed vault, or one (404 if unknown) |
| `GET /v1/vaults/:id/events` | `limit` 1–500 | decoded Anchor events |
| `GET /v1/positions/:wallet` | | securitizable positions |
| `GET /v1/positions/:wallet/onchain` | | position detail read from DAMM v2 + `eligibility` |
| `GET /v1/valuation/:position` | `pool`, `liquidityShare`, `protocolFeeBps`, `discountRate`, `horizonDays`, `days` | valuation for a position |
| `GET /v1/pools/:pool/yield` | as above | valuation for a whole pool |
| `GET /v1/pools/:pool/series` | `days` 7–30 | the raw daily fee series |
| `GET /v1/sale/plan` | `fairValuePerShareUsd`, `totalShares`, `saleFraction`, `lowerPct`, `upperPct`, `binStep`, `binCount` | the DLMM ask ladder |
| `GET /v1/sale/presets` | | DLMM presets (bin step + base factor) on this cluster |
| `GET /v1/dbc/preset` | `creatorTradingFeePct`, `creatorLiquidityPct`, `partnerLiquidityPct`, `lockedPct` | the financeable preset and its validation |
| `GET /v1/stream` | | Server-Sent Events feed of vault events |

### Transaction routes

Each returns an **unsigned** transaction for the caller's wallet to sign, and **503** when the API has
no RPC connection. The API never holds a key.

| Route | Body |
|---|---|
| `POST /v1/tx/create-vault` | `creator`, `pool`, `position`, `positionNftMint`, `positionNftAccount`, `positionNftProgram`, `tokenAMint`, `tokenBMint`, `tokenAProgram`, `tokenBProgram`, `shareMint` |
| `POST /v1/tx/stake` · `/v1/tx/unstake` | `owner`, `vault`, `amount` (base units, decimal string) |
| `POST /v1/tx/harvest` · `/v1/tx/crank-claim` | `owner`, `vault` |
| `POST /v1/tx/create-mint` | `payer`, `mint`, `decimals` |
| `POST /v1/tx/launch` | `creator`, `config`, `baseMint`, `quoteMint`, `feeClaimer`, `leftoverReceiver`, `name`, `symbol`, `uri`, `totalTokenSupply`, `creatorTradingFeePercentage`, `creatorLiquidityPercentage`, `partnerLiquidityPercentage`, `creatorPermanentLockedLiquidityPercentage`, `partnerPermanentLockedLiquidityPercentage` |
| `POST /v1/tx/open-sale` | `owner`, `shareMint`, `quoteMint`, `presetParameter`, `binStep`, `baseFactor`, `initialPrice` |
| `POST /v1/tx/seed-ladder` | `owner`, `poolAddress`, `shareMint`, `quoteMint`, `positionPubKey`, `binStep`, `plan` |

```bash
POOL=<damm-v2-pool-address>
curl -s "localhost:8787/v1/pools/$POOL/yield" | jq .valuation.fairValuePerShareUsd
curl -s "localhost:8787/v1/sale/plan?fairValuePerShareUsd=1" | jq .plan.weightedAveragePriceUsd
```

## Try it, step by step

### No wallet needed — start here

1. Open **<https://perpetua-meteora.netlify.app/terminal>**.
2. Paste a mainnet pool: `BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1` (MET-USDC). You get fair value, a
   bear/base/bull range, implied APR, the scenario table, the trailing fee chart and the ask ladder.
   The link under the address opens Solscan on **mainnet**.
3. Paste `F3XBLXejAn8YBS3qQao4u4fiijH4eaiHw7F68ovLz5Fq` (PLAY-USDC) and the **Risk flags** strip lights
   up with `pool too young` and `low liquidity`.
4. Paste `8FoQfA6pYc7Mgbab3ijTtWhq692p85enWRSTV6y6VVJW` (JPAD-USDC) — a pool with no complete day yet —
   and it says so instead of pretending the address is wrong.
5. Paste `BBKD4ymn5JRzugqF4whh4UWXsvfQWbF2H1rdpBhfFUuC` (a **devnet** pool) and it tells you fee
   history is only indexed on mainnet, with a devnet Solscan link.

### On devnet — the whole lifecycle works

6. Switch your wallet to devnet. Phantom: **Settings → Developer Settings → Change Network → Devnet**.
   Solflare: **Settings → Network**. You need a little devnet SOL — <https://faucet.solana.com> gives
   it away, and it is free.
7. Go to **Create shares**. Paste `8iY6CPnv5TPLkdykzPxWB9Sm9Z4dsNfUAzXL3mSMMHa4` in the "or paste a
   wallet address" box (or connect that wallet). The page scans the chain, shows the permanently
   locked position, its unlocked / vested / permanent-lock figures, an eligibility verdict, and the
   valuation of the pool behind it.
8. Connect a devnet wallet that owns a locked DAMM v2 position and press **Create shares**, then sign.
   You get a vault and 1,000,000 shares, with the share mint and the transaction as Solscan links.
9. Open the vault: `https://perpetua-meteora.netlify.app/vault/DA2TEH6F8tRdfMMc9gj3cyMcKv5A9EezBwJpGk1ndbvu`
   — that is a vault created by this repo's own end-to-end run. On it you can **stake**, **unstake**,
   **harvest fees** and **crank claim**, and the same page holds **Sell shares** to open a market and
   post an ask ladder.
10. Watch the activity feed on that page — every action you take appears with its own Solscan link.

### On mainnet — launching works; shares wait for the program

11. Keep your wallet on mainnet and open **Launch plan**. Choose **Mainnet**, fill in name, ticker,
    description and an image link, then **Create the token** and **Deploy the launch**, signing both.
    That mints your token and opens its bonding-curve pool on mainnet — no metadata file to host,
    because the metadata link is built and served by this app.
12. The app tells you the one thing mainnet cannot do yet: **Create shares, stake, harvest, crank and
    sell shares need the vault program, which is deployed on devnet only.** The Create shares page
    spells this out for a mainnet wallet, disables the button, and points you at what does work.

### With an AI assistant

13. Open **Use with AI** (`/mcp`) and paste `https://perpetua-meteora.netlify.app/api/mcp` into Claude,
    Cursor, VS Code or anything else that speaks MCP. Nineteen tools are available — the ten reading
    ones and the nine transaction builders — each taking an optional `cluster`, so an assistant can
    price a mainnet pool and then build a devnet transaction without ever being handed a key.


## The valuation model

`@perpetua/valuation` is pure TypeScript with no chain dependency. Given a trailing daily fee series:

1. **Fit a decay rate.** Weighted least squares on `ln(fee_t) = a + b·t`, so `λ = −b`, clamped to
   `[−0.02, 0.15]` per day so a noisy series cannot project an absurd number. Zero and near-zero days
   are floored at half the smallest positive fee before the log.
2. **Shrink toward a prior.** `blendDecay(fitted, cohortPriorFor(poolAgeDays))` pulls the estimate
   toward a prior that is harsher for young pools, where the early fee spike is hype rather than
   earnings. The prior bites hardest exactly where the data is thinnest.
3. **Project forward.** `F_t = lastFee · e^(−λt)`, floored.
4. **Discount it.** `PV = Σ_t share · F_t · (1 − protocolFeeBps/10000) / (1 + r)^(t/365)`.

Outputs: fair value, a bear/base/bull range, fair value **per share**, implied APR at fair value,
payback days per scenario, and risk flags (`pausable_mint`, `permanent_delegate`, `pool_too_young`,
`volume_concentration`, `low_liquidity`, `compounding_mode`).

**Calibration.** `pnpm --filter @perpetua/valuation backtest` runs the model on synthetic pools with a
known decay rate: **mean absolute error ≈ 21.7%**, calibration (mean predicted / mean realized) ≈
**1.15**. Real series carry regime changes the synthetic set does not model, so treat that as an upper
bound on accuracy.

## The on-chain program

`programs/perpetua_vault`, Anchor 0.32, nine instructions:

`init_config` · `create_vault` · `crank_claim` · `stake` · `unstake` · `unstake_no_claim` · `harvest` ·
`set_paused` · `set_risk_flags`

Deployed on devnet at `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`.

**Fee accounting.** Each claim CPIs `claim_position_fee`, then credits the **balance diff** of the
vault's token A/B accounts — which handles Token-2022 transfer fees automatically. The protocol skim is
applied, and the net is added to a `u128` fee-per-share accumulator scaled by `1e18`. A staker's
`pending` is `stake.amount · (acc − debt) / 1e18`. Fees that arrive while nobody is staked are banked as
**carry** and released to the next stakers.

**Claim-on-touch.** `stake`, `unstake` and `harvest` all call `touch()` — the claim — *before* they
mutate accounting, so a newcomer cannot join at the instant fees land. `unstake_no_claim` exists so a
paused or blocked fee mint can never trap a holder.

## Testing

```bash
pnpm test                                        # 157 TypeScript tests
pnpm lint && pnpm typecheck                      # biome + tsc
cargo test --workspace                           # the Rust suites
cargo clippy --workspace --all-targets -- -D warnings
pnpm program:check                               # Anchor.toml vs declare_id!
```

The TypeScript suites cover the pricing model, the ladder and bin maths, the SDK adapters (against a
mocked HTTP layer), the API routes and stores, the indexer mapping and the keeper decision logic. The
Rust suites cover fee-per-share accrual, carry banking, fee conservation, the protocol-fee split, the
Token-2022 extension parser, and an end-to-end LiteSVM flow (`init_config → create_vault → crank_claim
→ harvest`) against a mock DAMM v2.

> Tests sit next to the code they cover (`**/test/`, `**/*.test.ts`). They are kept out of version
> control by `.gitignore`, so a clone ships the app without them.

## Deployment

The web app deploys to Netlify; the API is a **Netlify Function** at `/api/*`, so the UI calls it
same-origin — no CORS, no second host.

```bash
netlify login
netlify deploy --build --prod
```

`netlify.toml` builds the monorepo (`pnpm install --frozen-lockfile && pnpm build`), publishes
`apps/web/.next` through `@netlify/plugin-nextjs`, and sets `NEXT_PUBLIC_API_URL=/api` for the web
build. It then runs `pnpm build:fn`, which bundles `netlify/api/handler.ts` — the API and every
dependency it pulls in — into `netlify/api/api.bundle.cjs`. The function at
`netlify/functions/api.ts` re-exports that bundle, and `netlify.toml` rewrites `/api/*` onto it.

The API is prebundled because Netlify's own bundler cannot ship it as-is. Its native modules plugin
marks every package with a native binding as external and then leaves those packages out of the
function archive, so the function dies at load with `Cannot find module 'bigint-buffer'` —
`@solana/buffer-layout-utils` requires it eagerly. The prebundled file inlines everything, which
leaves Node builtins as its only `require()` calls. The handler is also **Functions v1** on purpose:
v2 forces Node File Trace, which cannot follow the bare `@perpetua/*` specifiers that the compiled
packages emit, because pnpm does not link workspace packages into the root `node_modules`.

The API picks its cluster from `CLUSTER` (default `devnet`); set it in the Netlify UI to point the
hosted API at mainnet. The hosted API uses an in-memory store, so the Vaults list is empty until an
indexer feeds it.

## Security model

The vault takes custody of a **position NFT account, not of funds.** After `create_vault` the vault PDA
owns the NFT account, and the fee stream can only be claimed and split by the program. There is **no
instruction that removes liquidity, closes the position or changes a lock** — the principal is
unreachable by construction.

| Threat | Mitigation |
|---|---|
| Admin drains the vault | The admin can only set `protocol_fee_bps` at init and re-settle `risk_flags`. There is no path to the NFT. |
| Admin traps holders | `set_paused` gates **entry only** (`create_vault`, `stake`). Every exit is never gated. |
| JIT-staking sandwich | `stake`/`unstake` claim before touching accounting, in the same transaction. |
| Token-2022 transfer fees break accounting | Fees are credited by balance diff around the CPI. |
| A paused fee mint bricks stakers | `unstake_no_claim` exits without the claim CPI. |
| Pool or position substitution | The vault is keyed by position; `has_one = pool` pins the pool; `share_mint` is pinned with `address =`. |
| cp-amm program substitution | `CP_AMM_PROGRAM_ID` is asserted on every account struct that receives it. |
| A `TransferHook` fee mint | `create_vault` walks the Token-2022 extension TLV and refuses the mint. |

## Known limitations

Stated plainly, because a reviewer will find them anyway.

- **The program is unaudited.** Do not put more at risk than you can lose.
- **The ladder's bin-id placement** is the one number to confirm on a devnet run against a live pair.
- **Only fully permanently locked positions are accepted.** Split a mixed position with DAMM v2
  `split_position` first.
- **The API has no authentication, rate limiting or webhooks.** CORS is same-origin in production.
- **The indexer is not deployed**, so a hosted API shows no vaults until one is.
- **`init_config` wires `treasury` to `admin`.** A real treasury wants a `set_treasury` first.

## License

MIT.



