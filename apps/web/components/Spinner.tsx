/// A slow request should look like work in progress, not a frozen page. This sits next to whatever
/// is being fetched and spins until the answer arrives.
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <output title={label} className="inline-flex">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink"
      />
      <span className="sr-only">{label}</span>
    </output>
  );
}
