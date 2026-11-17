/// Customer-facing error text. Keep raw RPC, JSON, stack and program-code text out of the UI.
/// Raw details still go to the console or server logs.

const PROGRAM_ERRORS: Record<number, string> = {
  6000: "This wallet can't do that for this vault.",
  6001: "This position can still be withdrawn. Split off the locked part, then try again.",
  6002: "This position has nothing locked forever, so there are no fees to turn into shares.",
  6003: "This vault could still create more shares. Try a different share token.",
  6004: "This wallet has fewer shares than that. Enter a smaller amount.",
  6005: "No fees are ready to collect. First collect the pool's fees, then collect yours.",
  6006: "That share token belongs to a different vault.",
  6007: "That amount is too large. Try a smaller number.",
  6008: "That pool doesn't match this vault. Reload the page and try again.",
  6009: "New shares and staking are paused. You can still exit or collect fees.",
  6010: "This pool's token blocks transfers, so Perpetua can't create shares for it.",
};

const ANCHOR_ERRORS: Record<number, string> = {
  3007: "This account isn't ready yet. Reload the page and try again.",
  3012: "This wallet has no shares staked here. Stake shares first.",
  3015: "Your wallet didn't sign the transaction. Reconnect and try again.",
  3017: "This transaction has too many accounts. Reload the page and try again.",
};

const RAW_MARKERS =
  /jsonrpc|custom program error|error number|program log|transaction simulation|instructionerror|0x[0-9a-f]|stack trace|at .*\.(ts|js):\d+|failed with \d{3}/i;

function detailOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause ?? "");
}

function programCode(detail: string): number | null {
  const hex = detail.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (hex?.[1]) return Number.parseInt(hex[1], 16);
  const numbered = detail.match(/Error Number: (\d+)/);
  if (numbered?.[1]) return Number.parseInt(numbered[1], 10);
  const custom = detail.match(/"Custom":\s*(\d+)/);
  if (custom?.[1]) return Number.parseInt(custom[1], 10);
  return null;
}

export interface CustomerErrorOptions {
  /// Lower-case verb phrase, for example "turn this position into shares".
  action: string;
  /// True only when a transaction was definitely sent and the result is unknown.
  sent?: boolean;
}

/// Turn any write failure into one sentence a customer can act on.
export function customerError(cause: unknown, options: CustomerErrorOptions): string {
  const detail = detailOf(cause);

  if (/proxy/i.test(detail)) {
    return "Your wallet extension blocked the request. Reload the page and reconnect.";
  }
  if (/user rejected|rejected the request|declined|denied|reject/i.test(detail)) {
    return "You declined the request. Nothing was sent.";
  }
  if (/connect (a|your) wallet/i.test(detail)) {
    return "Connect your wallet in the header to continue.";
  }
  if (/wallet cannot sign|can't sign/i.test(detail)) {
    return "This wallet can't sign transactions. Try a different wallet.";
  }

  const code = programCode(detail);
  if (code !== null) {
    if (PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
    if (ANCHOR_ERRORS[code]) return ANCHOR_ERRORS[code];
    if (code === 0) return "That token already exists. Launch with a new token.";
    if (code === 1) {
      return "This wallet doesn't have enough SOL for network fees. Add SOL and try again.";
    }
    return "The program rejected this transaction. Reload the page and try again.";
  }

  if (/the chain refused this transaction/i.test(detail)) {
    return "This transaction would fail before you sign. Nothing was sent. Try again.";
  }
  if (/transaction too large|1232|packet.*too large/i.test(detail)) {
    return "The token details are too long. Shorten the description or image link and try again.";
  }
  if (/blockhash not found|block height exceeded|has expired|expired/i.test(detail)) {
    return "The request expired before you signed. Nothing was sent. Try again.";
  }
  if (/already been processed/i.test(detail)) {
    return "This transaction was already sent. Check Explorer before sending it again.";
  }
  if (/insufficient|not enough|no record of a prior credit|debit/i.test(detail)) {
    return "This wallet doesn't have enough SOL for network fees. Add SOL and try again.";
  }
  if (
    /failed to fetch|fetch failed|\bnetwork (error|request|connection)\b|econnrefused|enotfound|timeout|timed out/i.test(
      detail,
    )
  ) {
    return "We couldn't reach Perpetua. Check your connection and try again.";
  }
  if (/data api|fee history|meteora.*data/i.test(detail)) {
    return "Meteora's fee data service isn't responding. Try again in a moment.";
  }
  if (/\b(rpc|solana|node)\b/i.test(detail) || /\b(429|502|503)\b/.test(detail)) {
    return "Solana isn't responding right now. Try again in a moment.";
  }

  /// An API sentence that is already written for a person is safe to show as-is.
  if (!RAW_MARKERS.test(detail) && /^[A-Z].*[.!?]$/.test(detail) && detail.length <= 220) {
    return detail;
  }

  if (options.sent) {
    return `We couldn't confirm ${options.action}. Check your wallet before trying again.`;
  }
  return `We couldn't ${options.action}. Try again. If your wallet shows a pending transaction, check it before sending again.`;
}

/// Turn a read failure into one sentence. Never expose the transport or status code.
export function customerLoadError(cause: unknown, thing: string): string {
  const detail = detailOf(cause);
  if (
    /failed to fetch|fetch failed|\bnetwork (error|request|connection)\b|econnrefused|enotfound|timeout|timed out/i.test(
      detail,
    )
  ) {
    return "We couldn't reach Perpetua. Check your connection and try again.";
  }
  if (!RAW_MARKERS.test(detail) && /^[A-Z].*[.!?]$/.test(detail) && detail.length <= 220) {
    return detail;
  }
  if (/\b404\b|not found/i.test(detail)) return `We couldn't find ${thing}.`;
  if (/data api|fee history|meteora.*data/i.test(detail)) {
    return "Meteora's fee data service isn't responding. Try again in a moment.";
  }
  if (/\b(rpc|solana|node)\b/i.test(detail) || /\b(429|502|503)\b/.test(detail)) {
    return "Solana isn't responding right now. Try again in a moment.";
  }
  return `We couldn't load ${thing}. Try again.`;
}

/// Validation errors arrive as a list. One sentence, no field paths or parser language.
export function customerValidationError(fields: string[] = []): string {
  const first = fields[0];
  if (first && /^[a-zA-Z]+$/.test(first)) return `Check the ${first} value and try again.`;
  return "Check the values in this request and try again.";
}
