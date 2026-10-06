import { explorerUrl, shortAddress } from "@/lib/format";
import { CARD_MUTED, LINK, TD, TD_RIGHT, TH, TH_RIGHT } from "@/lib/ui";
import type { VaultSummary } from "@perpetua/shared";
import Link from "next/link";

export function VaultTable({ vaults }: { vaults: VaultSummary[] }) {
  if (vaults.length === 0) {
    return (
      <div className={`${CARD_MUTED} px-6 py-12 text-center text-sm text-muted`}>
        No vaults yet. Create one from a locked position.
      </div>
    );
  }

  return (
    <div className={`${CARD_MUTED} overflow-hidden`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-panel">
          <tr>
            <th className={TH}>Vault</th>
            <th className={TH}>Pool</th>
            <th className={TH_RIGHT}>Shares staked</th>
            <th className={TH_RIGHT}>Fees claimed A / B</th>
            <th className={TH_RIGHT}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault) => (
            <tr key={vault.address}>
              <td className={`${TD} font-mono text-xs`}>
                <a
                  href={explorerUrl(vault.address)}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  {shortAddress(vault.address)}
                </a>
              </td>
              <td className={`${TD} font-mono text-xs text-muted`}>{shortAddress(vault.pool)}</td>
              <td className={TD_RIGHT}>{vault.totalStaked}</td>
              <td className={TD_RIGHT}>
                {vault.totalClaimedA} / {vault.totalClaimedB}
              </td>
              <td className={TD_RIGHT}>
                <Link href={`/vault/${vault.address}`} className={LINK}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
