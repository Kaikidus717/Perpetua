export function LineChart({
  points,
  label,
  className = "h-28",
}: {
  /// Any units; normalised to the box.
  points: Array<{ x: number; y: number }>;
  /// Read out by assistive technology; a canvas of pixels says nothing on its own.
  label: string;
  className?: string;
}) {
  if (points.length < 2) {
    return <p className="text-[11px] text-muted">Not enough points to draw.</p>;
  }

  const width = 100;
  const height = 40;
  const maxX = Math.max(...points.map((point) => point.x), 1);
  const maxY = Math.max(...points.map((point) => point.y), 1);
  const scaled = points.map((point) => ({
    x: (point.x / maxX) * width,
    y: height - (point.y / maxY) * (height - 4) - 2,
  }));

  const path = scaled.reduce((path, point, index, all) => {
    if (index === 0) return `M${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    const previous = all[index - 1] ?? point;
    const midX = (previous.x + point.x) / 2;
    return `${path} C${midX.toFixed(2)},${previous.y.toFixed(2)} ${midX.toFixed(2)},${point.y.toFixed(2)} ${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }, "");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`w-full ${className}`}
    >
      <path d={`${path} L${width},${height} L0,${height} Z`} fill="rgb(var(--accent) / 0.12)" />
      <path
        d={path}
        fill="none"
        stroke="rgb(var(--accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
