/// The mark: a pool (the ring) with one slice of it filled (the wedge) — the product in one glyph.
///
/// Inlined rather than loaded from a file so it can read the theme's variables: a SVG behind an `<img>`
/// tag is isolated from the page and could not follow `--accent` / `--accent-2`. The background is
/// transparent by construction — there is no background rect — so it sits on the canvas, the panel and
/// the sticky header alike. `app/icon.svg` carries the same geometry with literal hex for the favicon,
/// where variables are unavailable.
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="rgb(var(--accent))" strokeWidth="3" />
      {/* The ring's own quarter turns with the wedge, so the filled slice and its arc read as one
          completed quarter instead of a teal blob wearing an orange outline. */}
      <path
        d="M16 3.5 A12.5 12.5 0 0 1 28.5 16"
        fill="none"
        stroke="rgb(var(--accent-2))"
        strokeWidth="3"
      />
      <path d="M16 16 L16 3.5 A12.5 12.5 0 0 1 28.5 16 Z" fill="rgb(var(--accent-2))" />
    </svg>
  );
}
