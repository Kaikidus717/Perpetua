/// Shown when a value is genuinely unknown: not loaded yet, or the API is unreachable. Rendering a
/// zero in its place would state a fact we do not have.
export const UNKNOWN = "—";

export function usd(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

export function compactUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function pct(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${(value * 100).toFixed(digits)}%`;
}

/// Counts. A count we have not read yet is unknown, not zero.
export function count(value: number | undefined): string {
  return value === undefined ? UNKNOWN : String(value);
}

export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function explorerUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export function riskLabel(flag: string): string {
  return flag.replace(/_/g, " ");
}
