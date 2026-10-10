"use client";

import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, count } from "@/lib/format";
import { CARD_MUTED, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";

/// These numbers are meant to be live, so re-read them while the page is open.
const LIVE_MS = 15_000;

export default function StatsPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: LIVE_MS });
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults, refetchInterval: LIVE_MS });
  const offline = stats.isError || vaults.isError;

  return (
    <div className={PAGE}>
      <PageHeader title="Stats" />

      {offline ? (
        <div className={`${CARD_MUTED} px-6 py-8 text-center text-sm text-muted`}>
          Live figures are unavailable right now. Everything here fills back in as soon as the
          connection returns.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Vaults" value={count(stats.data?.stats.vaults)} />
        <Stat label="Positions securitized" value={count(stats.data?.stats.positionsSecuritized)} />
        <Stat label="USD fees paid out" value={compactUsd(stats.data?.stats.feesDistributedUsd)} />
        <Stat label="Holders" value={count(stats.data?.stats.uniqueStakers)} />
        <Stat label="Trading volume" value={compactUsd(stats.data?.stats.dlmmVolumeUsd)} />
        <Stat label="Share tokens live" value={count(vaults.data?.vaults.length)} />
      </div>
    </div>
  );
}
