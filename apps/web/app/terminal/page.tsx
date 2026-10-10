"use client";

import { FeeChart } from "@/components/FeeChart";
import { PageHeader } from "@/components/PageHeader";
import { RiskFlags } from "@/components/RiskFlags";
import { Spinner } from "@/components/Spinner";
import { Stat } from "@/components/Stat";
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
import {
  BUTTON_PRIMARY,
  CARD_MUTED,
  INPUT_MONO,
  LINK,
  PAGE,
  TD,
  TD_RIGHT,
  TH,
  TH_RIGHT,
} from "@/lib/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function TerminalPage() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const active = submitted;

  const valuation = useQuery({
    queryKey: ["valuation", active],
    queryFn: () => (active ? api.valuation(active) : Promise.reject(new Error("no pool"))),
    enabled: Boolean(active),
    /// Keep the last pool's numbers on screen while the next one loads, instead of blanking the page.
    placeholderData: keepPreviousData,
  });
  const series = useQuery({
    queryKey: ["series", active],
    queryFn: () => (active ? api.series(active) : Promise.reject(new Error("no pool"))),
    enabled: Boolean(active),
    placeholderData: keepPreviousData,
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const baseScenario = valuation.data?.valuation.scenarios.find((s) => s.scenario.name === "base");
  const ladder = useQuery({
    queryKey: ["ladder", fairValue],
    queryFn: () => (fairValue ? api.ladder(fairValue) : Promise.reject(new Error("no price"))),
    enabled: Boolean(fairValue),
    placeholderData: keepPreviousData,
  });
  const location = useQuery({
    queryKey: ["where", active],
    queryFn: () => (active ? api.where(active) : Promise.reject(new Error("no address"))),
    enabled: Boolean(active),
    placeholderData: keepPreviousData,
  });

  /// Anything still in flight, so the spinner next to the address spins until the answer lands and
  /// the figures below have settled.
  const loading =
    location.isFetching || valuation.isFetching || series.isFetching || ladder.isFetching;

  /// Which cluster the address lives on, and what it is. Fee history is indexed on mainnet only, so a
  /// devnet pool is a real pool that simply cannot be priced — a different sentence from "no such
  /// address", and the difference is exactly what a visitor needs to hear.
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

  return (
    <div className={PAGE}>
      <PageHeader
        title="Pricing"
        description="Price any pool without a wallet. The model fits a decay rate to the trailing fee series and discounts a 365-day projection into a bear / base / bull range. Fee history comes from Meteora's mainnet data API, so pool links open on Solscan mainnet."
      />

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(input.trim() || null);
        }}
      >
        <div className="relative min-w-[22rem] flex-1">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label="Pool address to price"
            placeholder="pool address"
            className={`${INPUT_MONO} pr-10`}
          />
          {loading ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner label="Pricing this pool" />
            </span>
          ) : null}
        </div>
        <button type="submit" className={BUTTON_PRIMARY}>
          Price
        </button>
      </form>

      {!active ? (
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          Paste a Meteora pool address to price the fees it earns.
        </div>
      ) : null}

      {active ? (
        <p className="text-center text-sm text-muted">
          {kind ? `${kind} · ` : ""}
          <a
            href={explorerUrl(active, linkCluster)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${LINK}`}
          >
            {shortAddress(active)} ↗
          </a>{" "}
          <span className="text-xs">on Solscan, {linkCluster}</span>
          {cluster ? (
            <span className="ml-2 rounded-sm border border-line bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
              {cluster === "mainnet-beta" ? "mainnet" : cluster}
            </span>
          ) : null}
        </p>
      ) : null}

      {valuation.isError ? (
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          {priceMessage()}
        </div>
      ) : null}

      {valuation.data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Fair value (base)"
              value={compactUsd(valuation.data.valuation.fairValueUsd)}
              hint={`${usd(valuation.data.valuation.fairValuePerShareUsd, 6)} per share`}
            />
            <Stat
              label="Range"
              value={`${compactUsd(valuation.data.valuation.fairValueRangeUsd.low)} – ${compactUsd(
                valuation.data.valuation.fairValueRangeUsd.high,
              )}`}
              hint="bear … bull"
            />
            <Stat
              label="Implied APR at fair value"
              value={pct(valuation.data.valuation.impliedAprAtFairValue, 1)}
            />
            <Stat
              label="Payback (base)"
              value={baseScenario ? `${baseScenario.paybackDays} days` : UNKNOWN}
            />
          </section>

          <section className="space-y-3 text-center">
            <h2 className="text-base font-semibold text-ink">Risk flags</h2>
            <RiskFlags flags={valuation.data.valuation.riskFlags} />
          </section>

          <section className="space-y-4">
            <h2 className="text-center text-base font-semibold text-ink">Scenarios</h2>
            <div className={`${CARD_MUTED} overflow-hidden`}>
              <table className="w-full text-left text-sm">
                <thead className="bg-panel">
                  <tr>
                    <th className={TH}>Scenario</th>
                    <th className={TH_RIGHT}>Daily decay</th>
                    <th className={TH_RIGHT}>Volume multiple</th>
                    <th className={TH_RIGHT}>Present value</th>
                    <th className={TH_RIGHT}>Payback</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.data.valuation.scenarios.map((scenario) => (
                    <tr key={scenario.scenario.name}>
                      <td className={`${TD} capitalize`}>{scenario.scenario.name}</td>
                      <td className={TD_RIGHT}>{pct(scenario.scenario.lambda, 2)}</td>
                      <td className={TD_RIGHT}>{scenario.scenario.volumeMultiplier.toFixed(2)}×</td>
                      <td className={TD_RIGHT}>{compactUsd(scenario.presentValueUsd)}</td>
                      <td className={TD_RIGHT}>{scenario.paybackDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {series.data ? (
            <section className="space-y-4">
              <h2 className="text-center text-base font-semibold text-ink">
                Trailing daily fees (USD)
              </h2>
              <FeeChart days={series.data.series.days} feesUsd={series.data.series.feesUsd} />
            </section>
          ) : null}

          {ladder.data ? (
            <section className="space-y-4">
              <h2 className="text-center text-base font-semibold text-ink">Shares for sale</h2>
              <p className="tnum text-center text-sm text-muted">
                {ladder.data.plan.bins.length} bins · {usd(ladder.data.plan.rangeLowUsd, 6)} –{" "}
                {usd(ladder.data.plan.rangeHighUsd, 6)} · weighted average{" "}
                {usd(ladder.data.plan.weightedAveragePriceUsd, 6)}
              </p>
              <div className={`${CARD_MUTED} overflow-hidden`}>
                <table className="w-full text-left text-sm">
                  <thead className="bg-panel">
                    <tr>
                      <th className={TH}>Bin</th>
                      <th className={TH_RIGHT}>Price</th>
                      <th className={TH_RIGHT}>Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.data.plan.bins.slice(0, 8).map((bin) => (
                      <tr key={bin.index}>
                        <td className={TD}>{bin.index}</td>
                        <td className={TD_RIGHT}>{usd(bin.priceUsd, 6)}</td>
                        <td className={TD_RIGHT}>{Math.round(bin.shares)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
