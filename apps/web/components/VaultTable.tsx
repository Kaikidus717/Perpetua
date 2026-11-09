import { Meter } from "@/components/Meter";
import { explorerUrl, shortAddress } from "@/lib/format";
import { BUTTON, CARD_MUTED, LINK, META } from "@/lib/ui";
import { SHARE_SUPPLY } from "@perpetua/shared";
import type { VaultSummary } from "@perpetua/shared";
import Link from "next/link";

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

/// One vault, one row: identity on the left, the two figures that matter on the right. As a table this
/// needed five columns and a sideways scroll on a phone to say three things.
export function VaultTable({ vaults }: { vaults: VaultSummary[] }) {
  if (vaults.length === 0) {
    return (
      <div className={`${CARD_MUTED} p-4`}>
        <p className="text-[13px] text-ink">No vaults yet.</p>
        <p className={`${META} mt-1`}>
          A vault appears the moment a locked position is securitized on devnet.{" "}
          <Link href="/securitize" className={LINK}>
            Create the first one
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {vaults.map((vault) => (
        <li key={vault.address}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <a
                href={explorerUrl(vault.address)}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-[13px] text-ink ${LINK}`}
              >
                {shortAddress(vault.address)} ↗
              </a>
              <p className={`${META} truncate font-mono`}>pool {shortAddress(vault.pool)}</p>
            </div>

            {/* Wraps rather than forcing the page wider: three figures and a button do not fit one
                row on a phone, and a row that refuses to shrink pushed this whole list sideways. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="space-y-1">
                <p className={META}>Shares staked</p>
                <span className="flex items-center gap-2">
                  <span className="tnum text-[13px] text-ink">
                    {wholeShares(vault.totalStaked)}
                  </span>
                  <Meter
                    value={stakedPercent(vault.totalStaked)}
                    label={`${Math.round(stakedPercent(vault.totalStaked))} percent of the shares are staked`}
                    width="w-12"
                  />
                </span>
              </div>
              <div>
                <p className={META}>Fees A / B · base units</p>
                <p className="tnum text-[13px] text-ink">
                  {vault.totalClaimedA} / {vault.totalClaimedB}
                </p>
              </div>
              <Link href={`/vault/${vault.address}`} className={BUTTON}>
                Open
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
