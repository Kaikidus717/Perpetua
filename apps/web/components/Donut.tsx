/// The split as a ring: three shares of one pool, in three weights of the same ink. Monochrome on
/// purpose — these are parts of a number, not categories, and the accent belongs to controls.
const SHADES = [1, 0.55, 0.25];

export function Donut({
  parts,
  caption,
  value,
}: {
  parts: Array<{ label: string; value: number }>;
  /// What the number in the middle means, e.g. "locked".
  caption: string;
  value: string;
}) {
  const total = parts.reduce((sum, part) => sum + Math.max(part.value, 0), 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={parts.map((part) => `${part.label} ${part.value} percent`).join(", ")}
      >
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(var(--line))" strokeWidth="10" />
        {parts.map((part, index) => {
          const length = (Math.max(part.value, 0) / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const highlighted = index === parts.length - 1;
          const circle = (
            <circle
              key={part.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={highlighted ? "rgb(var(--accent))" : "rgb(var(--ink))"}
              strokeOpacity={highlighted ? 1 : (SHADES[index] ?? 0.15)}
              strokeWidth="10"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-[18px] font-semibold leading-none text-ink">{value}</span>
        <span className="mt-1 text-[11px] uppercase tracking-wide text-muted">{caption}</span>
      </div>
    </div>
  );
}
