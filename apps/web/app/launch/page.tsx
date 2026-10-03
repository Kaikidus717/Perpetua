"use client";

import { api } from "@/lib/api";
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
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Financeable launch</h1>
        <p className="max-w-3xl text-slate-400">
          Launch on DBC with a preset built for securitization: DAMM v2 migration, quote-only fee
          collection, non-compounding fees and a permanently locked liquidity floor. Graduate, then
          carry the creator position into the vault.
        </p>
      </section>

      <section className="grid gap-4 rounded-lg border border-edge bg-panel p-5 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="space-y-1 text-sm">
            <span className="text-slate-300">{field.label}</span>
            <input
              type="number"
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: Number(event.target.value) })}
              className="w-full rounded-lg border border-edge bg-ink px-3 py-2 outline-none focus:border-accent"
            />
            <span className="block text-xs text-slate-500">{field.hint}</span>
          </label>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Preset check</h2>
        {preset.data?.validation.valid ? (
          <p className="text-sm text-accent">preset is valid and securitizable</p>
        ) : null}
        {preset.data && !preset.data.validation.valid ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-300">
            {preset.data.validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {preset.data ? (
          <pre className="overflow-x-auto rounded-lg border border-edge bg-panel p-4 text-xs text-slate-300">
            {JSON.stringify(preset.data.preset, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border border-edge bg-panel p-5 text-sm text-slate-400">
        <h2 className="text-lg font-semibold text-slate-100">Wizard</h2>
        <p>
          The wizard calls <code className="font-mono text-xs">create_config</code> and{" "}
          <code className="font-mono text-xs">create_pool</code> on DBC, then waits for graduation.
          Once the migration runs, the creator and partner position NFTs are discovered and handed
          to the Securitize page.
        </p>
      </section>
    </div>
  );
}
