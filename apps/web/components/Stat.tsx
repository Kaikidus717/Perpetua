import { EYEBROW } from "@/lib/ui";

/// One figure with its label and, when it earns it, one line of context. Left-aligned: a row of
/// centred numbers turns a comparison into a hunt, and these are meant to be compared.
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className={EYEBROW}>{label}</div>
      <div className="tnum mt-2 text-[22px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[11px] leading-4 text-muted">{hint}</div> : null}
    </div>
  );
}
