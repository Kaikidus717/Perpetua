import { customerError, customerLoadError, customerValidationError } from "@perpetua/shared";

/// The one place the web app turns a failure into a customer sentence. Raw details stage in the
/// console only. `action` is a lower-case verb phrase, for example "turn this position into shares".
export function humanError(cause: unknown, action: string): string {
  return customerError(cause, {
    action: action.charAt(0).toLowerCase() + action.slice(1),
  });
}

/// For read paths: vault lists, positions, fee history, activity. No transport or status details.
export function loadError(cause: unknown, thing: string): string {
  return customerLoadError(cause, thing);
}

export { customerValidationError };
