/// What a visitor reads when something goes wrong. Raw RPC and provider strings are for logs, not for
/// people: a failed swap should not hand someone a program error code and call it an answer.
export function humanError(cause: unknown, action: string): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (/proxy/i.test(detail)) {
    return "Your wallet extension refused the request. Reload the page and try again.";
  }
  if (/user rejected|rejected the request|declined|denied/i.test(detail)) {
    return "You declined the request.";
  }
  if (/insufficient|not enough|balance/i.test(detail)) {
    return "Not enough SOL in this wallet to cover the network fee.";
  }
  return `${action} didn't go through. Please try again.`;
}
