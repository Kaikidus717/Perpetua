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

## What is not wired yet (being explicit)

- The **web UI does not sign transactions.** The privileged flow (`create_vault`, DLMM ladder
  seeding) runs through `packages/sdk/scripts/create-vault.ts` so operator keys never reach a
  browser.
- The **DLMM pool creation and ladder seeding** are planned and priced by the app, but the actual
  `@meteora-ag/dlmm` calls sit behind the `DlmmPort` interface in `packages/sdk/src/ports.ts`, which
  is not yet implemented against the live SDK.
- The Meteora data API response shape is normalised in `apps/indexer/src/dataApi.ts`; confirm the
  endpoint paths in [INTEGRATIONS.md](INTEGRATIONS.md) before pointing it at production.
