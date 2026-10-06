export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas p-4 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum mt-1.5 text-xl font-semibold text-ink">{value}</div>
      {hint ? <div className="tnum mt-1 text-xs leading-5 text-muted">{hint}</div> : null}
    </div>
  );
}
