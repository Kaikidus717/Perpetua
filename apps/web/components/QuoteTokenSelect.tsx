"use client";

import { shortAddress } from "@/lib/format";
import { INPUT } from "@/lib/ui";

/// The tokens a market is normally quoted in. SOL is the safe default: wrapped SOL exists on both
/// devnet and mainnet. USDC differs per cluster, so both are listed.
export const QUOTE_TOKENS = [
  {
    label: "SOL",
    note: "wrapped SOL — works on devnet and mainnet",
    mint: "So11111111111111111111111111111111111111112",
  },
  {
    label: "USDC",
    note: "devnet USDC",
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
  {
    label: "USDC",
    note: "mainnet USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  {
    label: "USDT",
    note: "mainnet USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
] as const;

const CUSTOM = "__custom__";

/// A picker rather than a raw mint field: choose the token from a list, or paste a mint if it is not
/// one of the usual ones.
export function QuoteTokenSelect({
  value,
  onChange,
  label = "What buyers pay in",
}: {
  value: string;
  onChange: (mint: string) => void;
  label?: string;
}) {
  const preset = QUOTE_TOKENS.find((token) => token.mint === value);
  const selected = preset ? preset.mint : CUSTOM;

  return (
    <div className="space-y-2 text-sm">
      <span className="text-ink">{label}</span>
      <div className="flex flex-wrap gap-2">
        {QUOTE_TOKENS.map((token) => {
          const active = token.mint === value;
          return (
            <button
              key={`${token.label}-${token.mint}`}
              type="button"
              onClick={() => onChange(token.mint)}
              title={token.note}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                active
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-canvas text-ink hover:border-muted"
              }`}
            >
              {token.label}
              <span className={active ? "ml-2 text-white/60" : "ml-2 text-muted"}>
                {token.note.split(" — ")[0]}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            selected === CUSTOM
              ? "border-ink bg-ink text-white"
              : "border-line bg-canvas text-ink hover:border-muted"
          }`}
        >
          Custom
        </button>
      </div>

      {selected === CUSTOM ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          placeholder="paste a token mint address"
          className={`${INPUT} font-mono`}
        />
      ) : (
        <p className="font-mono text-xs text-muted">{shortAddress(value)}</p>
      )}
    </div>
  );
}
