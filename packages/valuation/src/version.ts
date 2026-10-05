export const MODEL_VERSION = "perpetua-valuation/1.1.0";

/// Deterministic 64-bit FNV-1a over a canonical JSON rendering, so any published number can
/// be traced back to the exact inputs that produced it.
export function inputsHash(input: unknown): string {
  const canonical = JSON.stringify(sortKeys(input));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries.map(([key, entry]) => [key, sortKeys(entry)]));
  }
  return value;
}
