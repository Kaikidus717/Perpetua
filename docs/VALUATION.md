# Valuation model

The engine prices the future fee stream attached to a position. It is deliberately a **range**, not
a promise — a single "guaranteed APR" would be dishonest.

## Inputs

| Input | Meaning |
|---|---|
| `series.feesUsd` | trailing daily fees for the pool (7–30 days) |
| `liquidityShare` | the position's share of the pool's fees, in `(0, 1]` |
| `protocolFeeBps` | protocol skim applied before distribution (default 0) |
| `discountRateAnnual` | discount rate, annualised (default 0.25) |
| `horizonDays` | projection horizon (default 365) |
| `risk` | fee collect mode, pool age, mint flags, liquidity, volume concentration |

## Model

1. **Decay fit.** Weighted least squares on `ln(fee_t) = a + b·t` with linear recency weights.
   `λ = −b`, clamped to `[−0.02, 0.15]` per day so a noisy series cannot produce an absurd
   projection. Zero and near-zero days are floored at half the smallest positive fee before the log.
   The fitted rate is then **blended with a cohort prior** keyed on pool age (see below), so a short
   or hype-driven series cannot overstate the stream.
2. **Projection.** `F_t = max(f_last · exp(−λ·t), floor)` for `t = 1…horizonDays`, with
   `floor = 2% · f_last`.
3. **Discount.** `PV = Σ_{t=1..H} share · F_t · (1 − protocolFee) / (1 + r)^(t/365)`.
4. **Scenarios.** bear / base / bull scale `λ` by 1.5 / 1.0 / 0.6 and volume by 0.7 / 1.0 / 1.25.
5. **Outputs.** Fair value, fair-value range (bear…bull), fair value per share (supply is fixed at
   1,000,000 tokens), payback days and implied APR at any offer price.

## Risk flags

- `compounding_mode` — fees are not claimable, so they cannot be distributed.
- `pausable_mint`, `permanent_delegate` — the fee mint can be frozen or seized.
- `pool_too_young` — fewer than seven days of history.
- `volume_concentration` — one wallet drove more than half of volume.
- `low_liquidity` — pool liquidity below $50k.

Flags do not change the price. They are surfaced next to it on the Pricing page.

## Cohort prior

`cohortPriorFor(poolAgeDays)` returns a prior daily decay and a blend weight. Young pools decay
faster because the early fee spike is hype, not earnings:

| Pool age | Prior λ/day | Weight |
|---|---|---|
| ≤ 7 days | 0.09 | 0.60 |
| ≤ 30 days | 0.06 | 0.40 |
| ≤ 90 days | 0.035 | 0.25 |
| older | 0.02 | 0.15 |

`blendDecay(fitted, prior) = fitted·(1 − w) + prior.λ·w`. The prior pulls hardest exactly where the
data is thinnest, which is the same idea as shrinkage in a hierarchical model.

## Stock sessions

When the pool's reference price follows an equity clock, the fee stream is not smooth: it has
pre/regular/post/overnight sessions and a Friday 20:00 to Sunday 20:00 ET dead zone. `session.ts`
classifies any instant into a session using `America/New_York`, splits a fee series per session
(`splitFeesBySession`) and measures how long the reference is dark (`hoursUntilOpen`), so a fee series
can be reported per session rather than as one daily number. The stock-session module is a library:
the Pricing page charts the daily series today.

## Compounding analyzer

For pools whose fee mode reinvests part of the fee, `analyzeCompounding` separates:

- `claimablePvUsd` — the present value of what a holder can actually withdraw. **The floor.**
- `growthAdjustedPvUsd` — the same figure counting reinvested fees, whose share of the pool drifts
  up over time. **The upside.**

The gap is reported as `upliftPct`. A model that only prices the claimable part understates the
position; one that only prices the growth part overstates it because reinvested fees are illiquid
and can be diluted.

## Reproducibility

Every result carries `modelVersion` and `inputsHash` — a 64-bit FNV-1a over the canonical
(key-sorted) JSON of the inputs. Any published number can be traced back to the exact inputs and
model version that produced it.

## Calibration

Run `pnpm --filter @perpetua/valuation backtest` to regenerate
[`packages/valuation/backtest/results.md`](../packages/valuation/backtest/results.md). It reports the
30-day-ahead mean absolute error and the calibration ratio (mean predicted ÷ mean realized) across
synthetic pools with a known decay rate.

Calibration near 1.0 means the model is unbiased on average. Real series carry regime changes that
the synthetic set does not model, so treat the reported accuracy as an upper bound.
