import { explorerUrl, shortAddress, usd } from "@/lib/format";
import type { VaultSummary } from "@perpetua/shared";
import Link from "next/link";

export function VaultTable({ vaults }: { vaults: VaultSummary[] }) {
  if (vaults.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-panel p-6 text-sm text-slate-400">
        No vaults indexed yet. Securitize a locked position to create the first one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-edge">
      <table className="w-full text-left text-sm">
        <thead className="bg-panel text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Vault</th>
            <th className="px-4 py-3">Pool</th>
            <th className="px-4 py-3 text-right">Staked</th>
            <th className="px-4 py-3 text-right">Fees claimed</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault) => (
            <tr key={vault.address} className="border-t border-edge">
              <td className="px-4 py-3">
                <a
                  href={explorerUrl(vault.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-accent"
                >
                  {shortAddress(vault.address)}
                </a>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">
                {shortAddress(vault.pool)}
              </td>
              <td className="px-4 py-3 text-right">{vault.totalStaked}</td>
              <td className="px-4 py-3 text-right">
                {usd(Number(vault.totalClaimedA) + Number(vault.totalClaimedB), 0)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/vault/${vault.address}`} className="text-accent">
                  open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
