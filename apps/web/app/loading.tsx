export default function Loading() {
  return (
    <output className="block space-y-4" aria-label="Loading">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-72 animate-pulse rounded bg-panel" />
      <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-panel" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-lg border border-edge bg-panel" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-lg border border-edge bg-panel" />
    </output>
  );
}
