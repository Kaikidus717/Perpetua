import { usd } from "@/lib/format";

export function LadderHistogram({
  bins,
}: {
  bins: Array<{ index: number; priceUsd: number; shares: number }>;
}) {
  if (bins.length === 0) {
    return <p className="text-[12px] text-muted">This plan produced no price bins.</p>;
  }

  const most = Math.max(...bins.map((bin) => bin.shares), 1);
  const low = bins[0]?.priceUsd;
  const high = bins[bins.length - 1]?.priceUsd;

  return (
    <div
      role="img"
      aria-label={`Ask ladder: ${bins.length} price bins from ${usd(low, 6)} to ${usd(
        high,
        6,
      )}, largest bin ${Math.round(most)} shares.`}
      className="flex h-24 items-end gap-[2px]"
    >
      {bins.map((bin) => (
        <span
          key={bin.index}
          aria-hidden="true"
          className="min-w-[2px] flex-1 rounded-t-sm bg-ink/35"
          style={{ height: `${Math.max((bin.shares / most) * 100, 3)}%` }}
        />
      ))}
    </div>
  );
}
