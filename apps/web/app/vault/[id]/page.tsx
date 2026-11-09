"use client";

import { Meter } from "@/components/Meter";
import { Section } from "@/components/Section";
import { SellShares } from "@/components/SellShares";
import { Spinner } from "@/components/Spinner";
import { VaultActions } from "@/components/VaultActions";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl } from "@/lib/format";
import { useWalletNetwork } from "@/lib/network";
import {
  BUTTON,
  CARD,
  CARD_MUTED,
  CHIP,
  EYEBROW,
  LEDE,
  LINK,
  META,
  NUM_LG,
  PAGE,
  TITLE,
} from "@/lib/ui";
import { useSolanaWallet } from "@/lib/wallet";
import { SHARE_SUPPLY } from "@perpetua/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

/// Stakes and claims land while the page is open, so keep re-reading.
const LIVE_MS = 15_000;

/// Balances arrive in base units (1,000,000 shares × 10^6). A raw integer beside the word "shares"
/// states a number with no unit, so it is converted here and labelled where it is printed.
function wholeShares(base: string): string {
  try {
    const value = (BigInt(base) * 1_000_000n) / SHARE_SUPPLY;
    return value.toLocaleString("en-US");
  } catch {
    return base;
  }
}

/// The same figure as a percentage of the 1,000,000 shares that exist.
function stakedPercent(base: string): number {
  try {
    return Number((BigInt(base) * 10_000n) / SHARE_SUPPLY) / 100;
  } catch {
    return 0;
  }
}

export default function VaultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const wallet = useSolanaWallet();
  const network = useWalletNetwork(wallet.address);

  const vault = useQuery({
    queryKey: ["vault", id],
    queryFn: () => api.vault(id),
    enabled: Boolean(id),
    refetchInterval: LIVE_MS,
  });
  const events = useQuery({
    queryKey: ["events", id],
    queryFn: () => api.events(id),
    enabled: Boolean(id),
    refetchInterval: LIVE_MS,
  });

  if (vault.isError) {
    return (
      <div className={PAGE}>
        <div className={`${CARD_MUTED} max-w-lg p-4`}>
          <p className="text-[13px] text-ink">We couldn&apos;t find that vault.</p>
          <p className={`${META} mt-1`}>
            Check the address — a vault link ends in its on-chain address, not its name.
          </p>
        </div>
      </div>
    );
  }

  const address = vault.data?.vault.address ?? id;
  const data = vault.data?.vault;

  return (
    <div className={PAGE}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={TITLE}>Vault</h1>
          {vault.isPending ? <Spinner label="Loading this vault" /> : null}
          {network.label ? <span className={CHIP}>{network.label} wallet</span> : null}
          {/* The next thing most people want from a vault they own: a way into the share flow. */}
          <Link href="/securitize" className={`${BUTTON} ml-auto`}>
            Create shares
          </Link>
        </div>
        <a
          href={explorerUrl(address)}
          target="_blank"
          rel="noreferrer"
          className={`break-all font-mono text-[12px] text-muted ${LINK}`}
        >
          {address} ↗
        </a>
        <p className={LEDE}>
          Hold shares to earn a slice of the fees this locked position keeps producing.
        </p>
        {/* A wallet on the wrong chain cannot sign anything below, and finding that out at the wallet
            is worse than reading it here. */}
        {network.cluster === "mainnet-beta" ? (
          <p className={`${META} text-warn`}>
            Staking, harvesting and selling shares need devnet — that is the only cluster the vault
            program is deployed on.
          </p>
        ) : null}
      </header>

      {data ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className={`${CARD} p-4`}>
            <p className={EYEBROW}>Shares staked</p>
            <p className={`${NUM_LG} mt-2`}>{wholeShares(data.totalStaked)}</p>
            <p className={`${META} mt-2`}>of 1,000,000 issued</p>
            <div className="mt-2">
              <Meter
                value={stakedPercent(data.totalStaked)}
                label={`${Math.round(stakedPercent(data.totalStaked))} percent of the shares are staked`}
                width="w-24"
              />
            </div>
          </div>
          <div className={`${CARD} p-4`}>
            <p className={EYEBROW}>Fees claimed A / B</p>
            <p className="tnum mt-2 text-[15px] text-ink">
              {data.totalClaimedA} / {data.totalClaimedB}
            </p>
            <p className={`${META} mt-1`}>base units of each fee token</p>
            <p className={`${META} mt-3`}>
              Share mint{" "}
              <a
                href={explorerUrl(data.shareMint)}
                target="_blank"
                rel="noreferrer"
                className={`font-mono ${LINK}`}
              >
                {shortAddress(data.shareMint)} ↗
              </a>
            </p>
          </div>
        </section>
      ) : null}

      <VaultActions vault={address} />

      {data ? <SellShares shareMint={data.shareMint} pool={data.pool} /> : null}

      <Section title="Activity" description="Stakes, harvests and claims, as they land on-chain.">
        {events.isPending ? (
          <p className={`${META} flex items-center gap-2`}>
            <Spinner label="Loading activity" />
            Loading activity…
          </p>
        ) : null}
        {events.data?.events.length === 0 ? (
          <p className={META}>Nothing has happened yet. Stake, then crank and harvest.</p>
        ) : null}
        {events.data && events.data.events.length > 0 ? (
          <ol className={`${CARD} divide-y divide-line`}>
            {events.data.events.map((event) => (
              <li
                key={`${event.signature}-${event.name}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/40"
                  />
                  <span className="truncate text-[13px] text-ink">{event.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`${META} tnum`}>slot {event.slot}</span>
                  <a
                    href={txUrl(event.signature)}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-mono text-[11px] text-muted ${LINK}`}
                  >
                    {shortAddress(event.signature)} ↗
                  </a>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </Section>

      {/* The three accounts, folded away: they are the proof behind the figures above, not the story. */}
      {data ? (
        <details className={`${CARD} p-4 text-[13px]`}>
          <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
            The accounts behind this vault
          </summary>
          <dl className="mt-3 divide-y divide-line">
            {[
              { label: "Pool", value: data.pool },
              { label: "Position", value: data.position },
              { label: "Creator", value: data.creator },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-muted">{row.label}</dt>
                <dd>
                  <a
                    href={explorerUrl(row.value)}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-mono text-[11px] ${LINK}`}
                  >
                    {shortAddress(row.value)} ↗
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
