"use client";

import { Stat } from "@/components/Stat";
import { VaultTable } from "@/components/VaultTable";
import { api } from "@/lib/api";
import { compactUsd } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function ExplorePage() {
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Fee-rights exchange</h1>
        <p className="max-w-3xl text-slate-400">
          Perpetua turns the trading-fee stream of a permanently locked Meteora DAMM v2 position
          into a tradable asset: the position NFT is handed to a vault PDA, a fixed supply of
          fee-share tokens is minted, and holders stake to earn the real token fees the position
          keeps earning.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vaults" value={String(stats.data?.stats.vaults ?? 0)} />
        <Stat
          label="Positions securitized"
          value={String(stats.data?.stats.positionsSecuritized ?? 0)}
        />
        <Stat
          label="Fees distributed"
          value={compactUsd(stats.data?.stats.feesDistributedUsd ?? 0)}
        />
        <Stat label="Unique stakers" value={String(stats.data?.stats.uniqueStakers ?? 0)} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Vaults</h2>
          <Link href="/terminal" className="text-sm text-accent">
            price any pool →
          </Link>
        </div>
        {vaults.isPending ? (
          <div className="rounded-lg border border-edge bg-panel p-6 text-sm text-slate-400">
            loading vaults…
          </div>
        ) : null}
        {vaults.isError ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-200">
            Could not reach the indexer API. Start it with{" "}
            <code className="font-mono">pnpm --filter @perpetua/api dev</code>.
          </div>
        ) : null}
        {vaults.data ? <VaultTable vaults={vaults.data.vaults} /> : null}
      </section>
    </div>
  );
}
