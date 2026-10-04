# Judges — the 5-minute path

No wallet required for steps 1–2.

## 0. Run it (60s)

```bash
pnpm install
pnpm build
pnpm --filter @perpetua/api dev      # terminal A → http://localhost:8787
pnpm --filter @perpetua/web dev      # terminal B → http://localhost:3000
```

The API ships with a demo pool and a demo wallet, so everything below works offline.

## 1. Price a fee stream — `/terminal`

Open `http://localhost:3000/terminal`. The demo pool is priced automatically. You get:

- fair value and a bear/base/bull range,
- fair value per share and implied APR,
- payback days per scenario,
- risk flags,
- the trailing daily fee chart,
- the DLMM ask ladder the sale would use.

This is the whole valuation engine; it is pure TypeScript with no chain dependency.

## 2. Verify the model is not hand-waving

```bash
pnpm --filter @perpetua/valuation backtest
```

Prints the 30-day-ahead MAE and the calibration ratio on synthetic pools with a known decay rate and
writes `packages/valuation/backtest/results.md`.

## 3. Securitize — `/securitize`

The page scans a wallet for DAMM v2 positions, checks eligibility (unlocked == 0, vested == 0,
permanent lock > 0), previews the valuation and shows the transactions the operator runs. Connect a
wallet or paste an address to scan; the demo wallet is preloaded.

## 4. Prove the on-chain side

```bash
cargo test -p perpetua_vault --features no-entrypoint   # accrual + protocol-fee unit tests
anchor test                                             # LiteSVM suite (needs fetched binaries)
```

Invariants under test are listed in [SECURITY.md](SECURITY.md): fee conservation, no-liquidity-change,
the JIT-staking attack, fixed supply, zero-fee no-op and paused-mint exits.

## 5. KPI page

`/kpi` shows vaults, positions securitized, fees distributed, unique stakers and DLMM volume, all
sourced from the indexer API.

## Real, and what is left

Real and running:

- **The web UI signs.** `/securitize` sends `create_vault`; `/vault/[id]` has stake, unstake, harvest
  and crank. Transactions are built by the API (`apps/api/src/tx.ts`) and returned as base64, so the
  browser only needs `@solana/web3.js` and the wallet — not Anchor or the Meteora SDKs.
- **The Meteora SDKs are wired**, not stubbed: `DammV2Adapter` reads positions and lock buckets and
  derives the full `claim_position_fee` account set from pool state; `DlmmAdapter` builds the
  permissionless pair and the one-sided ask ladder; `DbcAdapter` builds the financeable config.
- **The program compiles and its logic is tested**: `cargo test -p perpetua_vault` → 7/7.
- **The position-lock offsets are verified against live on-chain accounts**, not assumed:
  `pnpm --filter @perpetua/sdk ops:verify-offsets`.

Left, stated plainly:

- **`cargo build-sbf`** needs the Solana platform tools, which download from GitHub releases. On a
  network that cannot reach GitHub, build the `.so` elsewhere or in CI; the LiteSVM suite in
  `tests/litesvm` then runs against the real DAMM v2 binary.
- **A devnet deployment and live end-to-end run** need a funded devnet keypair, which comes from
  `https://faucet.solana.com`; `ops:devnet-e2e` then runs the whole flow.
- **The DLMM pair PDA derivation** for `createLbPair2` should be confirmed on devnet (see
  [INTEGRATIONS.md](INTEGRATIONS.md)).
