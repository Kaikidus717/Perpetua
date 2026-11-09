"use client";

import { Donut } from "@/components/Donut";
import { LaunchDeploy } from "@/components/LaunchDeploy";
import { LaunchPreview } from "@/components/LaunchPreview";
import { PageHeader } from "@/components/PageHeader";
import { ValueSlider } from "@/components/ValueSlider";
import { api } from "@/lib/api";
import { useNetwork } from "@/lib/cluster";
import { money } from "@/lib/format";
import { BUTTON_PRIMARY, CARD, EYEBROW, META, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface Form {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
}

const DEFAULTS: Form = {
  creatorTradingFeePct: 10,
  creatorLiquidityPct: 40,
  partnerLiquidityPct: 40,
  lockedPct: 20,
};

const DEFAULT_VOLUME = 20_000;
const DEFAULT_FEE_BPS = 30;

export default function LaunchPage() {
  const [form, setForm] = useState<Form>(DEFAULTS);
  /// Two halves of one job: work out the split, then create it. The choice is a mode, not a route —
  /// the plan stays on this page so a creator can step back and adjust before signing.
  const [mode, setMode] = useState<"plan" | "deploy">("plan");

  /// The step is deep-linkable — `/launch?step=deploy` opens straight on the form — and it is read on
  /// mount rather than during render, so the server and the browser agree on the first paint.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("step") === "deploy") setMode("deploy");
  }, []);

  function choose(next: "plan" | "deploy") {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    window.history.replaceState(null, "", url.toString());
  }
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [feeBps, setFeeBps] = useState(DEFAULT_FEE_BPS);
  const { network } = useNetwork();

  const preset = useQuery({ queryKey: ["preset", form], queryFn: () => api.preset(form) });

  const allocated = form.creatorLiquidityPct + form.partnerLiquidityPct + form.lockedPct;
  const addsUp = Math.abs(allocated - 100) < 1e-6;
  const valid = preset.data?.validation.valid ?? false;

  function set<K extends keyof Form>(key: K, value: number) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /// Puts the remainder in the locked share: the two liquidity shares are the ones a creator is
  /// deciding between, and the locked part is what is left over — and what becomes tradable shares.
  function balance() {
    setForm((current) => ({
      ...current,
      lockedPct: Math.max(
        0,
        Math.round((100 - current.creatorLiquidityPct - current.partnerLiquidityPct) * 10) / 10,
      ),
    }));
  }

  /// Your share of the fees, from the three numbers on this page: what the pool trades, what it
  /// charges, and the cut you keep.
  const perDay = volume * (feeBps / 10_000) * (form.creatorTradingFeePct / 100);
  const horizons = [
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
    { days: 365, label: "1 year" },
  ].map((row) => ({ ...row, value: perDay * row.days }));
  const largest = Math.max(...horizons.map((row) => row.value), 1);

  const parts = [
    { label: "You", value: form.creatorLiquidityPct },
    { label: "Partner", value: form.partnerLiquidityPct },
    { label: "Locked", value: form.lockedPct },
  ];

  return (
    <div className={PAGE}>
      <PageHeader
        title={mode === "plan" ? "Plan a launch" : "Deploy a launch"}
        description={
          mode === "plan"
            ? "Split the pool's liquidity, watch what your cut of the fees would be, then deploy it."
            : "Create the token and its pool with the split you planned — one signature, one transaction."
        }
        actions={
          <span className={META}>
            Deploying on{" "}
            <span className="text-ink">{network === "mainnet-beta" ? "main" : network}</span>
          </span>
        }
      />

      {/* The two halves, as cards: one is a decision, the other is a signature. They are the first
          thing on the page because that is the actual order of the work. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            id: "plan" as const,
            step: "Step 1",
            title: "Plan a launch",
            body: "Split the liquidity and see what your cut of the fees would be, at your own assumptions.",
          },
          {
            id: "deploy" as const,
            step: "Step 2",
            title: "Deploy a launch",
            body: "Create the token, its metadata and its bonding-curve pool with the split you chose.",
          },
        ].map((card) => {
          const active = mode === card.id;
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={active}
              onClick={() => choose(card.id)}
              className={`relative rounded-xl border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ${
                active ? "border-accent/60 bg-panel" : "border-line bg-panel/40 hover:border-muted"
              }`}
            >
              <span className="text-[11px] text-muted">{card.step}</span>
              <span className="mt-1.5 block text-[15px] font-semibold tracking-tight text-ink">
                {card.title}
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-muted">{card.body}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-accent"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {mode === "plan" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${CARD} space-y-5 p-4 sm:p-5`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">The split</h2>
                <button
                  type="button"
                  onClick={balance}
                  className="text-[11px] text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
                >
                  Balance to 100%
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <Donut parts={parts} value={`${form.lockedPct}%`} caption="locked → shares" />
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {parts.map((part, index) => (
                    <li
                      key={part.label}
                      className="flex items-center justify-between gap-3 text-[12px]"
                    >
                      <span className="flex items-center gap-2 text-muted">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-sm bg-ink"
                          style={{ opacity: [1, 0.55, 0.25][index] }}
                        />
                        {part.label}
                      </span>
                      <span className="tnum text-ink">{part.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <ValueSlider
                  label="Your liquidity"
                  value={form.creatorLiquidityPct}
                  min={0}
                  max={100}
                  onChange={(value) => set("creatorLiquidityPct", value)}
                  format={(value) => `${value}%`}
                  minLabel="0%"
                  maxLabel="100%"
                />
                <ValueSlider
                  label="Partner's liquidity"
                  value={form.partnerLiquidityPct}
                  min={0}
                  max={100}
                  onChange={(value) => set("partnerLiquidityPct", value)}
                  format={(value) => `${value}%`}
                  minLabel="0%"
                  maxLabel="100%"
                />
                <ValueSlider
                  label="Locked forever"
                  value={form.lockedPct}
                  min={0}
                  max={100}
                  onChange={(value) => set("lockedPct", value)}
                  format={(value) => `${value}%`}
                  minLabel="0%"
                  maxLabel="100%"
                />
                <ValueSlider
                  label="Your cut of every fee"
                  value={form.creatorTradingFeePct}
                  min={0}
                  max={50}
                  onChange={(value) => set("creatorTradingFeePct", value)}
                  format={(value) => `${value}%`}
                  minLabel="0%"
                  maxLabel="50%"
                />
              </div>

              <output className={`${META} block ${addsUp ? "" : "text-warn"}`}>
                {addsUp ? "Adds up to 100%." : `Adds up to ${allocated}% — needs to be 100%.`}
              </output>
            </section>

            <section className={`${CARD} space-y-5 p-4 sm:p-5`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">
                  Your cut, at your assumptions
                </h2>
                <span className={META}>not a forecast</span>
              </div>

              <div className="space-y-4">
                <ValueSlider
                  label="Pool volume per day"
                  value={volume}
                  min={1000}
                  max={200000}
                  step={1000}
                  onChange={setVolume}
                  format={(value) => money(value)}
                  minLabel="$1K"
                  maxLabel="$200K"
                />
                <ValueSlider
                  label="Swap fee"
                  value={feeBps}
                  min={1}
                  max={100}
                  step={1}
                  onChange={setFeeBps}
                  format={(value) => `${value} bps`}
                  minLabel="1"
                  maxLabel="100"
                />
              </div>

              <div className="space-y-3">
                <p className={META}>You would keep</p>
                <ul className="space-y-2.5">
                  {horizons.map((row) => (
                    <li key={row.days}>
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="text-muted">{row.label}</span>
                        <span className="tnum font-medium text-ink">{money(row.value)}</span>
                      </div>
                      {/* Data, not a control: the bars stay in ink so the accent keeps meaning "you can
                      act on this". */}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-ink/80"
                          style={{ width: `${Math.max((row.value / largest) * 100, 1.5)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className={META}>
                  {money(perDay)} a day at ${Math.round(volume).toLocaleString("en-US")} of volume
                  and {feeBps} bps, keeping {form.creatorTradingFeePct}% of the fee.
                </p>
              </div>

              <div className="space-y-2 border-t border-line pt-4">
                <p className="text-[12px] font-medium text-ink">Does the plan work?</p>
                {preset.isPending ? <p className={META}>Checking…</p> : null}
                {preset.isError ? (
                  <p className="text-[12px] leading-5 text-warn">
                    Couldn&apos;t check this plan — the API isn&apos;t answering. Nothing you typed
                    is lost; try again in a moment.
                  </p>
                ) : null}
                {preset.data && valid && addsUp ? (
                  <p className="text-[12px] leading-5 text-ink">
                    Yes — the locked share is big enough to become tradable shares later.
                  </p>
                ) : null}
                {preset.data && (!valid || !addsUp) ? (
                  <ul className="space-y-1 text-[12px] leading-5 text-warn">
                    {!addsUp ? <li>The three liquidity shares have to add up to 100%.</li> : null}
                    {preset.data.validation.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          </div>
          {/* The plan is a decision; this is how a creator acts on it without hunting for the step. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4">
            <p className="text-[12px] leading-5 text-muted">
              Happy with the split? The next step creates the token and its pool on{" "}
              <span className="text-ink">{network === "mainnet-beta" ? "mainnet" : network}</span>.
            </p>
            <button
              type="button"
              onClick={() => choose("deploy")}
              disabled={!addsUp || !valid}
              className={BUTTON_PRIMARY}
            >
              Deploy this plan
            </button>
          </div>
        </>
      ) : (
        /* Deploy: the form on the left, the shape of what it creates on the right. */
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <LaunchDeploy
            creatorTradingFeePct={form.creatorTradingFeePct}
            creatorLiquidityPct={form.creatorLiquidityPct}
            partnerLiquidityPct={form.partnerLiquidityPct}
            lockedPct={form.lockedPct}
            cluster={network}
          />
          <LaunchPreview
            parts={parts}
            lockedPct={form.lockedPct}
            creatorTradingFeePct={form.creatorTradingFeePct}
            network={network}
            perDay={perDay}
          />
        </div>
      )}
    </div>
  );
}
