export type SessionName = "pre" | "regular" | "post" | "overnight" | "closed";

export interface SessionWindow {
  name: Exclude<SessionName, "closed">;
  startMinute: number;
  endMinute: number;
}

/// Pyth equity sessions, Eastern Time.
/// VERIFY against https://docs.pyth.network/price-feeds/market-hours
export const SESSION_WINDOWS: SessionWindow[] = [
  { name: "pre", startMinute: 4 * 60, endMinute: 9 * 60 + 30 },
  { name: "regular", startMinute: 9 * 60 + 30, endMinute: 16 * 60 },
  { name: "post", startMinute: 16 * 60, endMinute: 20 * 60 },
  { name: "overnight", startMinute: 20 * 60, endMinute: 4 * 60 },
];

const OPEN_MINUTE = 4 * 60;
const EVENING_MINUTE = 20 * 60;

const EASTERN_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface EasternTime {
  weekday: number;
  minutes: number;
  dateKey: string;
}

export function easternTime(date: Date): EasternTime {
  const parts = EASTERN_FORMAT.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = WEEKDAYS[get("weekday")] ?? 0;
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    weekday,
    minutes: hour * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function isMarketHoliday(date: Date, holidays: ReadonlySet<string>): boolean {
  return holidays.has(easternTime(date).dateKey);
}

/// Which session the reference price is in. US market holidays collapse to `closed`.
export function sessionAt(date: Date, holidays: ReadonlySet<string> = new Set()): SessionName {
  const { weekday, minutes } = easternTime(date);
  if (weekday !== 0 && weekday !== 6 && holidays.has(easternTime(date).dateKey)) return "closed";

  if (weekday === 6) return "closed";
  if (weekday === 0) return minutes >= EVENING_MINUTE ? "overnight" : "closed";

  if (minutes < OPEN_MINUTE) return "overnight";
  if (minutes < 9 * 60 + 30) return "pre";
  if (minutes < 16 * 60) return "regular";
  if (minutes < EVENING_MINUTE) return "post";
  // Friday night has no overnight session; the reference is dark until Sunday 20:00.
  return weekday === 5 ? "closed" : "overnight";
}

export function isReferenceLive(date: Date, holidays: ReadonlySet<string> = new Set()): boolean {
  return sessionAt(date, holidays) !== "closed";
}

/// Hours until the reference next becomes live. Bounded by a 72h scan, which covers the
/// Friday 20:00 to Sunday 20:00 gap with room to spare.
export function hoursUntilOpen(
  date: Date,
  holidays: ReadonlySet<string> = new Set(),
  stepMinutes = 15,
): number {
  if (isReferenceLive(date, holidays)) return 0;
  const limit = 72 * 60;
  for (let elapsed = stepMinutes; elapsed <= limit; elapsed += stepMinutes) {
    const probe = new Date(date.getTime() + elapsed * 60_000);
    if (isReferenceLive(probe, holidays)) return elapsed / 60;
  }
  return limit / 60;
}

/// Splits a daily fee series into per-session totals.
export interface SessionSplit {
  pre: number;
  regular: number;
  post: number;
  overnight: number;
  closed: number;
}

export function splitFeesBySession(
  samples: Array<{ at: Date; feesUsd: number }>,
  holidays: ReadonlySet<string> = new Set(),
): SessionSplit {
  const totals: SessionSplit = { pre: 0, regular: 0, post: 0, overnight: 0, closed: 0 };
  for (const sample of samples) {
    totals[sessionAt(sample.at, holidays)] += sample.feesUsd;
  }
  return totals;
}

/// Staleness of the reference price: hours since the market last closed, zero while live.
export function referenceStalenessHours(
  date: Date,
  lastClosedAt: Date | null,
  holidays: ReadonlySet<string> = new Set(),
): number {
  if (isReferenceLive(date, holidays) || !lastClosedAt) return 0;
  return Math.max(0, (date.getTime() - lastClosedAt.getTime()) / 3_600_000);
}
