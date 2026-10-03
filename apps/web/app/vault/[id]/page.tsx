"use client";

import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress } from "@/lib/format";
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
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-200">
        Vault not found. It may not be indexed yet.
      </div>
    );
  }

  const address = vault.data?.vault.address ?? id;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Vault</h1>
        <a
          href={explorerUrl(address)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm text-accent"
        >
          {address}
        </a>
      </section>

      {vault.data ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total staked (base units)" value={vault.data.vault.totalStaked} />
          <Stat label="Fees claimed A (base units)" value={vault.data.vault.totalClaimedA} />
          <Stat label="Fees claimed B (base units)" value={vault.data.vault.totalClaimedB} />
          <Stat label="Share mint" value={shortAddress(vault.data.vault.shareMint)} />
        </section>
      ) : null}

      {vault.data ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">On-chain provenance</h2>
          <ul className="space-y-2 text-sm">
            {[
              { label: "Pool", value: vault.data.vault.pool },
              { label: "Position", value: vault.data.vault.position },
              { label: "Creator", value: vault.data.vault.creator },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between border-b border-edge pb-2"
              >
                <span className="text-slate-400">{row.label}</span>
                <a
                  href={explorerUrl(row.value)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-accent"
                >
                  {shortAddress(row.value)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Event feed</h2>
        {events.isPending ? <p className="text-sm text-slate-400">loading events…</p> : null}
        {events.data && events.data.events.length === 0 ? (
          <p className="text-sm text-slate-400">No events indexed yet.</p>
        ) : null}
        {events.data && events.data.events.length > 0 ? (
          <ul className="divide-y divide-edge rounded-lg border border-edge">
            {events.data.events.map((event) => (
              <li key={`${event.signature}-${event.name}`} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{event.name}</span>
                  <a
                    href={`https://solscan.io/tx/${event.signature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-accent"
                  >
                    {shortAddress(event.signature)}
                  </a>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-500">slot {event.slot}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border border-edge bg-panel p-5 text-sm text-slate-400">
        Staking and harvesting are signed by the holder&apos;s wallet. Connect a wallet from the
        Securitize page to run the flow, or use the keeper to crank claims for you.
      </section>
    </div>
  );
}
