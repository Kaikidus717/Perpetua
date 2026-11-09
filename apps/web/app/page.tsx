"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { VaultTable } from "@/components/VaultTable";
import { api } from "@/lib/api";
import { compactUsd, count } from "@/lib/format";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, EYEBROW, META, NUM_LG, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

/// These numbers are meant to be live, so re-read them while the page is open.
const LIVE_MS = 15_000;

export default function VaultsPage() {
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults, refetchInterval: LIVE_MS });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: LIVE_MS });
  const offline = stats.isError || vaults.isError;
  const totals = stats.data?.stats;

  return (
    <div className={PAGE}>
      <PageHeader
        title="Own a slice of a pool's fees"
        description="Some Meteora pools are locked forever, so the fees they earn keep arriving. Perpetua turns that income into 1,000,000 shares per vault — buy them, stake them, and collect your cut of every swap."
        actions={
          <>
            <Link href="/securitize" className={BUTTON_PRIMARY}>
              Create shares
            </Link>
            <Link href="/terminal" className={BUTTON}>
              Price a pool
            </Link>
          </>
        }
      />

      {offline ? (
        <output className={`${CARD_MUTED} block px-4 py-3 text-[13px] text-muted`}>
          Live figures are unavailable right now. Everything below fills back in as soon as the
          connection returns.
        </output>
      ) : null}

      {/* The one number the page is about, then two it is compared with. */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={`${CARD} p-5`}>
          <p className={EYEBROW}>Fees paid to holders</p>
          <p className={`${NUM_LG} mt-2`}>{compactUsd(totals?.feesDistributedUsd)}</p>
          <p className={`${META} mt-2`}>
            across {count(totals?.vaults)} vaults · {count(totals?.uniqueStakers)} holders
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Stat
            label="Securitized"
            value={count(totals?.positionsSecuritized)}
            hint="locked positions"
          />
          <Stat label="Trading volume" value={compactUsd(totals?.dlmmVolumeUsd)} hint="all pools" />
        </div>
      </section>

      <Section
        title="Live vaults"
        description="One row per locked position that has been turned into shares."
      >
        {vaults.isPending ? (
          <div className={`${CARD_MUTED} h-24 animate-pulse motion-reduce:animate-none`} />
        ) : null}
        {vaults.data ? <VaultTable vaults={vaults.data.vaults} /> : null}
      </Section>

      {/* The explanation the page used to open with, folded away: the hero above answers "what is
          this worth to me" first, and the mechanics are here for whoever wants them. */}
      <details className={`${CARD} p-4 text-[13px]`}>
        <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
          Where the money comes from
        </summary>
        <ol className="mt-3 space-y-2 leading-6 text-muted">
          <li>
            <span className="text-ink">1.</span> A creator locks part of a Meteora pool&apos;s
            liquidity forever — nobody can withdraw it, not even them.
          </li>
          <li>
            <span className="text-ink">2.</span> Perpetua takes custody of that locked position and
            issues 1,000,000 shares against it.
          </li>
          <li>
            <span className="text-ink">3.</span> Every swap pays a fee; staked shares collect it,
            and you can claim whenever you like.
          </li>
        </ol>
      </details>
    </div>
  );
}
