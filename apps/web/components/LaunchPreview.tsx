"use client";

import { LineChart } from "@/components/LineChart";
import { money } from "@/lib/format";
import { CARD, EYEBROW, META } from "@/lib/ui";

export function LaunchPreview({
  parts,
  lockedPct,
  creatorTradingFeePct,
  network,
  perDay,
}: {
  parts: Array<{ label: string; value: number }>;
  lockedPct: number;
  creatorTradingFeePct: number;
  /// "devnet" | "mainnet-beta", as the header switch sets it.
  network: string;
  /// Your cut of the fees per day, at the assumptions set in step 1.
  perDay: number;
}) {
  const curve = Array.from({ length: 25 }, (_, index) => {
    const day = Math.round((index / 24) * 365);
    return { x: day, y: perDay * day };
  });

  return (
    <aside className={`${CARD} space-y-5 p-4 sm:p-5 lg:sticky lg:top-20`}>
      <div>
        <p className="text-[12px] font-medium text-ink">What this creates</p>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          A token, its bonding curve, and the pool that holds the split you chose.
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {parts.map((part, index) => (
          <li key={part.label} className="rounded-lg border border-line bg-canvas/60 px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-sm bg-ink"
                style={{ opacity: [1, 0.55, 0.25][index] }}
              />
              {part.label}
            </span>
            <span className="tnum mt-0.5 block text-[13px] font-medium text-ink">
              {part.value}%
            </span>
          </li>
        ))}
      </ul>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-medium text-ink">Fee income · first year</p>
          <span className="tnum text-[12px] text-ink">{money(perDay * 365)}</span>
        </div>
        <LineChart
          points={curve}
          className="h-44"
          label={`Fee income accumulating over 365 days, reaching ${money(perDay * 365)}`}
        />
        <div className="flex justify-between text-[11px] text-muted">
          <span>day 0</span>
          <span>day 365</span>
        </div>
        <p className={`${META} mt-1`}>
          Assumes the volume a day holds. {money(perDay)} a day at your assumptions.
        </p>
      </div>

      {/* The three horizons as bars under the curve: the curve shows the shape, these show the
          numbers a reader compares. */}
      <ul className="space-y-2.5">
        {[
          { days: 30, label: "30 days" },
          { days: 90, label: "90 days" },
          { days: 365, label: "1 year" },
        ].map((row) => {
          const value = perDay * row.days;
          const ceiling = Math.max(perDay * 365, 1);
          return (
            <li key={row.days}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-muted">{row.label}</span>
                <span className="tnum font-medium text-ink">{money(value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-ink/80"
                  style={{ width: `${Math.max((value / ceiling) * 100, 1.5)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="space-y-2 border-t border-line pt-4 text-[12px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Your fee cut</dt>
          <dd className="tnum text-ink">{creatorTradingFeePct}%</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Locked → shares</dt>
          <dd className="text-ink">1,000,000 per vault</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Network</dt>
          <dd className="text-ink">{network === "mainnet-beta" ? "mainnet" : network}</dd>
        </div>
      </dl>

      <p className={META}>
        The locked slice is the one that can be turned into shares later — everything else stays
        withdrawable by its owner.
      </p>
    </aside>
  );
}
