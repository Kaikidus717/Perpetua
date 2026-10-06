import { riskLabel } from "@/lib/format";
import type { RiskFlag } from "@perpetua/shared";

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return <span className="text-sm text-muted">No flags on this pool.</span>;
  }
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {flags.map((flag) => (
        <li
          key={flag}
          className="rounded-sm border border-line bg-panel px-2 py-1 text-xs text-warn"
        >
          {riskLabel(flag)}
        </li>
      ))}
    </ul>
  );
}
