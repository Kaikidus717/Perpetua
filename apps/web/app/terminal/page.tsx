"use client";

import { FeeChart } from "@/components/FeeChart";
import { RiskFlags } from "@/components/RiskFlags";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, pct, usd } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function TerminalPage() {
  const demo = useQuery({ queryKey: ["demo"], queryFn: api.demo });
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const active = submitted ?? demo.data?.pool ?? null;

  const valuation = useQuery({
    queryKey: ["valuation", active],
    queryFn: () => (active ? api.valuation(active) : Promise.reject(new Error("no pool"))),
    enabled: Boolean(active),
  });
  const series = useQuery({
    queryKey: ["series", active],
    queryFn: () => (active ? api.series(active) : Promise.reject(new Error("no pool"))),
    enabled: Boolean(active),
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const ladder = useQuery({
    queryKey: ["ladder", fairValue],
    queryFn: () => (fairValue ? api.ladder(fairValue) : Promise.reject(new Error("no price"))),
    enabled: Boolean(fairValue),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Fee yield terminal</h1>
        <p className="max-w-3xl text-slate-400">
          Price any pool without a wallet. The model fits a decay rate to the trailing fee series
          and discounts a 365-day projection into a bear / base / bull range.
        </p>
      </section>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(input.trim() || null);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          aria-label="Pool address to price"
          placeholder="pool address (leave blank for the demo pool)"
          className="min-w-[22rem] flex-1 rounded-lg border border-edge bg-panel px-4 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-medium text-accent"
        >
          Price
        </button>
      </form>

      {active ? <p className="font-mono text-xs text-slate-500">pricing {active}</p> : null}

      {valuation.isError ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-200">
          No valuation available for that pool. Check the address or that the indexer API is
          running.
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
              value={`${
                valuation.data.valuation.scenarios.find((s) => s.scenario.name === "base")
                  ?.paybackDays ?? 0
              } days`}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Risk flags</h2>
            <RiskFlags flags={valuation.data.valuation.riskFlags} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Scenarios</h2>
            <div className="overflow-hidden rounded-lg border border-edge">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Scenario</th>
                    <th className="px-4 py-3 text-right">Daily decay</th>
                    <th className="px-4 py-3 text-right">Volume multiple</th>
                    <th className="px-4 py-3 text-right">Present value</th>
                    <th className="px-4 py-3 text-right">Payback</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.data.valuation.scenarios.map((scenario) => (
                    <tr key={scenario.scenario.name} className="border-t border-edge">
                      <td className="px-4 py-3 capitalize">{scenario.scenario.name}</td>
                      <td className="px-4 py-3 text-right">{pct(scenario.scenario.lambda, 2)}</td>
                      <td className="px-4 py-3 text-right">
                        {scenario.scenario.volumeMultiplier.toFixed(2)}×
                      </td>
                      <td className="px-4 py-3 text-right">
                        {compactUsd(scenario.presentValueUsd)}
                      </td>
                      <td className="px-4 py-3 text-right">{scenario.paybackDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {series.data ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Trailing daily fees (USD)</h2>
              <FeeChart days={series.data.series.days} feesUsd={series.data.series.feesUsd} />
            </section>
          ) : null}

          {ladder.data ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">DLMM ask ladder</h2>
              <p className="text-sm text-slate-400">
                {ladder.data.plan.bins.length} bins · {usd(ladder.data.plan.rangeLowUsd, 6)} –{" "}
                {usd(ladder.data.plan.rangeHighUsd, 6)} · weighted average{" "}
                {usd(ladder.data.plan.weightedAveragePriceUsd, 6)}
              </p>
              <div className="overflow-hidden rounded-lg border border-edge">
                <table className="w-full text-left text-sm">
                  <thead className="bg-panel text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Bin</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.data.plan.bins.slice(0, 8).map((bin) => (
                      <tr key={bin.index} className="border-t border-edge">
                        <td className="px-4 py-3">{bin.index}</td>
                        <td className="px-4 py-3 text-right">{usd(bin.priceUsd, 6)}</td>
                        <td className="px-4 py-3 text-right">{Math.round(bin.shares)}</td>
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
