/// The mark is a supplied SVG asset, so it is loaded as an image rather than inlined. It lives at
/// `public/logo.svg` and `app/icon.svg` (the favicon) — the same file in both places, which is why the
/// favicon and the header mark can never drift apart.
///
/// The previous inline mark is kept beside this file as `Logo(1).tsx`; it read the theme's CSS variables,
/// which an external SVG cannot do, so if the mark ever needs to follow `--accent` again, that is the
/// version to restore.
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      className={`${className} object-contain`}
    />
  );
}
