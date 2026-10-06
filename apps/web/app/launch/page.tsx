"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { api } from "@/lib/api";
import { CARD, CARD_MUTED, INPUT, PAGE, TD, TD_RIGHT, TH, TH_RIGHT } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface Form {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
}

const FIELDS: Array<{ key: keyof Form; label: string; hint: string }> = [
  {
    key: "creatorTradingFeePct",
    label: "Your cut of every trading fee",
    hint: "percent of each swap fee that comes to you, up to 50",
  },
  {
    key: "creatorLiquidityPct",
    label: "Your share of the pool",
    hint: "percent of the liquidity that is yours",
  },
  {
    key: "partnerLiquidityPct",
    label: "Your partner's share",
    hint: "percent of the liquidity that is theirs",
  },
  {
    key: "lockedPct",
    label: "Locked away forever",
    hint: "at least 10 — this is the part that can become shares",
  },
];

export default function LaunchPage() {
  const [form, setForm] = useState<Form>({
    creatorTradingFeePct: 10,
    creatorLiquidityPct: 40,
    partnerLiquidityPct: 40,
    lockedPct: 20,
  });

  const preset = useQuery({ queryKey: ["preset", form], queryFn: () => api.preset(form) });

  const allocated = form.creatorLiquidityPct + form.partnerLiquidityPct + form.lockedPct;
  const addsUp = Math.abs(allocated - 100) < 1e-6;
  const valid = preset.data?.validation.valid ?? false;

  const rows = [
    {
      label: "You",
      note: "yours, and you can take it out whenever",
      value: form.creatorLiquidityPct,
    },
    {
      label: "Your partner",
      note: "theirs, and they can take it out whenever",
      value: form.partnerLiquidityPct,
    },
    {
      label: "Locked away",
      note: "nobody can ever withdraw this",
      value: form.lockedPct,
    },
  ];

  return (
    <div className={PAGE}>
      <PageHeader
        title="Plan a launch"
        description="Work out how a new pool's trading fees and liquidity would be divided before you commit to anything. This is a plan, not a deployment — nothing is created on-chain from this page."
      />

      <section className={`${CARD} grid gap-5 p-5 sm:grid-cols-2`}>
        {FIELDS.map((field) => (
          <label key={field.key} className="space-y-1 text-sm">
            <span className="text-ink">{field.label}</span>
            <input
              type="number"
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: Number(event.target.value) })}
              className={INPUT}
            />
            <span className="block text-xs text-muted">{field.hint}</span>
          </label>
        ))}
      </section>

      <Section
        title="Where the liquidity goes"
        description="The pool's liquidity is divided three ways. These three have to add up to 100%."
      >
        <div className={`${CARD_MUTED} overflow-hidden`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-panel">
              <tr>
                <th className={TH}>Goes to</th>
                <th className={TH}>What that means</th>
                <th className={TH_RIGHT}>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className={TD}>{row.label}</td>
                  <td className={`${TD} text-muted`}>{row.note}</td>
                  <td className={TD_RIGHT}>{row.value}%</td>
                </tr>
              ))}
              <tr>
                <td className={`${TD} font-medium`}>Total</td>
                <td className={`${TD} ${addsUp ? "text-muted" : "text-warn"}`}>
                  {addsUp ? "adds up to 100%" : "has to add up to 100%"}
                </td>
                <td className={`${TD_RIGHT} ${addsUp ? "" : "text-warn"}`}>{allocated}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink">
          On top of the liquidity, you keep{" "}
          <span className="font-medium">{form.creatorTradingFeePct}%</span> of every fee the pool's
          swaps generate.
        </p>
      </Section>

      <Section
        title="Does this plan work?"
        description="Checked against the rules a launch has to satisfy."
      >
        {preset.isPending ? <p className="text-sm text-muted">Checking…</p> : null}
        {preset.data && valid ? (
          <p className="text-sm text-ink">
            This plan works. The locked share is big enough to be turned into tradable shares later.
          </p>
        ) : null}
        {preset.data && !valid ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-warn">
            {preset.data.validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Why part of it has to be locked">
        <p className="text-sm leading-6 text-ink">
          Liquidity that is locked away can never be withdrawn — not by you, not by your partner,
          not by anyone, ever. That is what makes a pool's fee stream worth buying: the fees keep
          arriving because the liquidity cannot walk away. Once a pool is running with a locked
          share, that share's future fees can be split into pieces people can buy on the Create
          shares page.
        </p>
      </Section>
    </div>
  );
}
