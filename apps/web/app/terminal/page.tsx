"use client";

import { FeeChart } from "@/components/FeeChart";
import { LadderHistogram } from "@/components/LadderHistogram";
import { RiskFlags } from "@/components/RiskFlags";
import { Segmented } from "@/components/Segmented";
import { Spinner } from "@/components/Spinner";
import { ValueSlider } from "@/components/ValueSlider";
import { api, apiStatus } from "@/lib/api";
import {
  POOL_CLUSTER,
  UNKNOWN,
  compactUsd,
  explorerCluster,
  explorerUrl,
  pct,
  shortAddress,
  usd,
} from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import {
  DISCOUNT_RATE_ANNUAL,
  MAX_POOL_HISTORY_DAYS,
  MIN_POOL_HISTORY_DAYS,
} from "@perpetua/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

type ScenarioName = "bear" | "base" | "bull";

/// The windows the model may be fitted to. The API accepts 7–30 days and refuses anything outside
/// that, so the control offers the ends and the middle instead of a free number.
const WINDOWS = [MIN_POOL_HISTORY_DAYS, 14, MAX_POOL_HISTORY_DAYS];

/// The model's own starting points, read from the same constants the API defaults to — so the first
/// paint prices a pool exactly as it did before these controls existed.
const DEFAULTS = {
  liquidityShare: 1,
  discountRate: DISCOUNT_RATE_ANNUAL,
  protocolFeeBps: 0,
};

const CASES: Array<{ value: ScenarioName; label: string }> = [
  { value: "bear", label: "Bear" },
  { value: "base", label: "Base" },
  { value: "bull", label: "Bull" },
];

const CTA =
  "rounded-lg bg-accent px-5 py-3 text-[13px] font-semibold text-canvas transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const FIELD =
  "w-full rounded-lg border border-line bg-panel px-3.5 py-3 font-mono text-base text-ink outline-none placeholder:text-muted focus:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/30";
const PANEL = "rounded-xl border border-line bg-panel";
const LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";

