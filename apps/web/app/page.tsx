"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { VaultTable } from "@/components/VaultTable";
import { api } from "@/lib/api";
import { compactUsd } from "@/lib/format";
import { CARD_MUTED, LINK, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function VaultsPage() {
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  return (
    <div className={PAGE}>
      <PageHeader
        title="Own a slice of a pool's fees"
        description="Some Meteora pools are locked forever, so the trading fees they earn keep arriving. Perpetua splits that income into 1,000,000 shares. Buy shares, stake them, and collect your cut of every swap."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vaults" value={String(stats.data?.stats.vaults ?? 0)} />
        <Stat
          label="Positions securitized"
          value={String(stats.data?.stats.positionsSecuritized ?? 0)}
        />
        <Stat label="Fees paid out" value={compactUsd(stats.data?.stats.feesDistributedUsd ?? 0)} />
        <Stat label="Holders" value={String(stats.data?.stats.uniqueStakers ?? 0)} />
      </div>

      <Section
        title="Live vaults"
        description="One row per locked position that has been turned into shares."
      >
        {vaults.isPending ? (
          <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
            Loading vaults…
          </div>
        ) : null}
        {vaults.isError ? (
          <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
            Cannot reach the indexer API. Start it with{" "}
            <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
          </div>
        ) : null}
        {vaults.data ? <VaultTable vaults={vaults.data.vaults} /> : null}
        <p className="text-center text-sm text-muted">
          Not sure what a fee stream is worth?{" "}
          <Link href="/terminal" className={LINK}>
            Price any pool
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
