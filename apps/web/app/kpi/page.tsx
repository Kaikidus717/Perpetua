"use client";

import { Meter } from "@/components/Meter";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, count, shortAddress } from "@/lib/format";
import { BUTTON, CARD, CARD_MUTED, META, PAGE } from "@/lib/ui";
import { SHARE_SUPPLY } from "@perpetua/shared";
import { useQuery } from "@tanstack/react-query";

/// These numbers are meant to be live, so re-read them while the page is open.
const LIVE_MS = 15_000;

/// Staked shares as a percentage of the 1,000,000 that exist. Base units in, percent out.
function stakedPercent(base: string): number {
  try {
    return Number((BigInt(base) * 10_000n) / SHARE_SUPPLY) / 100;
  } catch {
    return 0;
  }
}

export default function StatsPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: LIVE_MS });
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults, refetchInterval: LIVE_MS });
  const offline = stats.isError || vaults.isError;
  const degraded = stats.data?.live === false || vaults.data?.live === false;
  const totals = stats.data?.stats;
  /// The vaults with the most staked, as a shape: eight bars say more about where the supply sits
  /// than eight addresses do.
  const ranked = [...(vaults.data?.vaults ?? [])]
    .map((vault) => ({ address: vault.address, percent: stakedPercent(vault.totalStaked) }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 8);

  return (
    <div className={PAGE}>
      <PageHeader
        title="Stats"
        description="What Perpetua has done so far. These figures refresh every 15 seconds."
      />

      {offline || degraded ? (
        <output className={`${CARD_MUTED} block space-y-2 px-4 py-3 text-[13px] text-muted`}>
          <span className="block text-ink">
            {offline ? "We couldn't load the live numbers." : "Some numbers are not live."}
          </span>
          <span className="block">
            {offline ? "Check your connection and try again." : "Showing the last saved values."}
          </span>
          <button
            type="button"
            onClick={() => {
              void stats.refetch();
              void vaults.refetch();
            }}
            className={BUTTON}
          >
            Try again
          </button>
        </output>
      ) : null}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Vaults" value={count(totals?.vaults)} />
        <Stat label="Positions turned into shares" value={count(totals?.positionsSecuritized)} />
        <Stat label="Fees paid out" value={compactUsd(totals?.feesDistributedUsd)} hint="USD" />
        <Stat label="Holders" value={count(totals?.uniqueStakers)} />
        <Stat label="Trading volume" value={compactUsd(totals?.dlmmVolumeUsd)} hint="USD" />
        <Stat label="Share tokens" value={count(vaults.data?.vaults.length)} />
      </section>

      <Section
        title="Where shares are staked"
        description="Each vault's staked share of its own 1,000,000, largest first."
      >
        {ranked.length === 0 && !offline && !degraded ? (
          <p className={META}>No shares have been staked yet.</p>
        ) : ranked.length === 0 ? null : (
          <ul className={`${CARD} divide-y divide-line`}>
            {ranked.map((row) => (
              <li key={row.address} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="truncate font-mono text-[12px] text-ink">
                  {shortAddress(row.address)}
                </span>
                <Meter
                  value={row.percent}
                  label={`${Math.round(row.percent)} percent staked`}
                  width="w-28 sm:w-48"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className={`${META} max-w-xl`}>
        Every figure is read live. A value that has not arrived shows as &ldquo;&mdash;&rdquo;,
        never as zero.
      </p>
    </div>
  );
}
