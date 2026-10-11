# @perpetua/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server, so an LLM agent can price, read
and transact against Perpetua without any bespoke glue.

It is a thin, typed adapter over the Perpetua REST API: `apps/api` stays the only place that owns
domain logic, and this package never imports the Anchor or Meteora SDKs. That keeps startup fast and
the trust surface small.

## Tools

| Tool | What it does |
|---|---|
| `where_is_address` | Which network owns an address, and what it is. |
| `list_clusters` | Which networks this deployment serves, and its default. |
| `price_position` | Fair-value a permanently locked DAMM v2 position, or a whole pool, as a decaying fee stream. Returns base case, bear/base/bull range, implied APR and risk flags. |
| `get_report` | Fee Report Card: valuation plus pooled fee/volume statistics over the window. |
| `get_pool_series` | The raw daily fees, volume and liquidity a valuation was fitted to. |
| `find_positions` | A wallet's DAMM v2 positions and whether each can be securitized. |
| `list_vaults` | List the indexed Perpetua vaults. |
| `simulate_preset` | Build and validate a DBC fee-split preset, and optionally price the permanently locked share against a live pool. |
| `get_sale_plan` | The one-sided ask ladder a share sale would post. |
| `list_sale_presets` | The DLMM bin-step presets a share market can be created at. |
| `build_create_mint_tx` | Build the **unsigned** transaction that creates a launch's base token. |
| `build_launch_tx` | Build the **unsigned** DBC config-and-pool launch transaction. |
| `build_securitize_tx` | Build the **unsigned** `create_vault` transaction for a wallet to sign. |
| `build_stake_tx` | Build the **unsigned** stake transaction. |
| `build_unstake_tx` | Build the **unsigned** unstake transaction. |
| `build_unstake_no_claim_tx` | Build the **unsigned** force-exit transaction (no fee claim). |
| `build_harvest_tx` | Build the **unsigned** harvest transaction. |
| `build_crank_tx` | Build the **unsigned** permissionless crank-claim transaction. |
| `build_open_sale_tx` | Build the **unsigned** transaction that opens the share market. |
| `build_seed_ladder_tx` | Build the **unsigned** transaction that posts the ask ladder. |

Every result carries an envelope so an agent can attribute the number it just read:

```json
{
  "as_of": "2026-01-02T03:04:05.000Z",
  "source": "perpetua-api http://localhost:8787",
  "endpoints": ["/v1/pools/<pool>/yield"],
  "model_version": "perpetua-valuation/1.1.0",
  "unsigned": false,
  "data": { }
}
```

## Keys

The server never holds, derives or signs with key material. `build_securitize_tx` returns a base64
wire transaction tagged `"unsigned": true` plus the address that must sign it; the caller's own
wallet signs and submits. There is no configuration anywhere in this package that accepts a secret.

## Running it

Start the API first, then point the server at it:

```bash
pnpm --filter @perpetua/api dev          # http://localhost:8787

PERPETUA_API_URL=http://localhost:8787 pnpm --filter @perpetua/mcp start
```

`PERPETUA_API_URL` defaults to the hosted endpoint (`https://perpetua-meteora.netlify.app/api`), so an
agent can be pointed at Perpetua with no local checkout; override it for a local or preview API. Over
stdio, stdout is the protocol channel, so all diagnostics go to stderr.

### Client configuration

```jsonc
// Claude Desktop / Cursor / VS Code (mcp.json)
{
  "mcpServers": {
    "perpetua": {
      "command": "node",
      "args": ["/absolute/path/to/perpetua/packages/mcp/dist/stdio.js"],
      "env": { "PERPETUA_API_URL": "http://localhost:8787" }
    }
  }
}
```

Run `pnpm --filter @perpetua/mcp build` first — `dist/` is not committed.

## Tests

```bash
pnpm --filter @perpetua/mcp test
```

`test/tools.test.ts` and `test/httpApi.test.ts` drive the tool layer against a fake API port.
`test/server.test.ts` connects a real MCP `Client` over the SDK's in-memory transport and exercises
`tools/list` and `tools/call` end to end, including the error paths.
