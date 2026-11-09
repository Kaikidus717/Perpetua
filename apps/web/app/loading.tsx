/// The same shape as a real page — eyebrow, title, lede, then the content grid — so the skeleton
/// resolves into the page instead of jumping from a different layout.
export default function Loading() {
  const bar = "animate-pulse rounded bg-panel motion-reduce:animate-none";
  return (
    <output aria-label="Loading" className="block space-y-8">
      <span className="sr-only">Loading</span>
      <div className="space-y-3">
        <div className={`${bar} h-3 w-24`} />
        <div className={`${bar} h-7 w-80 max-w-full`} />
        <div className={`${bar} h-4 w-full max-w-xl`} />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={`${bar} h-28 rounded-xl border border-line`} />
        <div className="grid grid-cols-2 gap-4">
          <div className={`${bar} h-28 rounded-xl border border-line`} />
          <div className={`${bar} h-28 rounded-xl border border-line`} />
        </div>
      </div>
      <div className={`${bar} h-48 rounded-xl border border-line`} />
    </output>
  );
}