export default function TerminalPage() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(MAX_POOL_HISTORY_DAYS);
  const [scenarioName, setScenarioName] = useState<ScenarioName>("base");
  const [assumptions, setAssumptions] = useState(DEFAULTS);
  /// Whether a control has been moved at all — it drives nothing but the Reset button. What actually
  /// changes the request is `overridden` below, which compares the settled values with the defaults.
  const [touched, setTouched] = useState(false);
  /// Dragging a slider writes on every pointer move. This waits for the thumb to settle before the
  /// page asks the API again, and the number on screen meanwhile is the previous answer.
  const settled = useDebounced(assumptions, 250);
  const overridden =
    settled.liquidityShare !== DEFAULTS.liquidityShare ||
    settled.discountRate !== DEFAULTS.discountRate ||
    settled.protocolFeeBps !== DEFAULTS.protocolFeeBps;

  const active = submitted;

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("pool")?.trim();
    if (!linked) return;
    setInput(linked);
    setSubmitted(linked);
  }, []);

  const valuation = useQuery({
    queryKey: ["valuation", active, windowDays, overridden ? settled : null],
    queryFn: () =>
      active
        ? api.valuation(
            active,
            overridden ? { days: windowDays, ...settled } : { days: windowDays },
          )
        : Promise.reject(new Error("no pool")),
    enabled: Boolean(active),
    /// Keep the last pool's numbers on screen while the next one loads, instead of blanking the page.
    placeholderData: keepPreviousData,
  });

  const baseline = useQuery({
    queryKey: ["valuation", active, windowDays, null],
    queryFn: () => api.valuation(active as string, { days: windowDays }),
    enabled: Boolean(active) && overridden,
    placeholderData: keepPreviousData,
  });

  const series = useQuery({
    queryKey: ["series", active, windowDays],
    queryFn: () => api.series(active as string, windowDays),
    enabled: Boolean(active),
    placeholderData: keepPreviousData,
  });

  const location = useQuery({
    queryKey: ["where", active],
    queryFn: () => api.where(active as string),
    enabled: Boolean(active),
    placeholderData: keepPreviousData,
  });

  const view = valuation.data?.valuation;
  /// Whichever case is selected drives the headline figure, the ladder and the words around them —
  /// one number in charge, instead of a table of three for the reader to reconcile.
  const selected =
    view?.scenarios.find((row) => row.scenario.name === scenarioName) ??
    view?.scenarios.find((row) => row.scenario.name === "base") ??
    view?.scenarios[0];

  const perShare = selected?.fairValuePerShareUsd;
  const ladder = useQuery({
    queryKey: ["ladder", perShare],
    queryFn: () => api.ladder(perShare as number),
    enabled: typeof perShare === "number" && perShare > 0,
    placeholderData: keepPreviousData,
  });

  /// Anything still in flight, so the spinner next to the address spins until the answer lands and
  /// the figures below have settled.
  const loading =
    location.isFetching || valuation.isFetching || series.isFetching || ladder.isFetching;

  const cluster = location.data?.cluster ?? null;
  const kind = location.data?.kind ?? null;
  const linkCluster = cluster ? explorerCluster(cluster) : POOL_CLUSTER;

  function priceMessage(): string {
    if (location.data && location.data.found.length === 0) {
      return "Nothing on devnet or mainnet owns that address. Check it and try again.";
    }
    /// What it is comes before which cluster it is on: a mint on devnet is still a mint, and saying
    /// "that is a devnet pool" about one would be wrong twice over.
    if (kind && kind !== "pool") {
      return `That address is a ${kind}, not a pool. Paste a pool address to price its fees.`;
    }
    if (cluster === "devnet") {
      return "That is a devnet pool, and fee history is only indexed on mainnet, so it cannot be priced. Its locked positions can still be turned into shares.";
    }
    const status = apiStatus(valuation.error);
    if (status === 422) {
      return "That pool has not completed a full day of trading yet, so there is no fee history to price. Come back once it has.";
    }
    if (status === 404) {
      return "We cannot find a Meteora pool at that address. Check it and try again.";
    }
    return "Pricing is unavailable right now. Please try again in a moment.";
  }

  function change(patch: Partial<typeof DEFAULTS>) {
    setTouched(true);
    setAssumptions((current) => ({ ...current, ...patch }));
  }

  function reset() {
    setAssumptions(DEFAULTS);
    setTouched(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(input.trim() || null);
  }

  /// What the sliders did, in one sentence, only when the change is big enough to be the model's
  /// rather than float noise.
  const before = baseline.data?.valuation.fairValueUsd;
  const after = view?.fairValueUsd;
  const moved =
    overridden &&
    before !== undefined &&
    after !== undefined &&
    Math.abs(after - before) > Math.abs(before) * 0.005;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Pricing</h1>
        <p className="max-w-xl text-[13px] leading-5 text-muted">
          What a locked pool&apos;s fee stream is worth today — and what it becomes when your
          assumptions change.
        </p>
        <details className="text-[13px]">
          <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
            How this is priced
          </summary>
          <p className="mt-2 max-w-xl leading-5 text-muted">
            A decay rate is fitted to the trailing fee series, and a 365-day projection is
            discounted into bear, base and bull cases. Fee history comes from Meteora&apos;s mainnet
            data API, so pool links open on mainnet. No wallet is needed.
          </p>
        </details>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label="Pool address to price"
            placeholder="paste a Meteora pool address…"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="go"
            className={`${FIELD} ${loading ? "pr-11" : ""}`}
          />
          {loading ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner label="Pricing this pool" />
            </span>
          ) : null}
        </div>
        <button type="submit" className={CTA}>
          Price
        </button>
      </form>

      {!active ? (
        <p className={`${PANEL} px-4 py-5 text-[13px] leading-5 text-muted`}>
          Nothing priced yet. Paste a mainnet pool&apos;s address above: fee history is indexed
          there, so a devnet pool can be securitized but not priced.
        </p>
      ) : null}

      {active ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {kind ? <span className="capitalize">{kind}</span> : null}
          {kind ? (
            <span aria-hidden="true" className="text-line">
              ·
            </span>
          ) : null}
          <a
            href={explorerUrl(active, linkCluster)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            {shortAddress(active)} ↗
          </a>
          <span>on {linkCluster}</span>
          {cluster ? (
            <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
              {cluster === "mainnet-beta" ? "mainnet" : cluster}
            </span>
          ) : null}
        </p>
      ) : null}

      {valuation.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-5 text-[13px] leading-5 text-ink"
        >
          {priceMessage()}
        </p>
      ) : null}

      {view ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_318px] lg:items-start">
          <section aria-labelledby="fair-value" className={`${PANEL} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <p id="fair-value" className={LABEL}>
                  Fair value · {scenarioName}
                </p>
                <p
                  aria-live="polite"
                  className="tnum mt-1.5 text-[34px] font-semibold leading-none tracking-tight text-ink"
                >
                  {usd(perShare, 6)}
                </p>
                <p className="mt-1.5 text-[13px] text-muted">per share</p>
              </div>
              <dl className="flex gap-7">
                <div>
                  <dt className={LABEL}>Present value</dt>
                  <dd className="tnum mt-1 text-[15px] text-ink">
                    {compactUsd(selected?.presentValueUsd)}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>Payback</dt>
                  <dd className="tnum mt-1 text-[15px] text-ink">
                    {selected ? `${selected.paybackDays} days` : UNKNOWN}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>APR at fair value</dt>
                  <dd className="tnum mt-1 text-[15px] text-ink">
                    {pct(view.impliedAprAtFairValue, 1)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium text-ink">Daily fees</h2>
              <Segmented
                label="Fit window"
                value={windowDays}
                options={WINDOWS.map((days) => ({ value: days, label: `${days}d` }))}
                onChange={setWindowDays}
              />
            </div>
            {series.data ? (
              <div className="mt-1.5">
                <FeeChart
                  days={series.data.series.days}
                  feesUsd={series.data.series.feesUsd}
                  theme="dark"
                  height={190}
                />
              </div>
            ) : (
              <div className="mt-1.5 h-[190px] animate-pulse rounded-lg bg-canvas motion-reduce:animate-none" />
            )}
            <p className="mt-2 text-[11px] leading-4 text-muted">
              Trailing {windowDays} days. The decay rate is fitted to this same window, so the fair
              value above moves when you change it.
            </p>
          </section>

          <aside aria-label="Your assumptions" className={`${PANEL} p-4 sm:p-5 lg:sticky lg:top-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[13px] font-medium text-ink">Your assumptions</h2>
              <button
                type="button"
                onClick={reset}
                disabled={!touched}
                className="text-[11px] text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 disabled:opacity-40 disabled:no-underline"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 space-y-5">
              <ValueSlider
                label="Liquidity share"
                value={Math.round(assumptions.liquidityShare * 100)}
                min={1}
                max={100}
                onChange={(percent) => change({ liquidityShare: percent / 100 })}
                format={(percent) => `${percent}%`}
                minLabel="1%"
                maxLabel="100%"
                hint="How much of the position's fees this share owns."
              />
              <ValueSlider
                label="Required return"
                value={Math.round(assumptions.discountRate * 100)}
                min={0}
                max={100}
                onChange={(percent) => change({ discountRate: percent / 100 })}
                format={(percent) => `${percent}% / yr`}
                minLabel="0%"
                maxLabel="100%"
                hint="The yearly return you demand before the stream is worth buying."
              />
              <ValueSlider
                label="Protocol fee"
                value={assumptions.protocolFeeBps}
                min={0}
                max={1000}
                step={25}
                onChange={(bps) => change({ protocolFeeBps: bps })}
                format={(bps) => `${bps} bps`}
                minLabel="0"
                maxLabel="1,000"
                hint="Taken off the top of every fee before holders are paid."
              />
            </div>

            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-4 text-muted">
              {moved ? (
                <>
                  At these assumptions the pool is worth{" "}
                  <span className="tnum text-ink">{compactUsd(after)}</span> instead of{" "}
                  <span className="tnum text-ink">{compactUsd(before)}</span> — the model&apos;s
                  default.
                </>
              ) : (
                <>Every control re-prices the pool; the figure on the left follows.</>
              )}
            </p>
          </aside>
        </div>
      ) : null}

      {view ? (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium text-ink">Cases</h2>
              <Segmented
                label="Case"
                value={scenarioName}
                options={CASES}
                onChange={(next) => setScenarioName(next)}
              />
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {view.scenarios.map((row) => {
                const active = row.scenario.name === scenarioName;
                return (
                  <li key={row.scenario.name}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setScenarioName(row.scenario.name)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 motion-reduce:transition-none ${
                        active
                          ? "border-ink/40 bg-panel"
                          : "border-line bg-panel/50 hover:border-muted"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium capitalize text-ink">
                          {row.scenario.name}
                        </span>
                        <span className="tnum text-[13px] text-ink">
                          {usd(row.fairValuePerShareUsd, 6)}
                        </span>
                      </span>
                      <span className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-muted">
                        <span className="tnum">{pct(row.scenario.lambda, 2)}/day decay</span>
                        <span className="tnum">
                          {row.scenario.volumeMultiplier.toFixed(2)}× volume
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[13px] font-medium text-ink">Risk</h2>
            <div className="[&_ul]:justify-start">
              <RiskFlags flags={view.riskFlags} />
            </div>
          </section>
        </>
      ) : null}

      {ladder.data ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[13px] font-medium text-ink">
              Planned ask ladder · {scenarioName}
            </h2>
            <p className="tnum text-[11px] text-muted">
              {ladder.data.plan.bins.length} bins · {usd(ladder.data.plan.rangeLowUsd, 6)} –{" "}
              {usd(ladder.data.plan.rangeHighUsd, 6)} · avg{" "}
              {usd(ladder.data.plan.weightedAveragePriceUsd, 6)}
            </p>
          </div>
          <div className={`${PANEL} p-3`}>
            <LadderHistogram bins={ladder.data.plan.bins} />
          </div>
          <details className="text-[12px]">
            <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
              See the exact bins
            </summary>
            <div className="mt-2 overflow-hidden rounded-lg border border-line">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-panel">
                  <tr>
                    <th className="border-b border-line px-3 py-2 font-medium text-muted">Bin</th>
                    <th className="border-b border-line px-3 py-2 text-right font-medium text-muted">
                      Price
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right font-medium text-muted">
                      Shares
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.data.plan.bins.map((bin) => (
                    <tr key={bin.index}>
                      <td className="border-b border-line/60 px-3 py-1.5 text-ink">{bin.index}</td>
                      <td className="tnum border-b border-line/60 px-3 py-1.5 text-right text-ink">
                        {usd(bin.priceUsd, 6)}
                      </td>
                      <td className="tnum border-b border-line/60 px-3 py-1.5 text-right text-ink">
                        {Math.round(bin.shares)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted">
              A plan rather than a live market: this is the ladder a sale would list around the{" "}
              {scenarioName} case price.
            </p>
          </details>
        </section>
      ) : null}
    </div>
  );
}
