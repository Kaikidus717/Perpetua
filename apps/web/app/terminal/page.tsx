"use client";

import { FeeChart } from "@/components/FeeChart";
import { PageHeader } from "@/components/PageHeader";
import { RiskFlags } from "@/components/RiskFlags";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, pct, usd } from "@/lib/format";
import { BUTTON_PRIMARY, CARD_MUTED, PAGE, TD, TD_RIGHT, TH, TH_RIGHT } from "@/lib/ui";
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
    <div className={PAGE}>
      <PageHeader
        title="Pricing"
        description="Price any pool without a wallet. The model fits a decay rate to the trailing fee series and discounts a 365-day projection into a bear / base / bull range."
      />

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
          className="min-w-[22rem] flex-1 rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        <button type="submit" className={BUTTON_PRIMARY}>
          Price
        </button>
      </form>

      {active ? <p className="text-center font-mono text-xs text-muted">pricing {active}</p> : null}

      {valuation.isError ? (
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          No valuation available for that pool. Check the address, or start the API with{" "}
          <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
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
              <h2 className="text-center text-base font-semibold text-ink">DLMM ask ladder</h2>
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
