# Perpetua

**The fee-rights exchange for Meteora.** I built Perpetua to turn the trading-fee stream of a permanently locked DAMM v2 position into a priced, tradable, claimable asset.

Every DBC launch that graduates into DAMM v2 leaves behind liquidity that can never be withdrawn and earns fees forever. Today that income is stuck in one wallet, and nobody can price it, sell it or buy into it. Perpetua fixes that end to end:

- **Price it.** A decay-aware valuation model reads live on-chain fee history and returns fair value, a bear/base/bull range and risk flags.
- **Securitize it.** An Anchor program takes custody of the locked position's NFT account (never the funds) and mints 1,000,000 fee shares. It has no instruction that can touch the principal.
- **Sell it.** The shares list on a DLMM pair as a one-sided ask ladder seeded around fair value.
- **Earn from it.** Holders stake shares and harvest real token A/B fees. Claim-on-touch accounting closes the JIT-staking window.
- **Automate it.** A hosted MCP server with 20 tools lets any AI assistant price, simulate and build every transaction in the flow without ever holding a key.

It works for any asset that trades on DAMM v2, so it does not depend on the current meme-stock meta.

Built for the Meteora DBC track of Crypto World's Fair.

## Links

| Resource | Location |
|---|---|
| Hosted app | https://perpetua-meteora.netlify.app |
| REST API (same origin) | https://perpetua-meteora.netlify.app/api |
| MCP endpoint | https://perpetua-meteora.netlify.app/api/mcp |
| MCP setup page | https://perpetua-meteora.netlify.app/mcp |
| Vault program (devnet) | [`G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2`](https://solscan.io/account/G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2?cluster=devnet) |
| Meteora DAMM v2 program | [`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`](https://solscan.io/account/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG) |
| Meteora DLMM program | [`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`](https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo) |

## Judge fast path

Steps 1 to 5 run against the hosted deployment with no wallet and no install.

| Step | Action | Expected result |
|---|---|---|
| 1 | `curl -s https://perpetua-meteora.netlify.app/api/health` | `{"ok":true}` |
| 2 | Open [/terminal](https://perpetua-meteora.netlify.app/terminal) and paste `BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1` (MET-USDC) | Fair value, bear/base/bull range, fair value per share, trailing fee chart, and the DLMM ask ladder a sale would post |
| 3 | Paste `F3XBLXejAn8YBS3qQao4u4fiijH4eaiHw7F68ovLz5Fq` (PLAY-USDC) | The risk strip shows `pool_too_young` and `low_liquidity`; the pool in step 2 shows none |
| 4 | Connect an AI assistant to the [MCP endpoint](#mcp-server-for-ai-assistants) and ask it to price a pool | The assistant calls `price_position` and returns the same numbers the app shows |
| 5 | Open the [securitization transactions](#securitization-transactions-devnet) on Solscan | Seven confirmed `CreateVault` instructions on devnet |
| 6 | Run [`ops:devnet-e2e`](#full-lifecycle-one-command) with any funded devnet keypair | Mint, pool, permanent lock, securitize, swap, crank, stake, harvest, all confirmed |
| 7 | Open [/launch](https://perpetua-meteora.netlify.app/launch), choose Mainnet, and deploy a token through the financeable DBC preset | A mainnet token and bonding-curve pool, signed by your own wallet |

Real response from the hosted API, captured 2026-10-11:

```
GET /api/v1/pools/BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1/yield?days=30
{
  "valuation": {
    "fairValueUsd": 60031.58,
    "fairValueRangeUsd": { "low": 36939.97, "base": 60031.58, "high": 107172.64 },
    "fairValuePerShareUsd": 0.0600,
    "riskFlags": []
  }
}
```

## Why this is not Dynamic Fee Sharing

Meteora's Dynamic Fee Sharing lets a PDA fee vault claim a DAMM v2 position's fees and split them among a fixed set of recipients. I built on the same idea and added the parts that turn a split into a market:

| Dynamic Fee Sharing | Perpetua |
|---|---|
| Recipients and shares are set up front | Any number of holders, because the claim is a transferable SPL token |
| Splits fees | Prices the stream, so a buyer knows what a share is worth |
| No sale mechanism | Sells the shares on a DLMM ask ladder |
| Not designed to be driven by an assistant | 20 MCP tools that return unsigned transactions |

## MCP server for AI assistants

I host a Model Context Protocol server. An assistant needs only the address: no key, no install, no account.

```
https://perpetua-meteora.netlify.app/api/mcp
```

The endpoint runs stateless Streamable HTTP and answers JSON. It lives on the same origin as the app and reads from the same API, so the numbers an assistant reports are the numbers a user sees. A setup page with copy buttons is at [/mcp](https://perpetua-meteora.netlify.app/mcp).

### Connect a client

| Client | Setup |
|---|---|
| Claude | Settings, Connectors, Add custom connector, paste the address |
| Claude Code | `claude mcp add --transport http perpetua https://perpetua-meteora.netlify.app/api/mcp` |
| Cursor | Settings, MCP, Add new MCP server, choose the URL type, paste the address |
| VS Code (Copilot) | Command Palette, `MCP: Add Server`, HTTP, paste the address |
| Any MCP client | The address is all it needs |

Config-file form for most clients:

```json
{
  "mcpServers": {
    "perpetua": {
      "url": "https://perpetua-meteora.netlify.app/api/mcp"
    }
  }
}
```

VS Code form:

```json
{
  "servers": {
    "perpetua": {
      "type": "http",
      "url": "https://perpetua-meteora.netlify.app/api/mcp"
    }
  }
}
```

A stdio build of the same tools is in [`packages/mcp`](packages/mcp) for local use. It reads `PERPETUA_API_URL`.

### Tools

Twenty tools: ten that read and ten that build transactions. Every tool takes an optional `cluster`, so an assistant can price a mainnet pool and then build a devnet transaction in one conversation.

**Reading**

| Tool | Returns |
|---|---|
| `where_is_address` | Which cluster owns an address and what it is (pool, wallet, mint or vault) |
| `list_clusters` | The clusters this deployment serves and its default |
| `price_position` | Fair value of a locked position or whole pool as a future-fee stream, with a range and risk flags |
| `get_report` | A pool report card: valuation plus pooled fee and volume history |
| `get_pool_series` | The raw daily fees, volume and liquidity the valuation was fitted to |
| `find_positions` | A wallet's DAMM v2 positions and whether each can be securitized |
| `list_vaults` | Vaults holding fee rights and what they have paid out |
| `simulate_preset` | Test a launch fee and liquidity split before committing, including against a live pool |
| `get_sale_plan` | The DLMM ask ladder a share sale would post: each bin, its price and share count |
| `list_sale_presets` | The DLMM bin-step presets a share market can be created with |

**Building (all unsigned)**

| Tool | Builds |
|---|---|
| `build_create_mint_tx` | The token mint a launch needs |
| `build_launch_tx` | A DBC config and pool with the chosen liquidity split |
| `build_securitize_tx` | `create_vault`: locked position to shares |
| `build_stake_tx` | Stake shares to earn fees |
| `build_unstake_tx` | Withdraw staked shares |
| `build_unstake_no_claim_tx` | Withdraw without claiming, for a paused or blocked fee mint |
| `build_harvest_tx` | Pay a holder's accrued fees out |
| `build_crank_tx` | Claim a vault's fees from the position; anyone may send it |
| `build_open_sale_tx` | Create the DLMM market the shares trade on |
| `build_seed_ladder_tx` | Post shares for sale as a one-sided ask ladder |

### Example prompts

- What is this locked position worth as a fee stream, and what range does that imply?
- Is this address on mainnet or devnet, and what is it?
- Give me a report card for this pool over the last 30 days.
- What does this wallet hold that could be turned into shares?
- Try a launch with 20 percent of liquidity permanently locked and tell me if it holds up.
- Build the transaction that turns this locked position into shares.
- What would my shares sell for as an ask ladder?

### Guarantees

- **No keys.** Perpetua never asks for or stores a private key. Every build tool returns an unsigned, base64-encoded transaction for the user's own wallet to sign. If the user does not sign, nothing happens.
- **Traceable numbers.** Answers carry where they came from and when they were read.
- **One source of truth.** The MCP server and the web app call the same API, so there is a single valuation calculation.

The same data is available over plain HTTP:

```bash
curl -s "https://perpetua-meteora.netlify.app/api/v1/pools/<pool>/yield" | jq .valuation
```

## How it works

```
DBC launch         DAMM v2             create_vault          DLMM one-sided         stake / harvest
(financeable   ->  graduates and   ->  takes the locked  ->  ask ladder around  ->  crank_claim pulls
 preset)           mints locked        position NFT          fair value             fees into the vault
                   position NFTs       account, mints
                                       1,000,000 shares
```

1. **Launch.** A creator deploys a token through Meteora's Dynamic Bonding Curve using the financeable preset: quote-only fees, non-compounding, with a permanently locked liquidity floor.
2. **Graduate.** The curve migrates to DAMM v2, which mints the creator and partner position NFTs. The permanently locked one is the asset that can be securitized.
3. **Securitize.** `create_vault` takes custody of the locked position's NFT account and mints 1,000,000 SPL fee shares to the creator. The program has no instruction that removes liquidity or closes the position.
4. **Sell.** The shares are listed on a `pFEE/quote` DLMM pair as a one-sided ask ladder priced around the model's fair value.
5. **Earn.** Holders stake shares. `stake`, `unstake` and `harvest` each claim the position's fees first, credit them to a fee-per-share accumulator by balance diff, and pay out on touch.

## Network status

| Capability | Mainnet | Devnet |
|---|---|---|
| Pool pricing and valuation API | Live | Not available (fee history is indexed on mainnet only) |
| Wallet position scan and eligibility | Live | Live |
| DBC financeable launch (mint, config, pool) | Live | Live |
| MCP server (reads and builders) | Live, both clusters | Live, both clusters |
| Vault program: create shares, stake, harvest, crank | Not deployed | Live |
| DLMM share market and ask ladder | Not deployed with the vault program | Wired; bin-id placement still to be confirmed against a live pair |

## On-chain evidence

### Securitization transactions (devnet)

Each transaction is a confirmed `CreateVault` instruction that turned a locked DAMM v2 position into shares.

| Transaction | Vault created |
|---|---|
| [2GVp7qEa...piH7](https://solscan.io/tx/2GVp7qEasEckFTcCNWQvENGvUaa4PHRnoBcpaadaW9iP1eXLbHLnGZyKERi7EhiDd6ArZkcTBBSb2V9hC5WjpiH7?cluster=devnet) | [9F46yfJ8...rBSA](https://solscan.io/account/9F46yfJ8Sxs8ceR2MP1C8YARSdZ3wNPWBHMwB7nbrBSA?cluster=devnet) |
| [JoSsNrhB...scj](https://solscan.io/tx/JoSsNrhBmbergmhc9YCe8nD2ktcrWCK3HQc5v4oTJej1sXH5CT5tRg5XLGzgH7NjvXbxa1YGndVK7YoxxgUQscj?cluster=devnet) | [FN2KbJTW...pgR](https://solscan.io/account/FN2KbJTWjq8Ry3sTjomBQg9rqLfo6ReTSzjgrPV4jpgR?cluster=devnet) |
| [55revJoz...3Xs](https://solscan.io/tx/55revJozke4QmDuMXAKLHDHZZcMYBXY4VyMainbhAmghvSMTxWTn3ebz9g46NV2CuYK99PMy3VXsUBGwFwY8w3Xs?cluster=devnet) | [FTQcAaBm...PLZ](https://solscan.io/account/FTQcAaBm5toHdYkueAHteYkmYqTVyj7H3hdvbbE3jPLZ?cluster=devnet) |
| [565VN1CW...xed](https://solscan.io/tx/565VN1CWurUdSLvRMVYPAhYCx28Y1GSxzUFEqoTYbn1Cg5CLUrCsyecoSJxK6TxvRasancazMm2jwqLmu9CQPxed?cluster=devnet) | [GSstL6dn...AWK](https://solscan.io/account/GSstL6dn4TtjMT2FZf7ENddDwuC4B2dwc1KtHaP2SAWK?cluster=devnet) |
| [39LHDreS...v4y](https://solscan.io/tx/39LHDreShZmueCth18r49sS81nBYVRm88F2RULwgmbkTqwoEtjhpGU8qPxXVW48DyNJ88DnSkMe5HpAvB59yvY4y?cluster=devnet) | [2A5YvCy7...5SK](https://solscan.io/account/2A5YvCy74KQPNVS16bhRJjgRPmHn6bm6fTfjpoPV5ySK?cluster=devnet) |
| [3D6W5Zok...387](https://solscan.io/tx/3D6W5ZokB1MLcrHUVsKEjk3aN4kR2RPfD93aVbJHW75h9euwE6LgQYjaxvFMj5wZRp52opaVLbHYF9a5G1rrL387?cluster=devnet) | [5KCYoC2w...q1b](https://solscan.io/account/5KCYoC2wriNqmVf2gfa8Ng3LXWrShHn9N1fPZd4gWq1b?cluster=devnet) |
| [2fAhHErp...GZv5Y](https://solscan.io/tx/2fAhHErpGuxCRf2r7SUJrqSD5cCVWpxJocgJfFc9nGrTvkVd7M1M1GihC9nGNi8upZtDNXe7P8BT3yVTm9SGZv5Y?cluster=devnet) | [7R9DPunK...hjwM](https://solscan.io/account/7R9DPunKZVjgYWbyAFxT6uPYmAAuFA7S89ReZQFbhjwM?cluster=devnet) |

Ten vault accounts exist on devnet in total. I created all of them with wallet `8iY6CPnv5TPLkdykzPxWB9Sm9Z4dsNfUAzXL3mSMMHa4`, which still owns the locked positions behind them. The Create shares page can scan that address read-only.

### Full lifecycle, one command

`pnpm --filter @perpetua/sdk ops:devnet-e2e` mints two tokens, opens a DAMM v2 pool, permanently locks a position, securitizes it, swaps so the position earns real fees, then cranks, stakes and harvests. Use any funded devnet keypair (`solana airdrop 2 --url devnet`) and set `KEYPAIR` as described in [`.env.example`](.env.example). A confirmed run:

| Step | Result |
|---|---|
| Permanently locked position | `CK1YFDFHbx2mEqU5To6JH6T5wzvwBQqzYogMVcbYBNPL` in pool `D51o2cwMxPJZjUxCJqBwxomioQc53S7ucXjhRzXbFa5C` |
| Vault created, shares issued | `DA2TEH6F8tRdfMMc9gj3cyMcKv5A9EezBwJpGk1ndbvu` |
| Share mint | `8u7GWxH5C4nA5Lqo9mGaB4ZRDUogXo3krcVvCL8LmGpg` |
| Stake | 1,000,000,000,000 base units (the entire supply) |
| Crank claim | Banked as carry while unstaked, then `claimed_b = 308263` released to the staker |
| Harvest | Paid the staker out |

## Architecture

```
+----------------------- Web, Next.js (:3000) -----------------------+
|  /   /terminal   /launch   /securitize   /vault/[id]   /kpi   /mcp |
+----------^---------------------------------------------^-----------+
           | REST + SSE                                   | pure-TS pricing
+----------+----------------+                +------------+-----------+
|  API, Hono (:8787/:8788)  |                |  @perpetua/valuation   |
|  valuations, positions    |                |  decay, discount, PV   |
|  unsigned tx builders     |                +------------------------+
|  MCP on /mcp              |
+-------+-----------+-------+
        |           |
  Meteora data    Solana RPC             +-----------------------------+
  API (fees)      (positions,            |  perpetua_vault (Anchor)    |
                   tx build)             |  vault, stake, harvest      |
                                         +-----------------------------+
```

The API never holds a key. Every `/v1/tx/*` route returns an unsigned, base64-encoded transaction that the browser wallet signs. Extra signatures a flow needs (a share mint, a DLMM position account, a DBC config) are generated in the browser and partial-signed there.

### Repository layout

```
apps/
  web/         Next.js 16 UI
  api/         Hono API: valuations, positions, unsigned transaction builders
  indexer/     Watches vault events and writes vault and stat rows
  keeper/      Calls crank_claim on an interval when a vault has fees to pull
packages/
  shared/      Types, program ids, network resolution, RPC failover
  valuation/   The pricing model; pure TypeScript, no chain dependency
  sdk/         Everything that touches the chain or the Meteora SDKs
  stock-kit/   Closed-market fee curve and anchored start price for stock-quoted launches
  mcp/         MCP server (stdio build)
programs/
  perpetua_vault/   Anchor program, 9 instructions
netlify/
  api/         API and MCP entrypoints, prebundled into one function file
  functions/   The function Netlify serves at /api/*
```

### SDK modules

| Module | Responsibility |
|---|---|
| `data/meteoraDataApi` | Fee history from Meteora's DAMM v2 data API, the only source of fee history |
| `adapters/dammV2` | Reads DAMM v2 positions and lock buckets; derives the `claim_position_fee` account set |
| `adapters/dlmm` | Builds the `pFEE/quote` pair (`createLbPair2`, addressed with `deriveLbPair2`) and the one-sided ask ladder |
| `adapters/dbc` | Builds the financeable DBC `createConfigAndPool` |
| `sale/ladder` | The front-weighted, geometric ask-ladder algorithm (pure) |
| `positions/eligibility` | `unlocked == 0 && vested == 0 && permanentLocked > 0`, decided once and echoed to the UI |
| `vault/client` | Typed client over the program IDL, plus instruction builders |

## Run it locally

Requirements: Node 22 or newer, pnpm 9.15 or newer. For the on-chain program: Rust with the Solana SBF toolchain and Anchor 0.32. Copy [`.env.example`](.env.example) to `.env`; every value has a working local default.

```bash
pnpm install

# Everything at once: web, api, indexer, keeper
pnpm dev

# Or just the web (:3000) and devnet API (:8787)
pnpm --filter @perpetua/api dev     # terminal A
pnpm --filter @perpetua/web dev     # terminal B

# A mainnet API alongside the devnet one
CLUSTER=mainnet-beta PORT=8788 pnpm --filter @perpetua/api dev
```

Point the UI at either API at runtime, without rebuilding:

```
http://localhost:3000/?api=http://localhost:8788    # mainnet API
http://localhost:3000/?api=http://localhost:8787    # devnet API
```

## Application pages

| Page | Purpose | Wallet |
|---|---|---|
| Vaults `/` | Landing page; reads `/v1/stats` and lists indexed vaults | No |
| Pricing `/terminal` | Paste any DAMM v2 pool for fair value, range, trailing fee chart, risk flags and the ask ladder a sale would use | No |
| Create shares `/securitize` | Scans a wallet for locked positions, shows the eligibility verdict and valuation preview, signs `create_vault` | Yes |
| Launch plan `/launch` | Sets and validates the financeable DBC preset, then deploys token, config and pool | Yes |
| Vault `/vault/[id]` | Position proof, totals, event feed, stake, unstake, harvest, crank, and Sell shares (create the market, list the ladder) | Yes |
| Stats `/kpi` | Vaults, positions securitized, fees distributed, holders, trading volume | No |
| Use with AI `/mcp` | MCP address, per-client setup, tool list, example prompts | No |

Once a wallet connects, the header badge names the network that wallet signs on (`devnet wallet` or `mainnet wallet`). One deployment serves mainnet pool pricing and launches and devnet vaults at the same time, so each page that behaves differently per network repeats the network name in its own notice.

## API reference

Every route is zod-validated; a bad value returns `400` with the issue list. Transaction routes return `503` when the API has no RPC connection.

### Read routes

| Route | Query | Returns |
|---|---|---|
| `GET /health` | | `{ ok: true }` |
| `GET /v1/stats` | | Vaults, positions securitized, fees distributed, holders, volume |
| `GET /v1/vaults`, `/v1/vaults/:id` | | Indexed vaults, or one (404 if unknown) |
| `GET /v1/vaults/:id/events` | `limit` 1 to 500 | Decoded Anchor events |
| `GET /v1/positions/:wallet` | | Securitizable positions |
| `GET /v1/positions/:wallet/onchain` | | Position detail read from DAMM v2, plus `eligibility` |
| `GET /v1/valuation/:position` | `pool`, `liquidityShare`, `protocolFeeBps`, `discountRate`, `horizonDays`, `days` | Valuation for a position |
| `GET /v1/pools/:pool/yield` | as above | Valuation for a whole pool |
| `GET /v1/pools/:pool/series` | `days` 7 to 30 | The raw daily fee series |
| `GET /v1/sale/plan` | `fairValuePerShareUsd`, `totalShares`, `saleFraction`, `lowerPct`, `upperPct`, `binStep`, `binCount` | The DLMM ask ladder |
| `GET /v1/sale/presets` | | DLMM presets (bin step and base factor) on this cluster |
| `GET /v1/dbc/preset` | `creatorTradingFeePct`, `creatorLiquidityPct`, `partnerLiquidityPct`, `lockedPct` | The financeable preset and its validation |
| `GET /v1/stream` | | Server-Sent Events feed of vault events |

### Transaction routes

Each returns an unsigned transaction for the caller's wallet to sign.

| Route | Body |
|---|---|
| `POST /v1/tx/create-vault` | `creator`, `pool`, `position`, `positionNftMint`, `positionNftAccount`, `positionNftProgram`, `tokenAMint`, `tokenBMint`, `tokenAProgram`, `tokenBProgram`, `shareMint` |
| `POST /v1/tx/stake`, `/v1/tx/unstake` | `owner`, `vault`, `amount` (base units, decimal string) |
| `POST /v1/tx/harvest`, `/v1/tx/crank-claim` | `owner`, `vault` |
| `POST /v1/tx/create-mint` | `payer`, `mint`, `decimals` |
| `POST /v1/tx/launch` | `creator`, `config`, `baseMint`, `quoteMint`, `feeClaimer`, `leftoverReceiver`, `name`, `symbol`, `uri`, `totalTokenSupply`, `creatorTradingFeePercentage`, `creatorLiquidityPercentage`, `partnerLiquidityPercentage`, `creatorPermanentLockedLiquidityPercentage`, `partnerPermanentLockedLiquidityPercentage` |
| `POST /v1/tx/open-sale` | `owner`, `shareMint`, `quoteMint`, `presetParameter`, `binStep`, `baseFactor`, `initialPrice` |
| `POST /v1/tx/seed-ladder` | `owner`, `poolAddress`, `shareMint`, `quoteMint`, `positionPubKey`, `binStep`, `plan` |

## Valuation model

`@perpetua/valuation` is pure TypeScript with no chain dependency. Given a trailing daily fee series:

1. **Fit a decay rate.** Weighted least squares on `ln(fee_t) = a + b*t`, so `lambda = -b`, clamped to `[-0.02, 0.15]` per day so a noisy series cannot project an absurd number. Zero and near-zero days are floored at half the smallest positive fee before the log.
2. **Shrink toward a prior.** `blendDecay(fitted, cohortPriorFor(poolAgeDays))` pulls the estimate toward a prior that is harsher for young pools, where an early fee spike is hype rather than earnings. The prior has the most weight where data is thinnest.
3. **Project forward.** `F_t = lastFee * e^(-lambda*t)`, floored.
4. **Discount.** `PV = sum_t share * F_t * (1 - protocolFeeBps/10000) / (1 + r)^(t/365)`.

Outputs: fair value, a bear/base/bull range, fair value per share, implied APR at fair value, payback days per scenario, and risk flags (`pausable_mint`, `permanent_delegate`, `pool_too_young`, `volume_concentration`, `low_liquidity`, `compounding_mode`).

**Calibration.** `pnpm --filter @perpetua/valuation backtest` runs the model on synthetic pools with a known decay rate. Mean absolute error is about 21.7 percent and calibration (mean predicted over mean realized) is about 1.15. Real series contain regime changes the synthetic set does not model, so treat this as an upper bound on accuracy.

## Vault program

`programs/perpetua_vault`, Anchor 0.32, nine instructions:

`init_config`, `create_vault`, `crank_claim`, `stake`, `unstake`, `unstake_no_claim`, `harvest`, `set_paused`, `set_risk_flags`

**Fee accounting.** Each claim CPIs `claim_position_fee`, then credits the balance diff of the vault's token A and B accounts, which handles Token-2022 transfer fees automatically. The protocol skim is applied and the net goes into a `u128` fee-per-share accumulator scaled by `1e18`. A staker's pending amount is `stake.amount * (acc - debt) / 1e18`. Fees that arrive while nobody is staked are banked as carry and released to the next stakers.

**Claim-on-touch.** `stake`, `unstake` and `harvest` call `touch()` (the claim) before they change any accounting, so a newcomer cannot join at the instant fees land. `unstake_no_claim` lets a holder exit even if a fee mint is paused or blocked.

## Security model

The vault takes custody of a position NFT account, not of funds. After `create_vault` the vault PDA owns the NFT account, and only the program can claim and split the fee stream. There is no instruction that removes liquidity, closes the position or changes a lock, so the principal is unreachable by construction.

| Threat | Mitigation |
|---|---|
| Admin drains the vault | The admin can only set `protocol_fee_bps` at init and re-settle `risk_flags`. No path reaches the NFT. |
| Admin traps holders | `set_paused` gates entry only (`create_vault`, `stake`). Exits are never gated. |
| JIT-staking sandwich | `stake` and `unstake` claim before touching accounting, in the same transaction. |
| Token-2022 transfer fees break accounting | Fees are credited by balance diff around the CPI. |
| A paused fee mint bricks stakers | `unstake_no_claim` exits without the claim CPI. |
| Pool or position substitution | The vault is keyed by position, `has_one = pool` pins the pool, and `share_mint` is pinned with `address =`. |
| cp-amm program substitution | `CP_AMM_PROGRAM_ID` is asserted on every account struct that receives it. |
| A `TransferHook` fee mint | `create_vault` walks the Token-2022 extension TLV and refuses the mint. |

## Known limitations

- **The program is unaudited and devnet-only.** The devnet deployment is upgradeable. On mainnet, the app prices pools, scans positions and launches tokens; creating shares, staking, harvesting, cranking and selling shares need the vault program.
- **The hosted Vaults list and Stats page are empty.** The hosted API keeps vaults in memory and I have not deployed the indexer, so `/vault/<address>` reports "We couldn't find that vault" for devnet vaults. The vault accounts are real and linked on Solscan above. Run the stack locally with the indexer to use the vault page.
- **The ladder's bin-id placement is not yet confirmed** against a live DLMM pair.
- **Only fully permanently locked positions are accepted.** A mixed position must be split first with DAMM v2 `split_position`.
- **The API has no authentication, rate limiting or webhooks.** CORS is same-origin in production.
- **`init_config` sets `treasury` to `admin`.** There is no `set_treasury` yet, so this is not production-ready.

## Testing

```bash
pnpm test                                      # vitest suites
pnpm lint && pnpm typecheck                    # biome and tsc
cargo test --workspace                         # Rust suites, including LiteSVM
cargo clippy --workspace --all-targets -- -D warnings
pnpm program:check                             # Anchor.toml against declare_id!
```

Current state: biome clean, tsc clean, `next build` green, `cargo test` green with 25 tests including the LiteSVM end-to-end flow.

The TypeScript suites cover the pricing model, ladder and bin maths, the SDK adapters (against a mocked HTTP layer), API routes and stores, the indexer mapping and the keeper decision logic. The Rust suites cover fee-per-share accrual, carry banking, fee conservation, the protocol-fee split, the Token-2022 extension parser, and an end-to-end LiteSVM flow (`init_config`, `create_vault`, `crank_claim`, `harvest`) against a mock DAMM v2.

## Reference pools

Real DAMM v2 pools from Meteora's data API, usable in Pricing, in `/v1/pools/<address>/yield`, and as MCP inputs. Behavior verified against the hosted API on 2026-10-11.

| Pool | Pair | Risk flags returned |
|---|---|---|
| `BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1` | MET-USDC | none |
| `F3XBLXejAn8YBS3qQao4u4fiijH4eaiHw7F68ovLz5Fq` | PLAY-USDC | `pool_too_young`, `low_liquidity` |
| `8FoQfA6pYc7Mgbab3ijTtWhq692p85enWRSTV6y6VVJW` | JPAD-USDC | `pool_too_young` |

A pool with no complete day of fee history returns `422` rather than a zero. A devnet pool returns a message that fee history is indexed on mainnet only.

## License

MIT.
