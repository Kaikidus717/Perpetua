/// What a visitor reads when something goes wrong. Raw RPC and provider strings are for logs, not for
/// people: a failed swap should not hand someone a program error code and call it an answer.
///
/// The reverse matters just as much, and this file got it wrong first time round: collapsing every
/// unrecognised failure into "didn't go through. Please try again." hides failures that are *not*
/// transient — nothing staked, nothing to harvest, a transaction too large for the network — and sends
/// someone round a loop that cannot succeed. So every failure now says what it was, and the chain's own
/// words are attached rather than swallowed.

/// `PerpetuaError` in `programs/perpetua_vault/src/errors.rs`, in declaration order from 6000.
const PERPETUA_ERRORS: Record<number, string> = {
  6000: "This wallet is not allowed to do that for this vault.",
  6001: "That position still has unlocked liquidity. Split the permanently locked part out first, then create shares from it.",
  6002: "That position has no permanently locked liquidity, so there is no fee stream to turn into shares.",
  6003: "The share mint still has a mint authority, so the vault refused it.",
  6004: "That is more shares than this wallet has.",
  6005: "There are no fees to collect yet. Crank the claim once the pool has swap volume, then harvest — harvest only pays what a crank has already swept in.",
  6006: "That share mint does not belong to this vault.",
  6007: "The arithmetic overflowed. Try a smaller amount.",
  6008: "That pool does not match this vault.",
  6009: "Entry is paused right now. Staking and creating shares are closed; harvesting and unstaking still work.",
  6010: "One of the pool's fee mints carries a transfer hook, so the vault cannot take it.",
};

/// Anchor's own framework errors, which arrive without a name of ours attached.
const ANCHOR_ERRORS: Record<number, string> = {
  3007: "The account has not been initialised yet on the chain.",
  3012: "There is nothing staked here for this wallet yet — stake shares first, then harvest or unstake.",
  3015: "The transaction is missing a required signature. Reload the page and reconnect the wallet.",
  3017: "Too many accounts were passed in one instruction.",
};

const anchorName = (code: number): string => {
  const name = ANCHOR_ERRORS[code];
  return name ? ` ${name}` : "";
};

/// Pull the program error code out of whatever shape the RPC or the wallet wrapped it in.
function programErrorCode(detail: string): number | null {
  const hex = detail.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (hex?.[1]) return Number.parseInt(hex[1], 16);
  const numbered = detail.match(/Error Number: (\d+)/);
  if (numbered?.[1]) return Number.parseInt(numbered[1], 10);
  const custom = detail.match(/"Custom":\s*(\d+)/);
  if (custom?.[1]) return Number.parseInt(custom[1], 10);
  return null;
}

/// The sentence that explains a failure, or `null` when nothing here recognises it.
function explain(detail: string): string | null {
  // The wallet itself, which is not a chain failure at all.
  if (/proxy/i.test(detail)) {
    return "Your wallet extension refused the request. Reload the page and try again.";
  }
  if (/user rejected|rejected the request|declined|denied/i.test(detail)) {
    return "You declined the request.";
  }

  const code = programErrorCode(detail);
  if (code !== null) {
    if (PERPETUA_ERRORS[code]) return PERPETUA_ERRORS[code];
    if (ANCHOR_ERRORS[code]) return ANCHOR_ERRORS[code];
    // The System program's two, which appear as "custom program error: 0x0" / "0x1".
    if (code === 0) {
      return "The chain refused it: an account this transaction creates already exists. If this is a launch, the token was already created — launch with a fresh one.";
    }
    if (code === 1) {
      return "Not enough SOL in this wallet: the transaction creates accounts that need rent. Add SOL and try again.";
    }
    return `The program refused the transaction (error ${code}).${anchorName(code)}`;
  }

  if (/transaction too large|exceeds.*1232|packet.*too large/i.test(detail)) {
    return "That transaction is too large for the network to carry. Shorten the metadata link (the name, description or image URL) and try again.";
  }
  if (/blockhash not found|block height exceeded|has expired/i.test(detail)) {
    return "That request expired before it was signed. Try again.";
  }
  if (/already been processed/i.test(detail)) {
    return "That transaction was already submitted — check the explorer before sending it again.";
  }
  if (/insufficient|not enough|balance/i.test(detail)) {
    return "Not enough SOL in this wallet to cover the network fee.";
  }
  if (/no record of a prior credit|account not found|AccountNotFound/i.test(detail)) {
    return "That account does not exist on this network yet — check the wallet's network and try again.";
  }
  return null;
}

/// The chain's own words, trimmed to something that fits next to a sentence.
function summarize(detail: string): string {
  const line = detail
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("{") && !part.startsWith("["));
  return (line ?? detail.trim()).slice(0, 200);
}

export function humanError(cause: unknown, action: string): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const explained = explain(detail);
  if (explained) {
    // A recognised cause still carries the raw text: the first line is what a bug report needs, and
    // hiding it is how the "didn't go through" shrug happened in the first place.
    return `${explained} (${summarize(detail)})`;
  }
  return `${action} didn't go through. ${summarize(detail)}`;
}
