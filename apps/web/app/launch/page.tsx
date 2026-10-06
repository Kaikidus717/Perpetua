"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { api } from "@/lib/api";
import { CARD, CARD_MUTED, INPUT, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface Form {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
}

const FIELDS: Array<{ key: keyof Form; label: string; hint: string }> = [
  { key: "creatorTradingFeePct", label: "Creator trading fee %", hint: "0–50" },
  { key: "creatorLiquidityPct", label: "Creator liquidity %", hint: "share of the LP" },
  { key: "partnerLiquidityPct", label: "Partner liquidity %", hint: "share of the LP" },
  { key: "lockedPct", label: "Permanently locked %", hint: "min 10" },
];

export default function LaunchPage() {
  const [form, setForm] = useState<Form>({
    creatorTradingFeePct: 10,
    creatorLiquidityPct: 40,
    partnerLiquidityPct: 40,
    lockedPct: 20,
  });

  const preset = useQuery({
    queryKey: ["preset", form],
    queryFn: () => api.preset(form),
  });

  return (
    <div className={PAGE}>
      <PageHeader
        title="Launch a pool people can fund"
        description="This page builds a DBC preset you can review before you create anything on-chain: DAMM v2 migration, quote-only fee collection, non-compounding fees and a permanently locked liquidity floor. Nothing is deployed from here."
      />

      <section className={`${CARD} grid gap-4 p-5 sm:grid-cols-2`}>
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

      <Section title="Preset check" description="What the preset would look like once you run it.">
        {preset.data?.validation.valid ? (
          <p className="text-sm text-ink">Preset is valid and can be securitized.</p>
        ) : null}
        {preset.data && !preset.data.validation.valid ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-warn">
            {preset.data.validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {preset.data ? (
          <pre className={`${CARD_MUTED} overflow-x-auto p-4 text-xs text-ink`}>
            {JSON.stringify(preset.data.preset, null, 2)}
          </pre>
        ) : null}
      </Section>

      <Section title="How the launch runs">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>
            A wizard calls <code className="font-mono text-xs">create_config</code> and{" "}
            <code className="font-mono text-xs">create_pool</code> on DBC, then waits for
            graduation.
          </li>
          <li>
            After migration, the creator and partner position NFTs are discovered and handed to the
            Create shares page.
          </li>
        </ol>
        <p className="text-xs text-muted">
          Signing runs through{" "}
          <code className="font-mono">packages/sdk/scripts/create-vault.ts</code>, so keys never
          leave the operator machine.
        </p>
      </Section>
    </div>
  );
}
