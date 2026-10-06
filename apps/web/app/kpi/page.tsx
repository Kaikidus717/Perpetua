"use client";

import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, count } from "@/lib/format";
import { CARD_MUTED, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";

export default function StatsPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const offline = stats.isError || vaults.isError;

  return (
    <div className={PAGE}>
      <PageHeader title="Stats" />

      {offline ? (
        <div className={`${CARD_MUTED} px-6 py-8 text-center text-sm text-muted`}>
          Cannot reach the indexer API, so nothing here is live. Start it with{" "}
          <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Vaults" value={count(stats.data?.stats.vaults)} />
        <Stat label="Positions securitized" value={count(stats.data?.stats.positionsSecuritized)} />
        <Stat label="USD fees paid out" value={compactUsd(stats.data?.stats.feesDistributedUsd)} />
        <Stat label="Holders" value={count(stats.data?.stats.uniqueStakers)} />
        <Stat label="DLMM volume" value={compactUsd(stats.data?.stats.dlmmVolumeUsd)} />
        <Stat label="Share tokens live" value={count(vaults.data?.vaults.length)} />
      </div>
    </div>
  );
}
