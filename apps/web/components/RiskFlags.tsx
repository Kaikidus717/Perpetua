import { riskLabel } from "@/lib/format";
import type { RiskFlag } from "@perpetua/shared";

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return <span className="text-sm text-accent">no risk flags</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300"
        >
          {riskLabel(flag)}
        </span>
      ))}
    </div>
  );
}
