"use client";

import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd } from "@/lib/format";
import { CARD_MUTED, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";

export default function StatsPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });

  return (
    <div className={PAGE}>
      <PageHeader title="Stats" />

      {stats.isError ? (
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          Indexer API unreachable. Start it with{" "}
          <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Vaults" value={String(stats.data?.stats.vaults ?? 0)} />
        <Stat
          label="Positions securitized"
          value={String(stats.data?.stats.positionsSecuritized ?? 0)}
        />
        <Stat
          label="USD fees paid out"
          value={compactUsd(stats.data?.stats.feesDistributedUsd ?? 0)}
        />
        <Stat label="Holders" value={String(stats.data?.stats.uniqueStakers ?? 0)} />
        <Stat label="DLMM volume" value={compactUsd(stats.data?.stats.dlmmVolumeUsd ?? 0)} />
        <Stat label="Share tokens live" value={String(vaults.data?.vaults.length ?? 0)} />
      </div>
    </div>
  );
}
