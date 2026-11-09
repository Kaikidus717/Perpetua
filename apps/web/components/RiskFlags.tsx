import { riskLabel } from "@/lib/format";
import { CHIP_WARN, META } from "@/lib/ui";
import type { RiskFlag } from "@perpetua/shared";

/// Flags read left-aligned, in the reader's order, and never as a warning to be scrolled past: they
/// sit directly under the number they qualify.
export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return <span className={META}>No flags on this pool.</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <li key={flag} className={CHIP_WARN}>
          {riskLabel(flag)}
        </li>
      ))}
    </ul>
  );
}
