/// The optional first-visit tour prompt. The home page reads this cookie; the prompt writes it
/// when someone takes the tour or dismisses the prompt.
export const WALKTHROUGH_COOKIE = "perpetua_walkthrough";
export const WALKTHROUGH_COOKIE_VALUE = "seen";

export function walkthroughSeen(value: string | undefined): boolean {
  return value === WALKTHROUGH_COOKIE_VALUE;
}
