"use client";

import { Stat } from "@/components/Stat";
import { API_URL, api } from "@/lib/api";
import { compactUsd } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";

export default function KpiPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Live KPIs</h1>
        <p className="text-slate-400">
          Numbers come straight from the indexer at{" "}
          <code className="font-mono text-xs">{API_URL}</code>. Every figure links back to on-chain
          accounts.
        </p>
      </section>

      {stats.isError ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-200">
          Indexer API unreachable. Start it with{" "}
          <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Vaults" value={String(stats.data?.stats.vaults ?? 0)} />
        <Stat
          label="Positions securitized"
          value={String(stats.data?.stats.positionsSecuritized ?? 0)}
        />
        <Stat
          label="USD fees distributed"
          value={compactUsd(stats.data?.stats.feesDistributedUsd ?? 0)}
        />
        <Stat label="Unique stakers" value={String(stats.data?.stats.uniqueStakers ?? 0)} />
        <Stat label="DLMM volume" value={compactUsd(stats.data?.stats.dlmmVolumeUsd ?? 0)} />
        <Stat label="Share tokens live" value={String(vaults.data?.vaults.length ?? 0)} />
      </section>
    </div>
  );
}
