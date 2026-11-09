export function Meter({
  value,
  label,
  width = "w-16",
}: {
  /// 0–100.
  value: number;
  /// Read out by assistive technology in place of the bar.
  label: string;
  width?: string;
}) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-2">
      <span
        role="img"
        aria-label={label}
        className={`${width} h-1 overflow-hidden rounded-full bg-line`}
      >
        <span
          className="block h-full rounded-full bg-accent2/80"
          style={{ width: `${Math.max(percent, 1.5)}%` }}
        />
      </span>
      <span className="tnum text-[11px] text-muted">{Math.round(percent)}%</span>
    </span>
  );
}
