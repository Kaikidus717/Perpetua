"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { VaultActions } from "@/components/VaultActions";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress } from "@/lib/format";
import { CARD, CARD_MUTED, LINK, PAGE, TD, TH } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

export default function VaultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const vault = useQuery({
    queryKey: ["vault", id],
    queryFn: () => api.vault(id),
    enabled: Boolean(id),
  });
  const events = useQuery({
    queryKey: ["events", id],
    queryFn: () => api.events(id),
    enabled: Boolean(id),
  });

  if (vault.isError) {
    return (
      <div className={PAGE}>
        <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
          Vault not found. It may not be indexed yet.
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

      <a
        href={explorerUrl(address)}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-mono text-sm ${LINK}`}
      >
        {address}
      </a>

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
        {events.isPending ? <p className="text-sm text-muted">Loading activity…</p> : null}
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
                    href={`https://solscan.io/tx/${event.signature}`}
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
    </div>
  );
}
