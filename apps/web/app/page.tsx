"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { VaultTable } from "@/components/VaultTable";
import { api } from "@/lib/api";
import { compactUsd, count } from "@/lib/format";
import { CARD_MUTED, LINK, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

/// These numbers are meant to be live, so re-read them while the page is open.
const LIVE_MS = 15_000;

export default function VaultsPage() {
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults, refetchInterval: LIVE_MS });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: LIVE_MS });
  const offline = stats.isError || vaults.isError;

  return (
    <div className={PAGE}>
      <PageHeader
        title="Own a slice of a pool's fees"
        description="Some Meteora pools are locked forever, so the trading fees they earn keep arriving. Perpetua splits that income into 1,000,000 shares. Buy shares, stake them, and collect your cut of every swap."
      />

      {offline ? (
        <div className={`${CARD_MUTED} px-6 py-8 text-center text-sm text-muted`}>
          Cannot reach the indexer API, so nothing below is live. Start it with{" "}
          <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vaults" value={count(stats.data?.stats.vaults)} />
        <Stat label="Positions securitized" value={count(stats.data?.stats.positionsSecuritized)} />
        <Stat label="Fees paid out" value={compactUsd(stats.data?.stats.feesDistributedUsd)} />
        <Stat label="Holders" value={count(stats.data?.stats.uniqueStakers)} />
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
