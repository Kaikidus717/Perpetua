"use client";

import { LineChart } from "@/components/LineChart";
import { usd } from "@/lib/format";
import { CARD, EYEBROW, META } from "@/lib/ui";

export function PoolPreview({
  bins,
  binStep,
  shareLabel,
  quoteLabel,
}: {
  bins: Array<{ index: number; priceUsd: number; shares: number }>;
  /// The preset's bin step, when the page knows which preset is selected.
  binStep?: number;
  shareLabel: string;
  quoteLabel: string;
}) {
  if (bins.length === 0) {
    return <p className={META}>No ladder to preview yet.</p>;
  }

  const low = bins[0]?.priceUsd ?? 0;
  const high = bins[bins.length - 1]?.priceUsd ?? 0;
  const most = Math.max(...bins.map((bin) => bin.shares), 1);

  return (
    <div className={`${CARD} space-y-5 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className={EYEBROW}>Pool preview</p>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-muted">
          <span>
            Bin step <span className="tnum text-ink">{binStep ?? "—"}</span>
          </span>
          <span>
            Pair{" "}
            <span className="text-ink">
              {shareLabel} / {quoteLabel}
            </span>
          </span>
          <span>
            Bins <span className="tnum text-ink">{bins.length}</span>
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-ink">Price curve</p>
          <p className={`${META} tnum`}>
            {usd(low, 6)} → {usd(high, 6)}
          </p>
        </div>
        <LineChart
          points={bins.map((bin) => ({ x: bin.index, y: bin.priceUsd }))}
          className="h-20"
          label={`Ask price across ${bins.length} bins, from ${usd(low, 6)} to ${usd(high, 6)}`}
        />
        <p className={META}>How the ask price steps up across the ladder.</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-ink">Liquidity distribution</p>
          <p className={`${META} tnum`}>{Math.round(most)} max / bin</p>
        </div>
        <div
          className="mt-1 flex h-14 items-end gap-[2px]"
          role="img"
          aria-label="Shares offered in each bin"
        >
          {bins.map((bin) => (
            <span
              key={bin.index}
              aria-hidden="true"
              className="min-w-[2px] flex-1 rounded-t-sm bg-accent2/70"
              style={{ height: `${Math.max((bin.shares / most) * 100, 3)}%` }}
            />
          ))}
        </div>
        <p className={META}>Shares available at each price — the shape of the book.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-canvas/60">
            <tr>
              <th className="border-b border-line px-3 py-1.5 font-medium text-muted">Token</th>
              <th className="border-b border-line px-3 py-1.5 font-medium text-muted">Role</th>
              <th className="border-b border-line px-3 py-1.5 text-right font-medium text-muted">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { token: shareLabel, role: "Offered — what buyers receive", price: high },
              { token: quoteLabel, role: "Paid — what buyers spend", price: 1 },
            ].map((row) => (
              <tr key={row.role}>
                <td className="border-b border-line/60 px-3 py-1.5 font-mono text-ink">
                  {row.token}
                </td>
                <td className="border-b border-line/60 px-3 py-1.5 text-muted">{row.role}</td>
                <td className="tnum border-b border-line/60 px-3 py-1.5 text-right text-ink">
                  {usd(row.price, 6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
