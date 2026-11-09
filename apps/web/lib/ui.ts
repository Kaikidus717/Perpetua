export const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8";

/// Page rhythm. Every route uses this, so vertical spacing matches everywhere.
export const PAGE = "space-y-6 sm:space-y-8";

/// Type. Hierarchy comes from size and weight, never from colour — the accent is reserved for money.
export const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.1em] text-muted";
export const TITLE =
  "text-[28px] leading-tight font-semibold tracking-tight text-balance text-ink sm:text-[32px]";
export const LEDE = "max-w-2xl text-[13px] leading-6 text-muted";
export const H2 = "text-[13px] font-semibold text-ink";
export const NUM_LG = "tnum text-[34px] leading-none font-semibold tracking-tight text-ink";
export const NUM = "tnum text-[15px] font-medium text-ink";
export const META = "text-[11px] leading-4 text-muted";

/// One card style everywhere: hairline border, small radius, no shadow, no gradient.
export const CARD = "rounded-xl border border-line bg-panel";

/// A quieter card for empty states, notes and nested rows.
export const CARD_MUTED = "rounded-xl border border-line/70 bg-panel/40";

export const INPUT =
  "w-full rounded-lg border border-line bg-canvas px-3.5 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/30 sm:py-2.5 sm:text-[13px]";

export const INPUT_MONO = `${INPUT} font-mono`;

/// Buttons are one row high on a mouse and one thumb high on a phone.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none min-h-11 sm:min-h-9";

export const BUTTON = `${BUTTON_BASE} border border-line bg-canvas px-3.5 text-ink hover:border-muted`;

/// The accent is the one colour that means "you can act on this", so the primary action is the only
/// large area of it on any screen.
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-accent px-4 font-semibold text-canvas hover:bg-accent/90`;

/// A real but secondary action — "price a pool", "list the ladder". Cool teal, so a screen can carry
/// two actions without them both shouting in the same colour.
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-accent2/50 bg-accent2/10 px-3.5 font-medium text-accent2 hover:bg-accent2/20`;

/// For a third action in the same row: present, quiet, and never competing with the primary.
export const BUTTON_GHOST = `${BUTTON_BASE} px-2 text-muted hover:text-ink`;

/// Inline links are underlined rather than coloured, so the accent stays reserved for money.
export const LINK = "underline decoration-line underline-offset-2 hover:decoration-ink";

/// Small facts: a network, a kind, a status.
export const CHIP =
  "inline-flex items-center rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted";
export const CHIP_WARN =
  "inline-flex items-center rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn";

/// Tables survive only where a table is the honest shape (the ladder's exact bins).
export const TH =
  "border-b border-line px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted";
export const TH_RIGHT = `${TH} text-right`;
export const TD = "border-b border-line/70 px-3 py-2.5 align-middle text-[13px] text-ink";
export const TD_RIGHT = `${TD} text-right tnum`;
