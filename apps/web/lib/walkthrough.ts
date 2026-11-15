/// The one-time walkthrough gate. `proxy.ts` and the root page both read this cookie; the
/// `I understand` button is the only thing that writes it.
export const WALKTHROUGH_COOKIE = "perpetua_walkthrough";
export const WALKTHROUGH_COOKIE_VALUE = "seen";
export const WALKTHROUGH_PATH = "/walkthrough";

export function walkthroughSeen(value: string | undefined): boolean {
  return value === WALKTHROUGH_COOKIE_VALUE;
}
