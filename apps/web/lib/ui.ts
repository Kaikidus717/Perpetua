/// Shared class strings, so the header, the page column and every card on every route come out the
/// same size. Change a value here and the whole app follows.

/// The header, the main column and the footer all use this, which keeps the wordmark, the nav and
/// the page content on the same left edge on every route.
export const CONTAINER = "mx-auto w-full max-w-5xl px-6";

/// One card style everywhere: hairline border, small radius, no shadow, no gradient.
export const CARD = "rounded-md border border-line bg-canvas";

/// A quieter card for empty states and supporting notes.
export const CARD_MUTED = "rounded-md border border-line bg-panel";

export const INPUT =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-ink";

export const INPUT_MONO = `${INPUT} font-mono`;

export const BUTTON =
  "rounded-md border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink hover:border-muted disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_PRIMARY =
  "rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40";

/// Inline links are underlined rather than coloured, so the accent colour stays reserved for money.
export const LINK = "underline decoration-line underline-offset-2 hover:decoration-ink";

export const TH = "border-b border-line px-4 py-2.5 text-left text-xs font-medium text-muted";
export const TH_RIGHT = `${TH} text-right`;
export const TD = "border-b border-line px-4 py-3 align-middle";
export const TD_RIGHT = `${TD} text-right tnum`;

/// Page rhythm. Every route uses this, so vertical spacing matches everywhere.
export const PAGE = "space-y-10";
