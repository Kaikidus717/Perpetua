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

`cargo test --workspace` runs **26** Rust tests: **17** in `perpetua_vault` (fee-per-share accrual,
carry banking and release, fee conservation, the protocol-fee split, the Token-2022 extension parser
including a truncated TLV entry, the pinned SPL Token `SetAuthority` wire format, and the
position-lock byte offsets) and **9** in the LiteSVM harness under `tests/litesvm` — one that loads
the compiled binary and asserts it is a valid, executable program, and eight that drive
`init_config → create_vault → crank_claim → harvest` against a mock DAMM v2.

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
- **The program compiles for SBPF and its logic is tested.** `anchor build --no-idl` exits 0 and
  writes `target/deploy/perpetua_vault.so` (448,248 bytes, valid ELF, no stack-frame overflows).
  `cargo test --workspace` is green and `cargo clippy --workspace --all-targets -- -D warnings` is
  clean.
- **Building and running the program found four real bugs**, none of which were visible from reading
  the source:

  1. **Stack-frame overflow.** The first SBPF build reported four
     `overflows the maximum allowed frame space` errors on `stake` and `unstake`
     (`StakeContext::try_accounts` at 5440 bytes against a 4096-byte limit). The program would not
     have run on-chain. Boxing the deserialized `Vault`, `Stake`, mint and token accounts fixed it.
  2. **`create_vault` could never succeed.** It minted the share supply into the creator's
     associated token account, but the share mint is created by that same instruction — so the
     account could not exist yet and `mint_to` had nothing to mint into. The program now creates the
     ATA itself (`init` + `associated_token::*` constraints), which is what `associated_token_program`
     was in the account list for.
  3. **`create_vault` permanently bricked the position NFT.** `set_authority_data` wrote the
     `COption<Pubkey>` tag as **four** bytes. SPL Token's instruction-data form uses **one**
     (`Pack::LEN == 1 + 32`), so the token program read the tag and then took `0x000000 || authority[0..29]`
     as the new owner — an address nobody can ever sign for. The position would have been
     unrecoverable and the whole fee flow dead. Caught by `crank_claim → harvest` failing against the
     real token program; pinned by a byte-exact unit test in `cpi.rs`.
  4. **The cp-amm program address was never pinned.** The `claim_position_fee` CPI runs
     `invoke_signed` with the vault PDA over the vault's own fee token accounts, so a caller could
     have substituted a program that simply transfers those balances away. `CP_AMM_PROGRAM_ID` is now
     asserted on every account struct that receives it, and a test proves the substitution is
     rejected.
- **The upgrade pack is real code, not prose.** `set_paused` gates entry only — exits are never
  gated. `create_vault` walks the fee mints' Token-2022 extensions and refuses a `TransferHook`
  mint, recording pausable / permanent-delegate / transfer-fee mints in `Vault.risk_flags`.
- **The valuation engine has session and compounding analytics**: `session.ts` classifies any
  instant into a pre/regular/post/overnight/closed equity session, `compounding.ts` separates the
  claimable floor from the growth-adjusted upside, and every result carries a `modelVersion` and an
  `inputsHash`.
- **`@perpetua/stock-kit`** schedules the closed-market fee curve (a cliff that decays to the base
  fee as the reference reopens) and the anchored start price.
- **`sale/bids.ts`** scores conviction bids as `size × time in pool × depth below fair value` and
  builds the ask/bid depth chart.
- **The position-lock offsets are verified against live on-chain accounts**, not assumed:
  `pnpm --filter @perpetua/sdk ops:verify-offsets`.

Left, stated plainly:

- **`cargo build-sbf`** needs the Solana platform tools — a 531 MB download from GitHub releases.
  On a slow network, fetch it in 16 MB range chunks in parallel (GitHub throttles a single long-lived
  connection); `scripts/out/pt-all.sh` does exactly that and stages the tarball outside the Solana
  cache so the toolchain installer cannot reclaim it.
- **The fee flow runs against a mock DAMM v2, not the real binary.** `tests/litesvm/tests/flow.rs`
  drives `init_config → create_vault → crank_claim → harvest` against the compiled program with the
  real SPL token program and real PDA signing, but the cp-amm callee is `tests/mock-cp-amm`. The
  mock reproduces the one behaviour the vault depends on — the fee delta arriving in the vault's
  token accounts — and nothing else, so DAMM v2's own pool validation and fee arithmetic are out of
  scope here. `scripts/fetch-programs.sh` dumps the real `cp_amm.so`; pointing the harness at it is a
  one-line change in `tests/litesvm/src/lib.rs`.
- **The devnet deployment is live.** `G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2` is deployed on
  devnet, and the bytecode read back off-chain is byte-for-byte the artifact the tests ran against.
  `ops:devnet-e2e` drives the whole flow against it; see [DEVNET.md](DEVNET.md).
- **The DLMM pair PDA derivation** for `createLbPair2` should be confirmed on devnet (see
  [INTEGRATIONS.md](INTEGRATIONS.md)).
