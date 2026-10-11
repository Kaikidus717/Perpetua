"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { SellShares } from "@/components/SellShares";
import { Spinner } from "@/components/Spinner";
import { Stat } from "@/components/Stat";
import { VaultActions } from "@/components/VaultActions";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl } from "@/lib/format";
import { useWalletNetwork } from "@/lib/network";
import { CARD, CARD_MUTED, LINK, PAGE, TD, TH } from "@/lib/ui";
import { useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

/// Stakes and claims land while the page is open, so keep re-reading.
const LIVE_MS = 15_000;

export default function VaultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  /// Which network the visitor's wallet signs on, said once at the top of the page. Every action here
  /// is a devnet transaction, because that is the only cluster the vault program is deployed on — so
  /// it is worth knowing before the buttons further down stop making sense.
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
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          We couldn&apos;t find that vault. Check the address and try again.
        </div>
      </div>
    );
  }

  const address = vault.data?.vault.address ?? id;

  return (
    <div className={PAGE}>
      <PageHeader
        title="Vault"
        description="Hold shares to earn a slice of the fees this position keeps producing."
      />

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={explorerUrl(address)}
          target="_blank"
          rel="noreferrer"
          className={`break-all font-mono text-sm ${LINK}`}
        >
          {address}
        </a>
        {vault.isPending ? <Spinner label="Loading this vault" /> : null}
      </div>

      {network.label ? (
        <p className="text-xs text-muted">
          Your wallet is on {network.label}.{" "}
          {network.cluster === "mainnet-beta"
            ? "Staking, harvesting and selling shares need devnet, because that is where the vault program lives."
            : "Staking, harvesting and selling shares all work here."}
        </p>
      ) : null}

      {vault.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Shares staked" value={vault.data.vault.totalStaked} />
          <Stat label="Fees claimed A" value={vault.data.vault.totalClaimedA} />
          <Stat label="Fees claimed B" value={vault.data.vault.totalClaimedB} />
          <Stat label="Share mint" value={shortAddress(vault.data.vault.shareMint)} />
        </div>
      ) : null}

      {vault.data ? (
        <Section title="Where the money comes from" description="Every address is public.">
          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-left text-sm">
              <thead className="bg-panel">
                <tr>
                  <th className={TH}>Account</th>
                  <th className={`${TH} text-right`}>Address</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Pool", value: vault.data.vault.pool },
                  { label: "Position", value: vault.data.vault.position },
                  { label: "Creator", value: vault.data.vault.creator },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className={TD}>{row.label}</td>
                    <td className={`${TD} text-right`}>
                      <a
                        href={explorerUrl(row.value)}
                        target="_blank"
                        rel="noreferrer"
                        className={`font-mono text-xs ${LINK}`}
                      >
                        {shortAddress(row.value)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title="Activity" description="Stakes, harvests and claims, as they land on-chain.">
        {events.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner label="Loading activity" />
            Loading activity…
          </p>
        ) : null}
        {events.data && events.data.events.length === 0 ? (
          <p className="text-sm text-muted">Nothing has happened yet.</p>
        ) : null}
        {events.data && events.data.events.length > 0 ? (
          <ul className={`${CARD} divide-y divide-line`}>
            {events.data.events.map((event) => (
              <li key={`${event.signature}-${event.name}`} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-ink">{event.name}</span>
                  <a
                    href={txUrl(event.signature)}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-mono text-xs ${LINK}`}
                  >
                    {shortAddress(event.signature)}
                  </a>
                </div>
                <div className="tnum mt-1 text-xs text-muted">slot {event.slot}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <VaultActions vault={address} />

      {vault.data ? (
        <SellShares shareMint={vault.data.vault.shareMint} pool={vault.data.vault.pool} />
      ) : null}
    </div>
  );
}
